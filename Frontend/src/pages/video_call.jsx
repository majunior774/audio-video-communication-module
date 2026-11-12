import { useEffect, useRef, useState } from 'react';
import './video_call.css';
import Whiteboard from '../components/Whiteboard';
import YouTubeWatchTogether from '../components/YouTubeWatchTogether';

export default function VideoCall({
  localVideoRef,
  remoteStreams,
  cameraFacingMode,
  cameraReady,
  cameraSwitching,
  cameraError,
  onSwitchCamera,
  socket,
  roomId,
  screenShareStream,
  onStartScreenShare,
  onStopScreenShare,
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [expandedTile, setExpandedTile] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false);
  const [screenShareDialogOpen, setScreenShareDialogOpen] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const [screenShareWarning, setScreenShareWarning] = useState('');
  const [screenQuality, setScreenQuality] = useState('1080');
  const [screenFrameRate, setScreenFrameRate] = useState('30');
  const [includeScreenAudio, setIncludeScreenAudio] = useState(true);
  const toolsMenuRef = useRef(null);
  const screenVideoRef = useRef(null);
  const lastTileTapRef = useRef(null);

  useEffect(() => {
    if (screenVideoRef.current && screenShareStream) {
      screenVideoRef.current.srcObject = screenShareStream;
    }
  }, [screenShareStream]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!toolsMenuRef.current?.contains(event.target)) {
        toolsMenuRef.current.open = false;
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && toolsMenuRef.current?.open) {
        toolsMenuRef.current.open = false;
        toolsMenuRef.current.querySelector('summary')?.focus();
      }
    };

    document.addEventListener('click', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!expandedTile) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setExpandedTile(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [expandedTile]);

  const handleTilePointerUp = (event, tileId) => {
    if (event.button !== 0) return;
    const now = Date.now();
    const previousTap = lastTileTapRef.current;
    if (
      previousTap?.tileId === tileId &&
      now - previousTap.time < 350 &&
      Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 32
    ) {
      event.preventDefault();
      lastTileTapRef.current = null;
      setExpandedTile((current) => current === tileId ? null : tileId);
      return;
    }

    lastTileTapRef.current = {
      tileId,
      time: now,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handleTileKeyDown = (event, tileId) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setExpandedTile((current) => current === tileId ? null : tileId);
  };

  const toggleMic = () => {
    const stream = localVideoRef.current?.srcObject;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicOn((prev) => !prev);
  };

  const toggleCam = () => {
    const stream = localVideoRef.current?.srcObject;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamOn((prev) => !prev);
  };

  const startSharing = async (event) => {
    event.preventDefault();
    const [width, height] = screenQuality === '720'
      ? [1280, 720]
      : [1920, 1080];
    setScreenShareError('');
    setScreenShareWarning('');
    try {
      const warning = await onStartScreenShare({
        width,
        height,
        frameRate: Number(screenFrameRate),
        includeAudio: includeScreenAudio,
      });
      setScreenShareWarning(warning);
      setScreenShareDialogOpen(false);
    } catch (error) {
      setScreenShareError(error.message);
    }
  };

  const stopSharing = async () => {
    setScreenShareError('');
    try {
      await onStopScreenShare();
      setScreenShareWarning('');
    } catch (error) {
      setScreenShareError(error.message);
    }
  };

  const hasRemote = remoteStreams.length > 0;
  const participantCount = remoteStreams.length + 1;
  const useAdaptiveGrid = participantCount > 3;
  const localInGrid = useAdaptiveGrid && participantCount % 2 === 1;
  const adaptiveColumns = Math.ceil(Math.sqrt(participantCount));
  const adaptiveRows = Math.ceil(participantCount / adaptiveColumns);
  const adaptiveTileStyle = useAdaptiveGrid
    ? {
        '--adaptive-tile-width': `calc(${100 / adaptiveColumns}% - ${
          (8 * (adaptiveColumns - 1)) / adaptiveColumns
        }px)`,
        '--adaptive-tile-height': `calc(${100 / adaptiveRows}% - ${
          (8 * (adaptiveRows - 1)) / adaptiveRows
        }px)`,
      }
    : undefined;
  const localCameraTileId = 'local:camera';
  const localCameraExpanded = expandedTile === localCameraTileId;

  return (
    <div className="call-root">
      <div className={`call-main ${
        whiteboardOpen || watchTogetherOpen ? 'call-main--panels' : ''
      } ${
        whiteboardOpen && watchTogetherOpen ? 'call-main--two-panels' : ''
      }`}>
        <div
          className={`call-stage ${useAdaptiveGrid ? 'call-stage--adaptive' : ''} ${
            localInGrid ? 'call-stage--adaptive-grid' : ''
          }`}
          style={adaptiveTileStyle}
        >
          {hasRemote ? (
            <div
              className={`remote-grid ${
                useAdaptiveGrid
                  ? 'remote-grid--adaptive'
                  : `remote-grid--${Math.min(remoteStreams.length, 4)}`
              }`}
              style={adaptiveTileStyle}
            >
              {remoteStreams.map(({ userId, stream, source }) => {
                const tileId = `remote:${userId}:${stream.id}`;
                const isExpanded = expandedTile === tileId;
                return (
                  <div
                    key={tileId}
                    className={`remote-tile ${source === 'screen' ? 'remote-tile--screen' : ''} ${
                      isExpanded ? 'call-tile--expanded' : ''
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${isExpanded ? 'Restore' : 'Expand'} ${source === 'screen' ? 'screen share' : 'video'} from ${userId.slice(0, 8)}`}
                    aria-pressed={isExpanded}
                    onPointerUp={(event) => handleTilePointerUp(event, tileId)}
                    onKeyDown={(event) => handleTileKeyDown(event, tileId)}
                  >
                    <div className="tile-video-frame">
                      <video
                        autoPlay
                        playsInline
                        ref={(el) => {
                          if (el && el.srcObject !== stream) el.srcObject = stream;
                        }}
                      />
                    </div>
                    <span className="remote-label">
                      {source === 'screen'
                        ? `Screen · ${userId.slice(0, 8)}`
                        : userId.slice(0, 8)}
                    </span>
                    {isExpanded && <span className="tile-expand-hint">Double-tap or press Esc to return</span>}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div
            className={`${!hasRemote
              ? 'solo-view'
              : localInGrid
                ? 'local-grid-tile'
                : `local-pip ${localExpanded ? 'local-pip--lg' : ''}`} ${
              localCameraExpanded ? 'call-tile--expanded' : ''
            }`}
            role="button"
            tabIndex={0}
            aria-label={`${localCameraExpanded ? 'Restore' : 'Expand'} your camera`}
            aria-pressed={localCameraExpanded}
            onPointerUp={(event) => handleTilePointerUp(event, localCameraTileId)}
            onKeyDown={(event) => handleTileKeyDown(event, localCameraTileId)}
            onClick={(event) => {
              if (event.detail === 1 && hasRemote && !localInGrid) {
                setLocalExpanded((previous) => !previous);
              }
            }}
          >
            <div className="tile-video-frame">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={cameraFacingMode === 'user' ? 'mirror' : ''}
              />
            </div>
            {!hasRemote && <p className="solo-hint">Waiting for others to join…</p>}
            {localCameraExpanded && <span className="tile-expand-hint">Double-tap or press Esc to return</span>}
          </div>
          {screenShareStream && (
            <div
              className={`local-screen-share-tile ${
                expandedTile === 'local:screen' ? 'call-tile--expanded' : ''
              }`}
              role="button"
              tabIndex={0}
              aria-label={`${expandedTile === 'local:screen' ? 'Restore' : 'Expand'} your screen share`}
              aria-pressed={expandedTile === 'local:screen'}
              onPointerUp={(event) => handleTilePointerUp(event, 'local:screen')}
              onKeyDown={(event) => handleTileKeyDown(event, 'local:screen')}
            >
              <div className="tile-video-frame">
                <video ref={screenVideoRef} autoPlay muted playsInline />
              </div>
              <span>You're sharing</span>
              {expandedTile === 'local:screen' && <span className="tile-expand-hint">Double-tap or press Esc to return</span>}
            </div>
          )}
        </div>

        {whiteboardOpen && (
          <Whiteboard socket={socket} roomId={roomId} />
        )}
        {watchTogetherOpen && (
          <YouTubeWatchTogether socket={socket} roomId={roomId} />
        )}
      </div>

      {screenShareDialogOpen && (
        <div className="screen-share-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setScreenShareDialogOpen(false);
        }}>
          <form
            className="screen-share-dialog"
            onSubmit={startSharing}
            role="dialog"
            aria-modal="true"
            aria-labelledby="screen-share-title"
          >
            <div className="screen-share-dialog-heading">
              <div>
                <h2 id="screen-share-title">Share your screen</h2>
                <p>Choose stream quality and audio, then select a screen, window, or tab.</p>
              </div>
              <button type="button" className="screen-share-close" onClick={() => setScreenShareDialogOpen(false)} aria-label="Close screen share settings">×</button>
            </div>
            <label className="screen-share-setting">
              <span>Quality</span>
              <select value={screenQuality} onChange={(event) => setScreenQuality(event.target.value)}>
                <option value="720">720p</option>
                <option value="1080">1080p</option>
              </select>
            </label>
            <label className="screen-share-setting">
              <span>Frame rate</span>
              <select value={screenFrameRate} onChange={(event) => setScreenFrameRate(event.target.value)}>
                <option value="15">15 fps</option>
                <option value="30">30 fps</option>
                <option value="60">60 fps</option>
              </select>
            </label>
            <label className="screen-share-audio">
              <input
                type="checkbox"
                checked={includeScreenAudio}
                onChange={(event) => setIncludeScreenAudio(event.target.checked)}
              />
              <span>Share tab or system audio when available</span>
            </label>
            <p className="screen-share-note">
              The browser’s picker determines which sources and audio options are available.
            </p>
            {screenShareError && <p className="screen-share-error" role="alert">{screenShareError}</p>}
            <div className="screen-share-actions">
              <button type="button" className="screen-share-cancel" onClick={() => setScreenShareDialogOpen(false)}>Cancel</button>
              <button type="submit" className="screen-share-start">Choose source</button>
            </div>
          </form>
        </div>
      )}

      <div className="call-bar">
        <details className="call-tools-menu" ref={toolsMenuRef}>
          <summary className="ctl-btn call-tools-trigger" aria-label="Open call tools" title="Call tools">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="5" r="2" />
              <circle cx="12" cy="5" r="2" />
              <circle cx="19" cy="5" r="2" />
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="12" cy="19" r="2" />
              <circle cx="19" cy="19" r="2" />
            </svg>
            {(whiteboardOpen || watchTogetherOpen || screenShareStream) && <span className="call-tools-indicator" />}
          </summary>
          <div className="call-tools-dropdown" role="group" aria-label="Call tools">
            <button
              type="button"
              className={`call-tool-option ${whiteboardOpen ? 'call-tool-option--active' : ''}`}
              onClick={() => {
                setWhiteboardOpen((open) => !open);
                toolsMenuRef.current.open = false;
              }}
              aria-pressed={whiteboardOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16v13H4z" />
                <path d="m8 13 3-3 2 2 3-4" />
                <path d="M9 21h6m-3-4v4" />
              </svg>
              <span>Whiteboard</span>
              {whiteboardOpen && <span className="call-tool-status">Open</span>}
            </button>
            <button
              type="button"
              className={`call-tool-option ${watchTogetherOpen ? 'call-tool-option--active' : ''}`}
              onClick={() => {
                setWatchTogetherOpen((open) => !open);
                toolsMenuRef.current.open = false;
              }}
              aria-pressed={watchTogetherOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
              </svg>
              <span>Watch together</span>
              {watchTogetherOpen && <span className="call-tool-status">Open</span>}
            </button>
            <button
              type="button"
              className={`call-tool-option ${screenShareStream ? 'call-tool-option--active' : ''}`}
              onClick={() => {
                toolsMenuRef.current.open = false;
                if (screenShareStream) {
                  stopSharing();
                } else {
                  setScreenShareError('');
                  setScreenShareDialogOpen(true);
                }
              }}
              aria-pressed={Boolean(screenShareStream)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="13" rx="2" />
                <path d="M8 21h8m-4-4v4m-2-10 2-2 2 2" />
              </svg>
              <span>{screenShareStream ? 'Stop sharing' : 'Share screen'}</span>
              {screenShareStream && <span className="call-tool-status">Live</span>}
            </button>
          </div>
        </details>
        <button
          className={`ctl-btn ${!micOn ? 'ctl-btn--off' : ''}`}
          onClick={toggleMic}
          title={micOn ? 'Mute mic' : 'Unmute mic'}
        >
          {micOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          )}
        </button>

        <button
          className={`ctl-btn ${!camOn ? 'ctl-btn--off' : ''}`}
          onClick={toggleCam}
          title={camOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {camOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1 4.22 2.82a.5.5 0 0 0 .78-.42V7.93a.5.5 0 0 0-.78-.42L16 11"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          )}
        </button>

        <button
          className="ctl-btn"
          onClick={onSwitchCamera}
          disabled={!cameraReady || cameraSwitching}
          title="Switch camera"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/></svg>
        </button>

        <button className="ctl-btn ctl-btn--end" title="Leave call">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4Z" transform="rotate(135 12 12)"/></svg>
        </button>
      </div>
      {screenShareWarning && <div className="screen-share-toast" role="status">{screenShareWarning}</div>}

      {cameraError && <p className="cam-error">{cameraError}</p>}
    </div>
  );
}
