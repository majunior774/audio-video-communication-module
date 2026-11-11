const BOARD_SIZE = 1000;
const MAX_ROOM_ID_LENGTH = 128;
const MAX_OPERATION_ID_LENGTH = 128;
const MAX_POINTS_PER_EVENT = 256;
const MAX_POINTS_PER_STROKE = 10000;
const MAX_OBJECT_TEXT_LENGTH = 2000;
const OBJECT_TYPES = new Set(["rectangle", "circle", "line", "arrow", "text", "sticky"]);
const DRAW_PHASES = new Set(["start", "points", "end", "cancel"]);
const OBJECT_ACTIONS = new Set(["add", "update", "delete"]);
const COLOR_PATTERN = /^#[\da-f]{6}$/i;

const boards = new Map();

function isRoomId(value) {
    return typeof value === "string" &&
        value.length > 0 &&
        value.length <= MAX_ROOM_ID_LENGTH;
}

function isId(value, maxLength = MAX_OPERATION_ID_LENGTH) {
    return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoardCoordinate(value) {
    return Number.isFinite(value) && value >= 0 && value <= BOARD_SIZE;
}

function isColor(value) {
    return typeof value === "string" && COLOR_PATTERN.test(value);
}

function isRoomMember(socket, roomId) {
    return isRoomId(roomId) && socket.rooms.has(roomId);
}

function getBoard(roomId) {
    if (!boards.has(roomId)) {
        boards.set(roomId, {
            objects: [],
            history: [],
            redo: [],
            activeStrokes: new Map(),
            revision: 0,
        });
    }

    return boards.get(roomId);
}

function emitError(socket, message) {
    socket.emit("whiteboard:error", { message });
}

function validatePoint(point) {
    return point &&
        typeof point === "object" &&
        isBoardCoordinate(point.x) &&
        isBoardCoordinate(point.y);
}

function validateObject(value) {
    if (
        !value ||
        typeof value !== "object" ||
        !isId(value.id) ||
        !OBJECT_TYPES.has(value.type) ||
        !["x", "y", "width", "height"].every((key) => Number.isFinite(value[key])) ||
        !isBoardCoordinate(value.x) ||
        !isBoardCoordinate(value.y) ||
        value.width < 0 ||
        value.height < 0 ||
        value.x + value.width > BOARD_SIZE ||
        value.y + value.height > BOARD_SIZE ||
        !isColor(value.color) ||
        !Number.isFinite(value.size) ||
        value.size < 1 ||
        value.size > 32 ||
        ((value.type === "line" || value.type === "arrow") &&
            ["reverseX", "reverseY"].some((key) =>
                value[key] !== undefined && typeof value[key] !== "boolean"
            ))
    ) {
        return null;
    }

    if (
        (value.type === "text" || value.type === "sticky") &&
        (
            typeof value.text !== "string" ||
            value.text.length > MAX_OBJECT_TEXT_LENGTH ||
            (value.fontSize !== undefined &&
                (!Number.isFinite(value.fontSize) || value.fontSize < 8 || value.fontSize > 96))
        )
    ) {
        return null;
    }

    return {
        id: value.id,
        type: value.type,
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        color: value.color,
        size: value.size,
        ...((value.type === "line" || value.type === "arrow")
            ? {
                reverseX: value.reverseX === true,
                reverseY: value.reverseY === true,
            }
            : {}),
        ...((value.type === "text" || value.type === "sticky") &&
            value.fontSize !== undefined
            ? { fontSize: value.fontSize }
            : {}),
        ...(value.text !== undefined ? { text: value.text } : {}),
    };
}

function applyObjectAction(board, action, forward) {
    if (action.kind === "replace") {
        board.objects = forward ? [...action.after] : [...action.before];
        return;
    }

    const object = forward ? action.after : action.before;
    const objectId = action.objectId;
    const existingIndex = board.objects.findIndex((item) => item.id === objectId);

    if (existingIndex !== -1) {
        board.objects.splice(existingIndex, 1);
    }

    if (object) {
        if (existingIndex === -1) {
            board.objects.push(object);
        } else {
            board.objects.splice(existingIndex, 0, object);
        }
    }
}

function commitAction(board, action) {
    applyObjectAction(board, action, true);
    board.history.push(action);
    board.redo = [];
    board.revision += 1;
    return board.revision;
}

function registerWhiteboardHandlers(io, socket) {
    socket.on("whiteboard:join", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid whiteboard join request.");
            return;
        }
        const { roomId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "Join the call room before joining its whiteboard.");
            return;
        }

        const board = getBoard(roomId);
        socket.emit("whiteboard:state", {
            roomId,
            objects: board.objects,
            activeStrokes: Array.from(board.activeStrokes.values(), (stroke) => ({
                operationId: stroke.operationId,
                color: stroke.color,
                size: stroke.size,
                tool: stroke.tool,
                points: stroke.points,
            })),
            revision: board.revision,
        });
    });

    socket.on("whiteboard:draw", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid drawing operation.");
            return;
        }
        const { roomId, operationId, phase, points = [] } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this whiteboard's call room.");
            return;
        }

        if (
            !isId(operationId) ||
            !DRAW_PHASES.has(phase) ||
            !Array.isArray(points) ||
            points.length > MAX_POINTS_PER_EVENT ||
            !points.every(validatePoint)
        ) {
            emitError(socket, "Invalid drawing operation.");
            return;
        }

        const board = getBoard(roomId);
        let stroke = board.activeStrokes.get(operationId);

        if (phase === "start") {
            if (
                stroke ||
                board.objects.some((object) => object.id === operationId) ||
                !isColor(payload.color) ||
                !Number.isFinite(payload.size) ||
                payload.size < 1 ||
                payload.size > 32 ||
                !["pen", "eraser"].includes(payload.tool) ||
                points.length !== 1
            ) {
                emitError(socket, "Invalid drawing start.");
                return;
            }

            stroke = {
                operationId,
                owner: socket.id,
                color: payload.color,
                size: payload.size,
                tool: payload.tool,
                points: [...points],
            };
            board.activeStrokes.set(operationId, stroke);
        } else {
            if (!stroke || stroke.owner !== socket.id) {
                emitError(socket, "Drawing operation not found.");
                return;
            }

            if (
                (phase === "points" && points.length === 0) ||
                stroke.points.length + points.length > MAX_POINTS_PER_STROKE
            ) {
                emitError(socket, "Drawing operation exceeds its limits.");
                return;
            }

            stroke.points.push(...points);
            if (phase === "end" || phase === "cancel") {
                board.activeStrokes.delete(operationId);
            }
        }

        const event = {
            roomId,
            operationId,
            phase,
            color: stroke.color,
            size: stroke.size,
            tool: stroke.tool,
            points: [...points],
        };

        if (phase === "end") {
            const object = {
                id: operationId,
                type: "stroke",
                color: stroke.color,
                size: stroke.size,
                tool: stroke.tool,
                points: stroke.points,
            };
            event.revision = commitAction(board, {
                kind: "object",
                objectId: operationId,
                before: null,
                after: object,
            });
        }

        socket.to(roomId).emit("whiteboard:draw", event);
    });

    socket.on("whiteboard:object-update", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid object update.");
            return;
        }
        const { roomId, action, objectId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this whiteboard's call room.");
            return;
        }

        if (!OBJECT_ACTIONS.has(action) || !isId(objectId)) {
            emitError(socket, "Invalid object update.");
            return;
        }

        const board = getBoard(roomId);
        const existing = board.objects.find((item) => item.id === objectId) ?? null;
        const object = action === "delete" ? null : validateObject(payload.object);

        if (
            (action === "add" && (existing || !object || object.id !== objectId)) ||
            (action === "update" && (!existing || !object || object.id !== objectId)) ||
            (action === "delete" && !existing)
        ) {
            emitError(socket, "Object update does not match the current board.");
            return;
        }

        const revision = commitAction(board, {
            kind: "object",
            objectId,
            before: existing,
            after: object,
        });
        socket.to(roomId).emit("whiteboard:object-update", {
            roomId,
            action,
            objectId,
            ...(object ? { object } : {}),
            revision,
        });
    });

    socket.on("whiteboard:undo", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid undo request.");
            return;
        }
        const { roomId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this whiteboard's call room.");
            return;
        }

        const board = getBoard(roomId);
        const action = board.history.pop();
        if (!action) {
            socket.emit("whiteboard:error", { message: "There is nothing to undo." });
            return;
        }

        applyObjectAction(board, action, false);
        board.redo.push(action);
        board.revision += 1;
        const event = { roomId, objects: board.objects, revision: board.revision };
        socket.to(roomId).emit("whiteboard:undo", event);
        socket.emit("whiteboard:undo", event);
    });

    socket.on("whiteboard:redo", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid redo request.");
            return;
        }
        const { roomId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this whiteboard's call room.");
            return;
        }

        const board = getBoard(roomId);
        const action = board.redo.pop();
        if (!action) {
            socket.emit("whiteboard:error", { message: "There is nothing to redo." });
            return;
        }

        applyObjectAction(board, action, true);
        board.history.push(action);
        board.revision += 1;
        const event = { roomId, objects: board.objects, revision: board.revision };
        socket.to(roomId).emit("whiteboard:redo", event);
        socket.emit("whiteboard:redo", event);
    });

    socket.on("whiteboard:clear", (payload = {}) => {
        if (!isRecord(payload)) {
            emitError(socket, "Invalid clear request.");
            return;
        }
        const { roomId } = payload;
        if (!isRoomMember(socket, roomId)) {
            emitError(socket, "You are not a member of this whiteboard's call room.");
            return;
        }

        const board = getBoard(roomId);
        for (const [operationId] of board.activeStrokes) {
            socket.to(roomId).emit("whiteboard:draw", {
                roomId,
                operationId,
                phase: "cancel",
            });
        }
        board.activeStrokes.clear();
        if (board.objects.length === 0) {
            return;
        }

        const revision = commitAction(board, {
            kind: "replace",
            before: [...board.objects],
            after: [],
        });
        socket.to(roomId).emit("whiteboard:clear", { roomId, revision });
    });

    socket.on("disconnecting", () => {
        for (const roomId of socket.rooms) {
            if (roomId === socket.id) {
                continue;
            }

            const board = boards.get(roomId);
            if (board) {
                for (const [operationId, stroke] of board.activeStrokes) {
                    if (stroke.owner === socket.id) {
                        board.activeStrokes.delete(operationId);
                        socket.to(roomId).emit("whiteboard:draw", {
                            roomId,
                            operationId,
                            phase: "cancel",
                        });
                    }
                }
            }

            if (io.sockets.adapter.rooms.get(roomId)?.size === 1) {
                boards.delete(roomId);
            }
        }
    });
}

export default registerWhiteboardHandlers;
