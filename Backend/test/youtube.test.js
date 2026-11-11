import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import registerYouTubeHandlers from "../src/youtube.js";

class FakeSocket {
    constructor(id, roomId, sockets) {
        this.id = id;
        this.rooms = new Set([id, roomId]);
        this.sockets = sockets;
        this.handlers = new Map();
        this.sent = [];
        this.received = [];
    }

    on(name, handler) {
        this.handlers.set(name, handler);
    }

    emit(name, payload) {
        this.sent.push({ name, payload });
    }

    to(roomId) {
        return {
            emit: (name, payload) => {
                for (const recipient of this.sockets.values()) {
                    if (recipient !== this && recipient.rooms.has(roomId)) {
                        recipient.received.push({ name, payload });
                    }
                }
            },
        };
    }

    trigger(name, payload) {
        this.handlers.get(name)?.(payload);
    }

    lastSent(name) {
        return [...this.sent].reverse().find((event) => event.name === name);
    }

    lastReceived(name) {
        return [...this.received].reverse().find((event) => event.name === name);
    }
}

function createRoom(roomId = `youtube-test-${randomUUID()}`) {
    const members = new Set();
    const sockets = new Map();
    const io = {
        sockets: {
            adapter: {
                rooms: new Map([[roomId, members]]),
            },
        },
    };

    const createSocket = (id) => {
        members.add(id);
        const socket = new FakeSocket(id, roomId, sockets);
        sockets.set(id, socket);
        registerYouTubeHandlers(io, socket);
        return socket;
    };

    return { roomId, io, members, createSocket };
}

test("shares YouTube playback state with room participants and late joiners", () => {
    const { roomId, createSocket } = createRoom();
    const sharer = createSocket("sharer");
    const participant = createSocket("participant");
    const lateJoiner = createSocket("late-joiner");

    sharer.trigger("youtube:join", { roomId });
    assert.equal(sharer.lastSent("youtube:state").payload.videoId, null);

    sharer.trigger("youtube:share", { roomId, videoId: "dQw4w9WgXcQ" });
    assert.equal(sharer.lastSent("youtube:state").payload.videoId, "dQw4w9WgXcQ");
    assert.equal(participant.lastReceived("youtube:state").payload.videoId, "dQw4w9WgXcQ");
    assert.equal(participant.lastReceived("youtube:state").payload.playing, false);

    sharer.trigger("youtube:control", {
        roomId,
        action: "play",
        position: 15,
    });
    const playingState = participant.lastReceived("youtube:state").payload;
    assert.equal(playingState.playing, true);
    assert.ok(playingState.position >= 15);
    assert.equal(sharer.lastSent("youtube:state").payload.playing, true);

    lateJoiner.trigger("youtube:join", { roomId });
    assert.equal(lateJoiner.lastSent("youtube:state").payload.videoId, "dQw4w9WgXcQ");
    assert.equal(lateJoiner.lastSent("youtube:state").payload.playing, true);
    assert.ok(lateJoiner.lastSent("youtube:state").payload.position >= 15);
});

test("synchronizes seeks, playback rates, pause, and shared removal", () => {
    const { roomId, createSocket } = createRoom();
    const first = createSocket("first");
    const second = createSocket("second");

    first.trigger("youtube:share", { roomId, videoId: "dQw4w9WgXcQ" });
    second.trigger("youtube:control", { roomId, action: "play", position: 10 });
    second.trigger("youtube:control", { roomId, action: "seek", position: 72.5 });
    assert.equal(first.lastReceived("youtube:state").payload.position, 72.5);
    assert.equal(first.lastReceived("youtube:state").payload.playing, true);

    second.trigger("youtube:control", { roomId, action: "rate", playbackRate: 1.5 });
    const rateState = first.lastReceived("youtube:state").payload;
    assert.equal(rateState.playbackRate, 1.5);
    assert.ok(rateState.position >= 72.5, "changing playback speed retains the current position");

    second.trigger("youtube:control", {
        roomId,
        action: "pause",
        position: rateState.position,
    });
    assert.equal(first.lastReceived("youtube:state").payload.playing, false);

    second.trigger("youtube:clear", { roomId });
    assert.equal(first.lastReceived("youtube:state").payload.videoId, null);
});

test("rejects invalid video ids, unauthorized rooms, and unsupported controls", () => {
    const roomA = createRoom(`youtube-a-${randomUUID()}`);
    const roomB = createRoom(`youtube-b-${randomUUID()}`);
    const first = roomA.createSocket("first");
    const outsider = roomB.createSocket("outsider");

    first.trigger("youtube:share", { roomId: roomA.roomId, videoId: "bad id" });
    assert.match(first.lastSent("youtube:error").payload.message, /valid YouTube/);

    first.trigger("youtube:share", { roomId: roomA.roomId, videoId: "dQw4w9WgXcQ" });
    outsider.trigger("youtube:control", {
        roomId: roomA.roomId,
        action: "pause",
        position: 0,
    });
    assert.match(outsider.lastSent("youtube:error").payload.message, /not a member/);

    first.trigger("youtube:control", {
        roomId: roomA.roomId,
        action: "rate",
        playbackRate: 9,
    });
    assert.match(first.lastSent("youtube:error").payload.message, /Unsupported/);
});

test("cleans in-memory playback state when the last room participant disconnects", () => {
    const { roomId, createSocket } = createRoom();
    const first = createSocket("first");
    first.trigger("youtube:share", { roomId, videoId: "dQw4w9WgXcQ" });

    first.trigger("disconnecting");
    const nextMeeting = createSocket("next-meeting");
    nextMeeting.trigger("youtube:join", { roomId });
    assert.equal(nextMeeting.lastSent("youtube:state").payload.videoId, null);
});
