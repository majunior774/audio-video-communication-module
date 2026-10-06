
import {createServer} from "http";
import { Server } from "socket.io";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import StreamRouter from "./Routes/StreamRoute.js";

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

//socket connection
io.on("connection",(socket)=>{
    console.log(`Connected: ${socket.id}`);

    socket.on("join-room",(roomId)=>{
        console.log(`user wants to join ${roomId}`);

        // Who is already in this room?
        const existingUsers = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
        // Tell ONLY the new user
        socket.emit("existing-users", existingUsers);

        socket.join(roomId);

        //telling everyone
        socket.to(roomId).emit("user-joined",socket.id);

        console.log(`user:${socket.id} is in room ${roomId}`);
    })
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

    socket.on("disconnect",()=>{
        console.log(`Disconnected: ${socket.id}`);
    })
})

//routing 
app.use('/',StreamRouter);


app.get("/", (req, res) => {
    res.send("Backend is running 🚀");
});


mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connected");
        server.listen(process.env.PORT,"0.0.0.0", () => {
            console.log(`Server running on port http://localhost:${process.env.PORT}`);
            console.log(`-----------------------------------`);
            
        });
    })
    .catch((err) => {
        console.error("MongoDB connection failed:", err);
    });