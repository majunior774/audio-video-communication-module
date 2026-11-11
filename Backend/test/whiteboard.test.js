import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import registerWhiteboardHandlers from "../src/whiteboard.js";

class FakeSocket {
    constructor(id, roomId, sockets) {
        this.id = id;
        this.rooms = new Set([id, roomId]);
        this.sockets = sockets;
        this.handlers = new Map();
        this.sent = [];
        this.received = [];
        this.broadcasts = [];
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
                this.broadcasts.push({ roomId, name, payload });
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

    lastBroadcast(name) {
        return [...this.broadcasts].reverse().find((event) => event.name === name);
    }
}

function createRoom(roomId = `whiteboard-test-${randomUUID()}`) {
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
        registerWhiteboardHandlers(io, socket);
        return socket;
    };

    return { roomId, io, members, createSocket };
}

const pointA = { x: 10, y: 20 };
const pointB = { x: 30, y: 40 };

test("broadcasts incremental strokes only to room peers and snapshots late joiners", () => {
    const { roomId, createSocket } = createRoom();
    const author = createSocket("author");
    const peer = createSocket("peer");
    const lateJoiner = createSocket("late-joiner");
    const operationId = "stroke-1";

    author.trigger("whiteboard:join", { roomId });
    assert.deepEqual(author.lastSent("whiteboard:state").payload.objects, []);

    author.trigger("whiteboard:draw", {
        roomId,
        operationId,
        phase: "start",
        color: "#123456",
        size: 4,
        tool: "pen",
        points: [pointA],
    });
    author.trigger("whiteboard:draw", {
        roomId,
        operationId,
        phase: "points",
        points: [pointB],
    });
    author.trigger("whiteboard:draw", {
        roomId,
        operationId,
        phase: "end",
        points: [],
    });

    assert.equal(author.lastBroadcast("whiteboard:draw").roomId, roomId);
    assert.equal(author.lastBroadcast("whiteboard:draw").payload.phase, "end");
    assert.equal(author.lastReceived("whiteboard:draw"), undefined);
    assert.equal(peer.lastReceived("whiteboard:draw").payload.phase, "end");

    lateJoiner.trigger("whiteboard:join", { roomId });
    const snapshot = lateJoiner.lastSent("whiteboard:state").payload;
    assert.equal(snapshot.objects.length, 1);
    assert.equal(snapshot.objects[0].points.length, 2);
    assert.equal(peer.lastReceived("whiteboard:draw").payload.roomId, roomId);
});

test("isolates room state and rejects events from sockets outside the requested room", () => {
    const roomA = createRoom(`whiteboard-a-${randomUUID()}`);
    const roomB = createRoom(`whiteboard-b-${randomUUID()}`);
    const memberA = roomA.createSocket("member-a");
    const memberB = roomB.createSocket("member-b");

    memberA.trigger("whiteboard:object-update", {
        roomId: roomA.roomId,
        action: "add",
        objectId: "shape-1",
        object: {
            id: "shape-1",
            type: "rectangle",
            x: 20,
            y: 30,
            width: 100,
            height: 80,
            color: "#abcdef",
            size: 3,
        },
    });

    memberB.trigger("whiteboard:join", { roomId: roomB.roomId });
    assert.deepEqual(memberB.lastSent("whiteboard:state").payload.objects, []);

    memberB.trigger("whiteboard:clear", { roomId: roomA.roomId });
    assert.match(memberB.lastSent("whiteboard:error").payload.message, /not a member/);
});

test("stores text box dimensions and font size for synchronized text objects", () => {
    const { roomId, createSocket } = createRoom();
    const author = createSocket("author");
    const peer = createSocket("peer");
    const textObject = {
        id: "text-1",
        type: "text",
        x: 40,
        y: 50,
        width: 520,
        height: 280,
        color: "#123456",
        size: 4,
        fontSize: 48,
        text: "Agenda",
    };

    author.trigger("whiteboard:object-update", {
        roomId,
        action: "add",
        objectId: textObject.id,
        object: textObject,
    });

    assert.equal(peer.lastReceived("whiteboard:object-update").payload.object.width, 520);
    assert.equal(peer.lastReceived("whiteboard:object-update").payload.object.height, 280);
    assert.equal(peer.lastReceived("whiteboard:object-update").payload.object.fontSize, 48);

    author.trigger("whiteboard:object-update", {
        roomId,
        action: "update",
        objectId: textObject.id,
        object: { ...textObject, fontSize: 120 },
    });

    assert.equal(author.lastSent("whiteboard:error").payload.message, "Object update does not match the current board.");
    assert.equal(peer.lastReceived("whiteboard:object-update").payload.object.fontSize, 48);
});

test("keeps undo, redo, clear, and clear undo authoritative for the room", () => {
    const { roomId, createSocket } = createRoom();
    const author = createSocket("author");
    const peer = createSocket("peer");

    author.trigger("whiteboard:draw", {
        roomId,
        operationId: "stroke-2",
        phase: "start",
        color: "#123456",
        size: 4,
        tool: "pen",
        points: [pointA],
    });
    author.trigger("whiteboard:draw", {
        roomId,
        operationId: "stroke-2",
        phase: "end",
        points: [],
    });
    author.trigger("whiteboard:object-update", {
        roomId,
        action: "add",
        objectId: "shape-2",
        object: {
            id: "shape-2",
            type: "circle",
            x: 50,
            y: 60,
            width: 80,
            height: 80,
            color: "#abcdef",
            size: 3,
        },
    });

    peer.trigger("whiteboard:undo", { roomId });
    assert.equal(peer.lastSent("whiteboard:undo").payload.objects.length, 1);
    assert.equal(author.lastReceived("whiteboard:undo").payload.objects.length, 1);
    peer.trigger("whiteboard:redo", { roomId });
    assert.equal(peer.lastSent("whiteboard:redo").payload.objects.length, 2);
    assert.equal(author.lastReceived("whiteboard:redo").payload.objects.length, 2);

    peer.trigger("whiteboard:clear", { roomId });
    assert.equal(peer.lastBroadcast("whiteboard:clear").roomId, roomId);
    assert.equal(peer.sent.some((event) => event.name === "whiteboard:clear"), false);
    assert.equal(author.lastReceived("whiteboard:clear").payload.roomId, roomId);
    peer.trigger("whiteboard:undo", { roomId });
    assert.equal(peer.lastSent("whiteboard:undo").payload.objects.length, 2);
});

test("rejects malformed payloads and cancels unfinished strokes on clear or disconnect", () => {
    const { roomId, createSocket } = createRoom();
    const author = createSocket("author");
    const peer = createSocket("peer");
    const lateJoiner = createSocket("late-joiner");

    assert.doesNotThrow(() => author.trigger("whiteboard:clear", null));
    assert.equal(author.lastSent("whiteboard:error").payload.message, "Invalid clear request.");

    author.trigger("whiteboard:draw", {
        roomId,
        operationId: "unfinished-clear",
        phase: "start",
        color: "#123456",
        size: 4,
        tool: "pen",
        points: [pointA],
    });
    author.trigger("whiteboard:clear", { roomId });
    assert.equal(author.lastBroadcast("whiteboard:draw").payload.phase, "cancel");
    assert.equal(peer.lastReceived("whiteboard:draw").payload.phase, "cancel");

    author.trigger("whiteboard:draw", {
        roomId,
        operationId: "unfinished-disconnect",
        phase: "start",
        color: "#123456",
        size: 4,
        tool: "pen",
        points: [pointA],
    });
    author.trigger("disconnecting");
    assert.equal(author.lastBroadcast("whiteboard:draw").payload.phase, "cancel");
    assert.equal(author.lastBroadcast("whiteboard:draw").payload.operationId, "unfinished-disconnect");
    assert.equal(peer.lastReceived("whiteboard:draw").payload.operationId, "unfinished-disconnect");

    lateJoiner.trigger("whiteboard:join", { roomId });
    assert.deepEqual(lateJoiner.lastSent("whiteboard:state").payload.activeStrokes, []);
});
