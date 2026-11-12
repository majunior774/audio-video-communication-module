import { useCallback, useEffect, useRef, useState } from 'react';
import './Whiteboard.css';

const BOARD_WIDTH = 1000;
const BOARD_HEIGHT = 700;
const DEFAULT_COLOR = '#2563eb';
const COLOR_SWATCHES = ['#18181b', '#ef4444', '#f97316', '#22c55e', '#2563eb', '#a855f7'];
const TOOL_OPTIONS = [
  ['select', 'Select'],
  ['pen', 'Pen'],
  ['eraser', 'Eraser'],
  ['line', 'Line'],
  ['arrow', 'Arrow'],
  ['rectangle', 'Rectangle'],
  ['circle', 'Circle'],
  ['text', 'Text'],
  ['sticky', 'Sticky note'],
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ??
    `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makePath(points) {
  if (!points.length) return '';
  return points.map(({ x, y }, index) =>
    `${index === 0 ? 'M' : 'L'} ${x} ${y}`
  ).join(' ');
}

function drawActiveStroke(context, stroke, widthScale) {
  const { points } = stroke;
  if (!points.length) return;

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  if (points.length === 1) {
    context.lineTo(points[0].x + 0.01, points[0].y + 0.01);
  }
  context.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
  context.lineWidth = stroke.size * widthScale;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}

function drawActiveSegment(context, stroke, previous, point, widthScale) {
  context.beginPath();
  context.moveTo(previous.x, previous.y);
  context.lineTo(point.x, point.y);
  context.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
  context.lineWidth = stroke.size * widthScale;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}

function isShapeTool(tool) {
  return ['line', 'arrow', 'rectangle', 'circle'].includes(tool);
}

function getObjectText(object) {
  return typeof object.text === 'string' ? object.text : '';
}

export default function Whiteboard({ socket, roomId, onClose }) {
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [size, setSize] = useState(4);
  const [objects, setObjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [gestureKind, setGestureKind] = useState(null);
  const [error, setError] = useState('');
  const [textEditor, setTextEditor] = useState(null);
  const [connected, setConnected] = useState(Boolean(socket?.connected));
  const [synced, setSynced] = useState(false);
  const svgRef = useRef(null);
  const activeCanvasRef = useRef(null);
  const activeStrokesRef = useRef(new Map());
  const strokeRef = useRef(null);
  const textResizeRef = useRef(null);
  const pendingPointsRef = useRef([]);
  const flushFrameRef = useRef(null);
  const gestureRef = useRef(null);
  const revisionRef = useRef(0);

  const boardPoint = useCallback((event) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return null;
    return {
      x: Math.max(0, Math.min(BOARD_WIDTH, ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH)),
      y: Math.max(0, Math.min(BOARD_HEIGHT, ((event.clientY - bounds.top) / bounds.height) * BOARD_HEIGHT)),
    };
  }, []);

  const redrawActiveStrokes = useCallback(() => {
    const canvas = activeCanvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg) return;

    const bounds = svg.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(
      (bounds.width * ratio) / BOARD_WIDTH,
      0,
      0,
      (bounds.height * ratio) / BOARD_HEIGHT,
      0,
      0
    );
    context.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    const widthScale = bounds.width > 0 ? BOARD_WIDTH / bounds.width : 1;
    for (const stroke of activeStrokesRef.current.values()) {
      drawActiveStroke(context, stroke, widthScale);
    }
  }, []);

  const syncBoardState = useCallback((state) => {
    if (state.roomId !== roomId || !Array.isArray(state.objects)) return;
    revisionRef.current = state.revision ?? 0;
    setObjects(state.objects);
    setSelectedId(null);
    setSynced(true);
    activeStrokesRef.current.clear();
    for (const stroke of state.activeStrokes ?? []) {
      activeStrokesRef.current.set(stroke.operationId, stroke);
    }
    redrawActiveStrokes();
  }, [redrawActiveStrokes, roomId]);

  useEffect(() => {
    if (!socket) return undefined;

    const joinBoard = () => {
      setConnected(true);
      setSynced(false);
      setError('');
      socket.emit('whiteboard:join', { roomId });
    };
    const onState = (state) => syncBoardState(state);
    const onDraw = (event) => {
      if (event.roomId !== roomId) return;
      const active = activeStrokesRef.current;

      if (event.phase === 'start') {
        active.set(event.operationId, {
          operationId: event.operationId,
          color: event.color,
          size: event.size,
          tool: event.tool,
          points: [...event.points],
        });
      } else if (event.phase === 'points') {
        const stroke = active.get(event.operationId);
        if (stroke) stroke.points.push(...event.points);
      } else if (event.phase === 'end') {
        const stroke = active.get(event.operationId);
        if (stroke) {
          const completed = {
            id: event.operationId,
            type: 'stroke',
            color: stroke.color,
            size: stroke.size,
            tool: stroke.tool,
            points: stroke.points,
          };
          setObjects((current) => [...current, completed]);
          active.delete(event.operationId);
        }
        if (Number.isFinite(event.revision)) revisionRef.current = event.revision;
      } else if (event.phase === 'cancel') {
        active.delete(event.operationId);
      }

      redrawActiveStrokes();
    };
    const onObjectUpdate = (event) => {
      if (event.roomId !== roomId) return;
      if (Number.isFinite(event.revision)) revisionRef.current = event.revision;
      if (event.action === 'delete') {
        setSelectedId((selected) => selected === event.objectId ? null : selected);
      }
      setObjects((current) => {
        if (event.action === 'delete') {
          return current.filter((object) => object.id !== event.objectId);
        }
        if (event.action === 'add') return [...current, event.object];
        return current.map((object) =>
          object.id === event.objectId ? event.object : object
        );
      });
    };
    const onBoardSnapshot = (event) => {
      if (event.roomId !== roomId) return;
      if (Number.isFinite(event.revision)) revisionRef.current = event.revision;
      setObjects(event.objects);
      setSelectedId(null);
    };
    const onClear = (event) => {
      if (event.roomId !== roomId) return;
      if (Number.isFinite(event.revision)) revisionRef.current = event.revision;
      setObjects([]);
      setSelectedId(null);
      activeStrokesRef.current.clear();
      redrawActiveStrokes();
    };
    const onError = ({ message }) => setError(message);
    const onConnectError = () => {
      setConnected(false);
      setSynced(false);
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }
      activeStrokesRef.current.clear();
      redrawActiveStrokes();
      strokeRef.current = null;
      pendingPointsRef.current = [];
      gestureRef.current = null;
      setGestureKind(null);
      setPreview(null);
    };

    socket.on('connect', joinBoard);
    socket.on('whiteboard:state', onState);
    socket.on('whiteboard:draw', onDraw);
    socket.on('whiteboard:object-update', onObjectUpdate);
    socket.on('whiteboard:undo', onBoardSnapshot);
    socket.on('whiteboard:redo', onBoardSnapshot);
    socket.on('whiteboard:clear', onClear);
    socket.on('whiteboard:error', onError);
    socket.on('disconnect', onConnectError);

    if (socket.connected) joinBoard();

    return () => {
      if (strokeRef.current && socket.connected) {
        socket.emit('whiteboard:draw', {
          roomId,
          operationId: strokeRef.current.operationId,
          phase: 'cancel',
          points: [],
        });
      }
      socket.off('connect', joinBoard);
      socket.off('whiteboard:state', onState);
      socket.off('whiteboard:draw', onDraw);
      socket.off('whiteboard:object-update', onObjectUpdate);
      socket.off('whiteboard:undo', onBoardSnapshot);
      socket.off('whiteboard:redo', onBoardSnapshot);
      socket.off('whiteboard:clear', onClear);
      socket.off('whiteboard:error', onError);
      socket.off('disconnect', onConnectError);
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
    };
  }, [redrawActiveStrokes, roomId, socket, syncBoardState]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(redrawActiveStrokes);
    observer.observe(svg);
    redrawActiveStrokes();
    return () => observer.disconnect();
  }, [redrawActiveStrokes]);

  const flushPoints = useCallback(() => {
    flushFrameRef.current = null;
    const stroke = strokeRef.current;
    if (!stroke || pendingPointsRef.current.length === 0) return;

    const points = pendingPointsRef.current;
    pendingPointsRef.current = [];
    stroke.points.push(...points);
    for (let index = 0; index < points.length; index += 256) {
      socket?.emit('whiteboard:draw', {
        roomId,
        operationId: stroke.operationId,
        phase: 'points',
        points: points.slice(index, index + 256),
      });
    }
  }, [roomId, socket]);

  const schedulePointFlush = useCallback(() => {
    if (flushFrameRef.current === null) {
      flushFrameRef.current = requestAnimationFrame(flushPoints);
    }
  }, [flushPoints]);

  const updateObjectLocally = useCallback((action, objectId, object) => {
    setObjects((current) => {
      if (action === 'add') return [...current, object];
      if (action === 'delete') return current.filter((item) => item.id !== objectId);
      return current.map((item) => item.id === objectId ? object : item);
    });
  }, []);

  const emitObjectUpdate = useCallback((action, objectId, object) => {
    socket?.emit('whiteboard:object-update', {
      roomId,
      action,
      objectId,
      ...(object ? { object } : {}),
    });
    updateObjectLocally(action, objectId, object);
  }, [roomId, socket, updateObjectLocally]);

  const saveTextEditor = () => {
    if (!textEditor) return;
    const text = textEditor.text.trim();
    if (!text) {
      setTextEditor(null);
      return;
    }

    if (textEditor.mode === 'edit') {
      emitObjectUpdate('update', textEditor.object.id, {
        ...textEditor.object,
        text: text.slice(0, 2000),
        fontSize: textEditor.fontSize,
        width: textEditor.width,
        height: textEditor.height,
      });
    } else {
      const object = {
        id: makeId(),
        type: textEditor.type,
        x: textEditor.x,
        y: textEditor.y,
        width: textEditor.width,
        height: textEditor.height,
        color: textEditor.type === 'sticky' ? '#fef08a' : color,
        size,
        fontSize: textEditor.fontSize,
        text: text.slice(0, 2000),
      };
      object.x = Math.min(object.x, BOARD_WIDTH - object.width);
      object.y = Math.min(object.y, BOARD_HEIGHT - object.height);
      emitObjectUpdate('add', object.id, object);
      setSelectedId(object.id);
    }

    setTextEditor(null);
  };

  const handleTextResizeStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    textResizeRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      width: textEditor.width,
      height: textEditor.height,
      boardWidth: svgRef.current?.getBoundingClientRect().width || 1,
      boardHeight: svgRef.current?.getBoundingClientRect().height || 1,
    };
  };

  const handleTextResizeMove = (event) => {
    const resize = textResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - resize.clientX) * BOARD_WIDTH / resize.boardWidth;
    const deltaY = (event.clientY - resize.clientY) * BOARD_HEIGHT / resize.boardHeight;
    setTextEditor((current) => current ? {
      ...current,
      width: Math.max(360, Math.min(BOARD_WIDTH - current.x, resize.width + deltaX)),
      height: Math.max(200, Math.min(BOARD_HEIGHT - current.y, resize.height + deltaY)),
    } : current);
  };

  const handleTextResizeEnd = (event) => {
    if (textResizeRef.current?.pointerId === event.pointerId) {
      textResizeRef.current = null;
    }
  };

  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const point = boardPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setError('');

    if (tool === 'pen' || tool === 'eraser') {
      const operationId = makeId();
      const stroke = {
        operationId,
        color,
        size,
        tool,
        points: [point],
      };
      strokeRef.current = stroke;
      activeStrokesRef.current.set(operationId, stroke);
      socket?.emit('whiteboard:draw', {
        roomId,
        operationId,
        phase: 'start',
        color,
        size,
        tool,
        points: [point],
      });
      redrawActiveStrokes();
      return;
    }

    if (tool === 'select') {
      setSelectedId(null);
      setPreview(null);
      return;
    }

    if (isShapeTool(tool)) {
      gestureRef.current = { kind: 'create', start: point, tool };
      setGestureKind('create');
      setPreview({
        type: tool,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      });
      return;
    }

    if (tool === 'text' || tool === 'sticky') {
      const bounds = svgRef.current?.getBoundingClientRect();
      const width = Math.min(680, Math.max(360, ((bounds?.width ?? 500) * 0.78 * BOARD_WIDTH) / (bounds?.width ?? 500)));
      const height = tool === 'sticky' ? 400 : 340;
      setTextEditor({
        mode: 'add',
        editorId: makeId(),
        type: tool,
        x: Math.min(point.x, BOARD_WIDTH - width),
        y: Math.min(point.y, BOARD_HEIGHT - height),
        width,
        height,
        fontSize: tool === 'sticky' ? 18 : 24,
        text: '',
      });
    }
  };

  const handlePointerMove = (event) => {
    const point = boardPoint(event);
    if (!point) return;

    const stroke = strokeRef.current;
    if (stroke) {
      pendingPointsRef.current.push(point);
      const context = activeCanvasRef.current?.getContext('2d');
      if (context) {
        const previous = pendingPointsRef.current.at(-2) ??
          stroke.points.at(-1) ??
          point;
        const width = svgRef.current?.getBoundingClientRect().width || BOARD_WIDTH;
        drawActiveSegment(context, stroke, previous, point, BOARD_WIDTH / width);
      }
      schedulePointFlush();
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.kind === 'create') {
      setPreview({
        type: gesture.tool,
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
        width: Math.abs(point.x - gesture.start.x),
        height: Math.abs(point.y - gesture.start.y),
        startX: gesture.start.x,
        startY: gesture.start.y,
        endX: point.x,
        endY: point.y,
      });
      return;
    }

    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    if (gesture.kind === 'move') {
      const object = {
        ...gesture.object,
        x: Math.max(0, Math.min(BOARD_WIDTH - gesture.object.width, gesture.object.x + dx)),
        y: Math.max(0, Math.min(BOARD_HEIGHT - gesture.object.height, gesture.object.y + dy)),
      };
      gestureRef.current = { ...gesture, start: point, object };
      setGestureKind('move');
      setPreview(object);
      return;
    }

    if (gesture.kind === 'resize') {
      const object = {
        ...gesture.object,
        width: Math.max(24, Math.min(BOARD_WIDTH - gesture.object.x, gesture.object.width + dx)),
        height: Math.max(24, Math.min(BOARD_HEIGHT - gesture.object.y, gesture.object.height + dy)),
      };
      gestureRef.current = { ...gesture, start: point, object };
      setGestureKind('resize');
      setPreview(object);
    }
  };

  const handlePointerUp = (event) => {
    const point = boardPoint(event);
    if (strokeRef.current) {
      const stroke = strokeRef.current;
      const previous = pendingPointsRef.current.at(-1) ?? stroke.points.at(-1);
      if (
        point &&
        previous &&
        (point.x !== previous.x || point.y !== previous.y)
      ) {
        pendingPointsRef.current.push(point);
        const context = activeCanvasRef.current?.getContext('2d');
        const width = svgRef.current?.getBoundingClientRect().width || BOARD_WIDTH;
        if (context) {
          drawActiveSegment(context, stroke, previous, point, BOARD_WIDTH / width);
        }
      }
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }
      flushPoints();
      strokeRef.current = null;
      socket?.emit('whiteboard:draw', {
        roomId,
        operationId: stroke.operationId,
        phase: 'end',
        points: [],
      });
      setObjects((current) => [...current, {
        id: stroke.operationId,
        type: 'stroke',
        color: stroke.color,
        size: stroke.size,
        tool: stroke.tool,
        points: stroke.points,
      }]);
      activeStrokesRef.current.delete(stroke.operationId);
      redrawActiveStrokes();
      return;
    }

    const gesture = gestureRef.current;
    gestureRef.current = null;
    setGestureKind(null);
    if (!gesture || !point) {
      setPreview(null);
      return;
    }

    if (gesture.kind === 'create') {
      const x = Math.min(gesture.start.x, point.x);
      const y = Math.min(gesture.start.y, point.y);
      const width = Math.abs(point.x - gesture.start.x);
      const height = Math.abs(point.y - gesture.start.y);
      if (width < 2 && height < 2) {
        setPreview(null);
        return;
      }
      const object = {
        id: makeId(),
        type: gesture.tool,
        x,
        y,
        width,
        height,
        color,
        size,
        ...(gesture.tool === 'line' || gesture.tool === 'arrow'
          ? {
              reverseX: point.x < gesture.start.x,
              reverseY: point.y < gesture.start.y,
            }
          : {}),
      };
      emitObjectUpdate('add', object.id, object);
    } else {
      emitObjectUpdate('update', gesture.object.id, gesture.object);
    }
    setPreview(null);
  };

  const handlePointerCancel = () => {
    const stroke = strokeRef.current;
    if (stroke) {
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }
      strokeRef.current = null;
      pendingPointsRef.current = [];
      activeStrokesRef.current.delete(stroke.operationId);
      socket?.emit('whiteboard:draw', {
        roomId,
        operationId: stroke.operationId,
        phase: 'cancel',
        points: [],
      });
      redrawActiveStrokes();
    }
    gestureRef.current = null;
    setGestureKind(null);
    setPreview(null);
  };

  const handleObjectPointerDown = (event, object, kind = 'move') => {
    if (tool !== 'select') return;
    const point = boardPoint(event);
    if (!point) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedId(object.id);
    gestureRef.current = { kind, object, start: point };
    setPreview(object);
  };

  const handleUndo = () => socket?.emit('whiteboard:undo', { roomId });
  const handleRedo = () => socket?.emit('whiteboard:redo', { roomId });
  const handleClear = () => {
    socket?.emit('whiteboard:clear', { roomId });
    setObjects([]);
    setSelectedId(null);
    setPreview(null);
    activeStrokesRef.current.clear();
    redrawActiveStrokes();
  };

  const handleEditorKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setTextEditor(null);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveTextEditor();
    }
  };

  const renderedObjects = preview && ['move', 'resize'].includes(gestureKind)
    ? objects.map((object) => object.id === preview.id ? preview : object)
    : objects;
  const boardReady = connected && synced;
  const shapePreview = gestureKind === 'create' &&
    preview &&
    isShapeTool(preview.type)
    ? preview
    : null;

  return (
    <section className={`whiteboard ${boardReady ? '' : 'whiteboard--syncing'}`} aria-label="Collaborative whiteboard">
      <header className="whiteboard-heading">
        <div className="whiteboard-heading-mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16v13H4z" />
            <path d="m8 13 3-3 2 2 3-4" />
            <path d="M9 21h6m-3-4v4" />
          </svg>
        </div>
        <div className="whiteboard-heading-copy">
          <h2>Shared whiteboard</h2>
          <span>Everyone in the call can draw</span>
        </div>
        <div className={`whiteboard-presence ${boardReady ? 'is-live' : ''}`}>
          <span className="whiteboard-presence-dot" />
          {boardReady ? 'Live' : connected ? 'Syncing' : 'Connecting'}
        </div>
        <button
          type="button"
          className="whiteboard-close"
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
          aria-label="Close whiteboard"
          title="Close whiteboard"
        >
          ×
        </button>
      </header>
      <div className="whiteboard-toolbar">
        <div className="whiteboard-tools" role="toolbar" aria-label="Whiteboard tools">
          {TOOL_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`whiteboard-tool ${tool === value ? 'is-active' : ''}`}
              disabled={!boardReady}
              onClick={() => {
                setTool(value);
                setPreview(null);
                gestureRef.current = null;
                setGestureKind(null);
              }}
              aria-pressed={tool === value}
              title={label}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="whiteboard-settings">
          <div className="whiteboard-color-swatches" role="group" aria-label="Color presets">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`whiteboard-color-swatch ${color === swatch ? 'is-selected' : ''}`}
                style={{ '--swatch-color': swatch }}
                onClick={() => setColor(swatch)}
                disabled={!boardReady}
                aria-label={`Set color to ${swatch}`}
                aria-pressed={color === swatch}
              />
            ))}
          </div>
          <label className="whiteboard-setting">
            Color
            <input
              type="color"
              value={color}
              disabled={!boardReady}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Drawing color"
            />
          </label>
          <label className="whiteboard-setting whiteboard-size">
            Size
            <input
              type="range"
              min="1"
              max="32"
              value={size}
              disabled={!boardReady}
              onChange={(event) => setSize(Number(event.target.value))}
              aria-label="Brush size"
            />
            <span>{size}</span>
          </label>
          <button type="button" className="whiteboard-action" onClick={handleUndo} disabled={!boardReady} title="Undo">
            Undo
          </button>
          <button type="button" className="whiteboard-action" onClick={handleRedo} disabled={!boardReady} title="Redo">
            Redo
          </button>
          <button type="button" className="whiteboard-action is-danger" onClick={handleClear} disabled={!boardReady} title="Clear board">
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="whiteboard-error" role="status">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button>
        </div>
      )}

      {!boardReady && (
        <div className="whiteboard-sync-status" role="status">
          {connected ? 'Syncing whiteboard…' : 'Connecting to whiteboard…'}
        </div>
      )}

      <div
        className="whiteboard-canvas-wrap"
        onPointerMove={handleTextResizeMove}
        onPointerUp={handleTextResizeEnd}
        onPointerCancel={handleTextResizeEnd}
      >
        <svg
          ref={svgRef}
          className={`whiteboard-canvas whiteboard-canvas--${tool} ${boardReady ? '' : 'is-disabled'}`}
          viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          role="img"
          aria-label="Shared drawing area"
        >
          <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#ffffff" />
          {renderedObjects.map((object, index) => {
            if (object.type === 'stroke') {
              return (
                <path
                  key={object.id}
                  d={makePath(object.points)}
                  fill="none"
                  stroke={object.tool === 'eraser' ? '#ffffff' : object.color}
                  strokeWidth={object.size}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            }

            const selected = selectedId === object.id;
            const common = {
              stroke: object.type === 'sticky' ? '#ca8a04' : object.color,
              strokeWidth: object.size,
              vectorEffect: 'non-scaling-stroke',
              onPointerDown: (event) => handleObjectPointerDown(event, object),
            };
            const content = object.type === 'rectangle'
              ? <rect {...common} x={object.x} y={object.y} width={object.width} height={object.height} fill="none" />
              : object.type === 'circle'
                ? <ellipse {...common} cx={object.x + object.width / 2} cy={object.y + object.height / 2} rx={object.width / 2} ry={object.height / 2} fill="none" />
                : object.type === 'line' || object.type === 'arrow'
                  ? (
                    <line
                      {...common}
                      x1={object.reverseX ? object.x + object.width : object.x}
                      y1={object.reverseY ? object.y + object.height : object.y}
                      x2={object.reverseX ? object.x : object.x + object.width}
                      y2={object.reverseY ? object.y : object.y + object.height}
                      markerEnd={object.type === 'arrow' ? `url(#whiteboard-arrow-${index})` : undefined}
                    />
                  )
                  : (
                    <g {...common}>
                      {object.type === 'sticky' && (
                        <rect
                          x={object.x}
                          y={object.y}
                          width={object.width}
                          height={object.height}
                          rx="8"
                          fill={object.color}
                          stroke="#facc15"
                          strokeWidth="1"
                        />
                      )}
                      <foreignObject
                        x={object.x + 8}
                        y={object.y + 8}
                        width={Math.max(1, object.width - 16)}
                        height={Math.max(1, object.height - 16)}
                      >
                        <div
                          xmlns="http://www.w3.org/1999/xhtml"
                          className={`whiteboard-object-text ${object.type === 'sticky' ? 'is-sticky' : ''}`}
                          onDoubleClick={(event) => {
                            if (tool !== 'select') return;
                            event.stopPropagation();
                            setTextEditor({
                              mode: 'edit',
                              editorId: makeId(),
                              type: object.type,
                              object,
                              text: getObjectText(object),
                              x: object.x,
                              y: object.y,
                              width: object.width,
                              height: object.height,
                              fontSize: object.fontSize ?? (object.type === 'sticky' ? 15 : 16),
                            });
                          }}
                          style={{
                            color: object.type === 'sticky' ? '#18181b' : object.color,
                            fontSize: `${object.fontSize ?? (object.type === 'sticky' ? 15 : 16)}px`,
                          }}
                        >
                          {getObjectText(object)}
                        </div>
                      </foreignObject>
                    </g>
                  );

            return (
              <g key={object.id}>
                {content}
                {selected && (
                  <>
                    <rect
                      x={object.x}
                      y={object.y}
                      width={object.width}
                      height={object.height}
                      fill="none"
                      stroke="#2563eb"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    <circle
                      cx={object.x + object.width}
                      cy={object.y + object.height}
                      r="8"
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={(event) => handleObjectPointerDown(event, object, 'resize')}
                    />
                  </>
                )}
              </g>
            );
          })}
          {shapePreview && (
            shapePreview.type === 'rectangle'
              ? <rect x={shapePreview.x} y={shapePreview.y} width={shapePreview.width} height={shapePreview.height} fill="none" stroke={color} strokeWidth={size} strokeDasharray="6 4" />
              : shapePreview.type === 'circle'
                ? <ellipse cx={shapePreview.x + shapePreview.width / 2} cy={shapePreview.y + shapePreview.height / 2} rx={shapePreview.width / 2} ry={shapePreview.height / 2} fill="none" stroke={color} strokeWidth={size} strokeDasharray="6 4" />
                : <line x1={shapePreview.startX ?? shapePreview.x} y1={shapePreview.startY ?? shapePreview.y} x2={shapePreview.endX ?? shapePreview.x} y2={shapePreview.endY ?? shapePreview.y} stroke={color} strokeWidth={size} strokeDasharray="6 4" markerEnd={shapePreview.type === 'arrow' ? 'url(#whiteboard-arrow-preview)' : undefined} />
          )}
          <defs>
            {renderedObjects.map((object, index) => object.type === 'arrow' && (
              <marker key={object.id} id={`whiteboard-arrow-${index}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L10,5 L0,10 z" fill={object.color} />
              </marker>
            ))}
            <marker id="whiteboard-arrow-preview" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L10,5 L0,10 z" fill={color} />
            </marker>
          </defs>
        </svg>
        <canvas ref={activeCanvasRef} className="whiteboard-active-canvas" aria-hidden="true" />
        {textEditor && (
          <section
            className={`whiteboard-text-editor ${textEditor.type === 'sticky' ? 'is-sticky' : ''}`}
            aria-label={textEditor.mode === 'edit' ? 'Edit text on board' : 'Add text to board'}
            style={{
              left: `${(textEditor.x / BOARD_WIDTH) * 100}%`,
              top: `${(textEditor.y / BOARD_HEIGHT) * 100}%`,
              width: `${(textEditor.width / BOARD_WIDTH) * 100}%`,
              height: `${(textEditor.height / BOARD_HEIGHT) * 100}%`,
              '--text-editor-color': textEditor.type === 'sticky'
                ? '#18181b'
                : textEditor.object?.color ?? color,
              '--text-editor-font-size': `${textEditor.fontSize}px`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="whiteboard-text-editor-toolbar">
              <span>{textEditor.mode === 'edit' ? 'Text' : textEditor.type === 'sticky' ? 'Sticky note' : 'Text box'}</span>
              <div className="whiteboard-text-size-control" aria-label="Font size">
                <button
                  type="button"
                  onClick={() => setTextEditor((current) => ({
                    ...current,
                    fontSize: Math.max(8, current.fontSize - 2),
                  }))}
                  disabled={textEditor.fontSize <= 8}
                  aria-label="Decrease font size"
                >
                  −
                </button>
                <span>{textEditor.fontSize}</span>
                <button
                  type="button"
                  onClick={() => setTextEditor((current) => ({
                    ...current,
                    fontSize: Math.min(96, current.fontSize + 2),
                  }))}
                  disabled={textEditor.fontSize >= 96}
                  aria-label="Increase font size"
                >
                  +
                </button>
              </div>
            </div>
            <textarea
              autoFocus
              className="whiteboard-text-input"
              value={textEditor.text}
              maxLength={2000}
              placeholder={textEditor.type === 'sticky' ? 'Write a note…' : 'Type here…'}
              onChange={(event) => setTextEditor((current) => ({
                ...current,
                text: event.target.value,
              }))}
              onKeyDown={handleEditorKeyDown}
              aria-label="Text content"
            />
            <div className="whiteboard-text-editor-footer">
              <span>{textEditor.text.length}/2000</span>
              <div className="whiteboard-text-editor-actions">
                <button
                  type="button"
                  className="whiteboard-text-cancel"
                  onClick={() => setTextEditor(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="whiteboard-text-save"
                  onClick={saveTextEditor}
                  disabled={!textEditor.text.trim()}
                >
                  Done
                </button>
              </div>
            </div>
            <button
              type="button"
              className="whiteboard-text-resize-handle"
              aria-label="Resize text box"
              onPointerDown={handleTextResizeStart}
              title="Drag to resize"
            />
          </section>
        )}
      </div>
    </section>
  );
}
