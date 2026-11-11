const MAX_ROOM_ID_LENGTH = 128;
const MAX_POSITION_SECONDS = 24 * 60 * 60;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYBACK_RATES = new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
const CONTROL_ACTIONS = new Set(["play", "pause", "seek", "rate"]);

const videoRooms = new Map();

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRoomId(value) {
    return typeof value === "string" &&
        value.length > 0 &&
        value.length <= MAX_ROOM_ID_LENGTH;
}

function isRoomMember(socket, roomId) {
    return isRoomId(roomId) && socket.rooms.has(roomId);
}

function emitError(socket, message) {
    socket.emit("youtube:error", { message });
}

function getRoomState(roomId) {
    if (!videoRooms.has(roomId)) {
        videoRooms.set(roomId, {
            videoId: null,
            position: 0,
            playing: false,
            playbackRate: 1,
            updatedAt: Date.now(),
            updatedBy: null,
            revision: 0,
        });
    }

    return videoRooms.get(roomId);
}

function createSnapshot(roomId, state) {
    const now = Date.now();
    const elapsed = state.playing ? (now - state.updatedAt) / 1000 : 0;

    return {
        roomId,
        videoId: state.videoId,
        position: Math.min(
            MAX_POSITION_SECONDS,
            Math.max(0, state.position + elapsed * state.playbackRate)
        ),
        playing: state.playing,
        playbackRate: state.playbackRate,
        updatedAt: now,
        updatedBy: state.updatedBy,
        revision: state.revision,
    };
}

function sendState(socket, roomId, state) {
    const snapshot = createSnapshot(roomId, state);
    socket.emit("youtube:state", snapshot);
    socket.to(roomId).emit("youtube:state", snapshot);
}

function registerYouTubeHandlers(io, socket) {
    socket.on("youtube:join", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid watch-together join request.");
            return;
        }

        const { roomId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "Join the call room before joining watch-together.");
            return;
        }

        socket.emit("youtube:state", createSnapshot(roomId, getRoomState(roomId)));
    });

    socket.on("youtube:share", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid YouTube video request.");
            return;
        }

        const { roomId, videoId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this call room.");
            return;
        }
        if (typeof videoId !== "string" || !VIDEO_ID_PATTERN.test(videoId)) {
            emitError(socket, "Enter a valid YouTube video link or ID.");
            return;
        }

        const state = getRoomState(roomId);
        state.videoId = videoId;
        state.position = 0;
        state.playing = false;
        state.playbackRate = 1;
        state.updatedAt = Date.now();
        state.updatedBy = socket.id;
        state.revision += 1;
        sendState(socket, roomId, state);
    });

    socket.on("youtube:control", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid playback control request.");
            return;
        }

        const { roomId, action } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this call room.");
            return;
        }
        if (!CONTROL_ACTIONS.has(action)) {
            emitError(socket, "Invalid playback control.");
            return;
        }

        const state = getRoomState(roomId);
        if (!state.videoId) {
            emitError(socket, "Share a YouTube video before controlling playback.");
            return;
        }

        if (state.playing) {
            state.position = createSnapshot(roomId, state).position;
        }

        if (action === "rate") {
            if (!PLAYBACK_RATES.has(payload.playbackRate)) {
                emitError(socket, "Unsupported YouTube playback speed.");
                return;
            }
            state.playbackRate = payload.playbackRate;
        } else {
            if (
                !Number.isFinite(payload.position) ||
                payload.position < 0 ||
                payload.position > MAX_POSITION_SECONDS
            ) {
                emitError(socket, "Invalid YouTube playback position.");
                return;
            }
            state.position = payload.position;
            if (action === "play") state.playing = true;
            if (action === "pause") state.playing = false;
        }

        state.updatedAt = Date.now();
        state.updatedBy = socket.id;
        state.revision += 1;
        sendState(socket, roomId, state);
    });

    socket.on("youtube:clear", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid stop-video request.");
            return;
        }

        const { roomId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this call room.");
            return;
        }

        const state = getRoomState(roomId);
        state.videoId = null;
        state.position = 0;
        state.playing = false;
        state.playbackRate = 1;
        state.updatedAt = Date.now();
        state.updatedBy = socket.id;
        state.revision += 1;
        sendState(socket, roomId, state);
    });

    socket.on("disconnecting", () => {
        for (const roomId of socket.rooms) {
            if (
                roomId !== socket.id &&
                io.sockets.adapter.rooms.get(roomId)?.size === 1
            ) {
                videoRooms.delete(roomId);
            }
        }
    });
}

export default registerYouTubeHandlers;
