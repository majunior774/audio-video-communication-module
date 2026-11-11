
import {createServer} from "http";
import { Server } from "socket.io";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import StreamRouter from "./Routes/StreamRoute.js";
import registerWhiteboardHandlers from "./whiteboard.js";
import registerYouTubeHandlers from "./youtube.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

//socket.io configration
const server = createServer(app);
const io = new Server(server,{
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const screenShares = new Map();

//socket connection
io.on("connection",(socket)=>{
    console.log(`Connected: ${socket.id}`);
    registerWhiteboardHandlers(io, socket);
    registerYouTubeHandlers(io, socket);

    socket.on("join-room",(roomId)=>{
        console.log(`user wants to join ${roomId}`);

        // Who is already in this room?
        const existingUsers = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
        // Tell ONLY the new user
        socket.emit("existing-users", existingUsers);

        socket.join(roomId);

        for (const [userId, share] of screenShares.get(roomId) ?? []) {
            socket.emit("screen-share:state", {
                roomId,
                userId,
                sharing: true,
                ...share,
            });
        }

        //telling everyone
        socket.to(roomId).emit("user-joined",socket.id);

        console.log(`user:${socket.id} is in room ${roomId}`);
    })
    socket.on("screen-share:state", (payload = {}) => {
        const { roomId, sharing, streamId, trackMids } = payload;
        if (
            typeof roomId !== "string" ||
            roomId.length === 0 ||
            roomId.length > 128 ||
            !socket.rooms.has(roomId) ||
            typeof sharing !== "boolean" ||
            (sharing && (
                typeof streamId !== "string" ||
                streamId.length === 0 ||
                streamId.length > 128 ||
                !trackMids ||
                typeof trackMids !== "object" ||
                Array.isArray(trackMids) ||
                Object.keys(trackMids).length > 128 ||
                Object.values(trackMids).some((mids) =>
                    !mids ||
                    typeof mids !== "object" ||
                    Array.isArray(mids) ||
                    (mids.video !== null && typeof mids.video !== "string") ||
                    (mids.audio !== null && typeof mids.audio !== "string")
                )
            ))
        ) {
            socket.emit("screen-share:error", {
                message: "Invalid screen-share state update.",
            });
            return;
        }

        if (!screenShares.has(roomId)) screenShares.set(roomId, new Map());
        const roomShares = screenShares.get(roomId);
        if (sharing) {
            roomShares.set(socket.id, { streamId, trackMids });
        } else {
            roomShares.delete(socket.id);
            if (roomShares.size === 0) screenShares.delete(roomId);
        }

        socket.to(roomId).emit("screen-share:state", {
            roomId,
            userId: socket.id,
            sharing,
            streamId: sharing ? streamId : null,
            trackMids: sharing ? trackMids : null,
        });
    });
    //webRTC set up
    socket.on("offer",({offer,target})=>{
        io.to(target).emit("offer",{offer,from:socket.id})
    })
    socket.on("answer",({answer,target})=>{
        io.to(target).emit("answer",{answer,from:socket.id})
    })

    //ice candidates
    socket.on("candidate",({candidate,target})=>{
        io.to(target).emit("candidate",{candidate,from:socket.id});
    })

    socket.on("disconnecting",()=>{
        for (const roomId of socket.rooms) {
            if (roomId !== socket.id) {
                socket.to(roomId).emit("user-left",socket.id);
                const roomShares = screenShares.get(roomId);
                if (roomShares?.delete(socket.id)) {
                    socket.to(roomId).emit("screen-share:state", {
                        roomId,
                        userId: socket.id,
                        sharing: false,
                        streamId: null,
                    });
                    if (roomShares.size === 0) screenShares.delete(roomId);
                }
            }
        }
    })

    socket.on("disconnect",()=>{
        console.log(`Disconnected: ${socket.id}`);
    })
})

//routing 
app.use('/',StreamRouter);


app.get("/", (req, res) => {
    res.send("Backend is running 🚀");
});

server.listen(process.env.PORT,"0.0.0.0", () => {
    console.log(`Server running on port http://localhost:${process.env.PORT}`);
    console.log(`-----------------------------------`);
    
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connected");
        
    })
    .catch((err) => {
        console.error("MongoDB connection failed:", err);
    });