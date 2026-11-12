import { useState, useEffect, useRef, useCallback } from 'react';
import './video_call.css';
import Whiteboard from '../components/Whiteboard';
import YouTubeWatchTogether from '../components/YouTubeWatchTogether';
import StudyRoomsBrand, { StudyRoomsIcon } from '../components/StudyRoomsBrand';

/* ─── small helper: format elapsed call time ─── */
function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [active]);
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ─── remote video tile ─── */
function RemoteTile({ userId, stream, source, isExpanded, onPointerUp, onKeyDown }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  const label = source === 'screen'
    ? `Screen · ${userId.slice(0, 6)}`
    : `Student · ${userId.slice(0, 6)}`;

  return (
    <div
      className={`vc-tile ${source === 'screen' ? 'vc-tile--screen' : ''} ${isExpanded ? 'vc-tile--expanded' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${isExpanded ? 'Restore' : 'Expand'} ${source === 'screen' ? 'screen share' : 'video'} from ${userId.slice(0, 8)}`}
      aria-pressed={isExpanded}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className="vc-tile__frame">
        <video ref={ref} autoPlay playsInline />
      </div>
      <span className="vc-tile__label">{label}</span>
      <span className="vc-tile__pulse" title="Connection active" />
      {isExpanded && <span className="vc-tile__expand-hint">Double-tap or press Esc to return</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   VideoCall — main component
   ═══════════════════════════════════════════════════ */
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
  onLeaveCall,
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [expandedTile, setExpandedTile] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false);
  const [screenShareDialogOpen, setScreenShareDialogOpen] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const [screenShareWarning, setScreenShareWarning] = useState('');
  const [screenQuality, setScreenQuality] = useState('1080');
  const [screenFrameRate, setScreenFrameRate] = useState('30');
  const [includeScreenAudio, setIncludeScreenAudio] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  const hideTimer = useRef(null);
  const toolsMenuRef = useRef(null);
  const screenVideoRef = useRef(null);
  const lastTileTapRef = useRef(null);

  const hasRemote = remoteStreams.length > 0;
  // Elapsed timer runs continuously while inside the meeting room
  const elapsed = useElapsed(true);

  /* ── screen share preview ── */
  useEffect(() => {
    if (screenVideoRef.current && screenShareStream) {
      screenVideoRef.current.srcObject = screenShareStream;
    }
  }, [screenShareStream]);

  /* ── tools menu close on outside click / escape ── */
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

  /* ── expanded tile escape ── */
  useEffect(() => {
    if (!expandedTile) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setExpandedTile(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [expandedTile]);

  /* ── double-tap to expand tile ── */
  const handleTilePointerUp = (event, tileId) => {
    if (event.button !== 0) return;
    const now = Date.now();
    const prev = lastTileTapRef.current;
    if (
      prev?.tileId === tileId &&
      now - prev.time < 350 &&
      Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < 32
    ) {
      event.preventDefault();
      lastTileTapRef.current = null;
      setExpandedTile((c) => c === tileId ? null : tileId);
      return;
    }
    lastTileTapRef.current = { tileId, time: now, x: event.clientX, y: event.clientY };
  };

  const handleTileKeyDown = (event, tileId) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setExpandedTile((c) => c === tileId ? null : tileId);
  };

  /* ── auto-hide controls ── */
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 4500);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowControls(false), 4500);
    return () => clearTimeout(timer);
  }, []);

  /* ── toggle helpers ── */
  const toggleMic = () => {
    const stream = localVideoRef.current?.srcObject;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicOn((p) => !p);
  };

  const toggleCam = () => {
    const stream = localVideoRef.current?.srcObject;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamOn((p) => !p);
  };

  /* ── copy room link ── */
  const handleCopyRoomLink = () => {
    const origin = window.location.origin;
    const url = `${origin}/?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }).catch(console.error);
  };

  /* ── screen share ── */
  const startSharing = async (event) => {
    event.preventDefault();
    const [width, height] = screenQuality === '720' ? [1280, 720] : [1920, 1080];
    setScreenShareError('');
    setScreenShareWarning('');
    try {
      const warning = await onStartScreenShare({
        width, height,
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

  /* ── adaptive grid ── */
  const participantCount = remoteStreams.length + 1;
  const useAdaptiveGrid = participantCount > 3;
  const localInGrid = useAdaptiveGrid && participantCount % 2 === 1;
  const adaptiveColumns = Math.ceil(Math.sqrt(participantCount));
  const adaptiveRows = Math.ceil(participantCount / adaptiveColumns);
  const adaptiveTileStyle = useAdaptiveGrid
    ? {
        '--adaptive-tile-width': `calc(${100 / adaptiveColumns}% - ${(8 * (adaptiveColumns - 1)) / adaptiveColumns}px)`,
        '--adaptive-tile-height': `calc(${100 / adaptiveRows}% - ${(8 * (adaptiveRows - 1)) / adaptiveRows}px)`,
      }
    : undefined;

  /* grid class for 1–3 remote tiles */
  const gridClass = useAdaptiveGrid
    ? 'vc-grid--adaptive'
    : remoteStreams.length === 1
      ? 'vc-grid--1'
      : remoteStreams.length === 2
        ? 'vc-grid--2'
        : 'vc-grid--3';

  const localCameraTileId = 'local:camera';
  const localCameraExpanded = expandedTile === localCameraTileId;

  return (
    <div
      className="vc selection:bg-indigo-500 selection:text-white"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* ── Top Bar ── */}
      <header className={`vc-header ${showControls ? '' : 'vc-header--hidden'}`}>
        {/* Brand & Room ID Pill */}
        <div className="vc-header__left">
          <StudyRoomsBrand size="sm" />

          {/* Room Chip with Copy Link */}
          <div className="vc-header__room-pill">
            <span className="vc-header__hash">#</span>
            <span className="vc-header__room-id" title={roomId}>{roomId}</span>
            <button
              type="button"
              onClick={handleCopyRoomLink}
              className="vc-header__copy-btn"
              title="Copy room invitation link"
            >
              {copiedLink ? (
                <span className="vc-header__copied">Copied! ✓</span>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Center: Live Session Elapsed Clock */}
        <div className="vc-header__center">
          <span className="vc-header__dot" />
          <span className="vc-header__time">{elapsed}</span>
        </div>

        {/* Right: Participant Count Badge */}
        <div className="vc-header__right">
          <span className="vc-header__count" title="Participants in room">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>{participantCount} {participantCount === 1 ? 'student' : 'students'}</span>
          </span>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className={`vc-main ${whiteboardOpen || watchTogetherOpen ? 'vc-main--panels' : ''} ${whiteboardOpen && watchTogetherOpen ? 'vc-main--two-panels' : ''}`}>
        {/* ── Video Stage ── */}
        <main
          className={`vc-stage ${useAdaptiveGrid ? 'vc-stage--adaptive' : ''} ${localInGrid ? 'vc-stage--adaptive-grid' : ''}`}
          style={adaptiveTileStyle}
        >
          {hasRemote ? (
            <div className={`vc-grid ${gridClass}`} style={adaptiveTileStyle}>
              {remoteStreams.map(({ userId, stream, source }) => {
                const tileId = `remote:${userId}:${stream.id}`;
                return (
                  <RemoteTile
                    key={tileId}
                    userId={userId}
                    stream={stream}
                    source={source}
                    isExpanded={expandedTile === tileId}
                    onPointerUp={(e) => handleTilePointerUp(e, tileId)}
                    onKeyDown={(e) => handleTileKeyDown(e, tileId)}
                  />
                );
              })}
            </div>
          ) : null}

          {/* ── Local Camera Tile ── */}
          <div
            className={`${!hasRemote
              ? 'vc-solo'
              : localInGrid
                ? 'vc-local-grid'
                : `vc-pip ${localExpanded ? 'vc-pip--lg' : ''}`} ${localCameraExpanded ? 'vc-tile--expanded' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${localCameraExpanded ? 'Restore' : 'Expand'} your camera`}
            aria-pressed={localCameraExpanded}
            onPointerUp={(e) => handleTilePointerUp(e, localCameraTileId)}
            onKeyDown={(e) => handleTileKeyDown(e, localCameraTileId)}
            onClick={(e) => {
              if (e.detail === 1 && hasRemote && !localInGrid) {
                setLocalExpanded((p) => !p);
              }
            }}
          >
            <div className="vc-tile__frame">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={cameraFacingMode === 'user' ? 'mirror' : ''}
              />
            </div>

            {/* Solo Waiting Radar Overlay */}
            {!hasRemote && (
              <div className="vc-solo__overlay">
                <div className="vc-solo__radar">
                  <div className="vc-solo__ring vc-solo__ring--outer" />
                  <div className="vc-solo__ring vc-solo__ring--mid" />
                  <div className="vc-solo__ring vc-solo__ring--inner">
                    <StudyRoomsIcon size={26} />
                  </div>
                </div>

                <div className="vc-solo__info">
                  <h2 className="sr-font-heading vc-solo__title">Waiting for study partners…</h2>
                  <p className="vc-solo__subtext">Share your room link with classmates to collaborate</p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyRoomLink}
                  className="vc-solo__copy-btn"
                >
                  {copiedLink ? (
                    <span>Invite Link Copied! ✓</span>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy Invitation Link</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {hasRemote && !localInGrid && <span className="vc-pip__badge">You</span>}
            {localCameraExpanded && <span className="vc-tile__expand-hint">Double-tap or press Esc to return</span>}
          </div>

          {/* ── Local Screen Share Preview ── */}
          {screenShareStream && (
            <div
              className={`vc-screen-preview ${expandedTile === 'local:screen' ? 'vc-tile--expanded' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${expandedTile === 'local:screen' ? 'Restore' : 'Expand'} your screen share`}
              aria-pressed={expandedTile === 'local:screen'}
              onPointerUp={(e) => handleTilePointerUp(e, 'local:screen')}
              onKeyDown={(e) => handleTileKeyDown(e, 'local:screen')}
            >
              <div className="vc-tile__frame">
                <video ref={screenVideoRef} autoPlay muted playsInline />
              </div>
              <span className="vc-screen-preview__label">You're sharing</span>
              {expandedTile === 'local:screen' && <span className="vc-tile__expand-hint">Double-tap or press Esc to return</span>}
            </div>
          )}
        </main>

        {/* ── Side Panels (Whiteboard & WatchTogether) ── */}
        {whiteboardOpen && <Whiteboard socket={socket} roomId={roomId} />}
        {watchTogetherOpen && <YouTubeWatchTogether socket={socket} roomId={roomId} />}
      </div>

      {/* ── Floating Controls Dock ── */}
      <div className={`vc-bar ${showControls ? '' : 'vc-bar--hidden'}`}>
        <div className="vc-bar__inner">
          {/* Tools Menu */}
          <details className="vc-tools" ref={toolsMenuRef}>
            <summary className="vc-btn vc-tools__trigger" aria-label="Open study tools" title="Study Tools">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                <circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
              </svg>
              {(whiteboardOpen || watchTogetherOpen || screenShareStream) && <span className="vc-tools__dot" />}
              <span className="vc-btn__label">Tools</span>
            </summary>
            <div className="vc-tools__dropdown" role="group" aria-label="Study tools">
              <button
                type="button"
                className={`vc-tools__option ${whiteboardOpen ? 'vc-tools__option--active' : ''}`}
                onClick={() => { setWhiteboardOpen((o) => !o); toolsMenuRef.current.open = false; }}
                aria-pressed={whiteboardOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4h16v13H4z" /><path d="m8 13 3-3 2 2 3-4" /><path d="M9 21h6m-3-4v4" />
                </svg>
                <span>Live Whiteboard</span>
                {whiteboardOpen && <span className="vc-tools__status">Open</span>}
              </button>
              <button
                type="button"
                className={`vc-tools__option ${watchTogetherOpen ? 'vc-tools__option--active' : ''}`}
                onClick={() => { setWatchTogetherOpen((o) => !o); toolsMenuRef.current.open = false; }}
                aria-pressed={watchTogetherOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
                </svg>
                <span>Watch Together</span>
                {watchTogetherOpen && <span className="vc-tools__status">Open</span>}
              </button>
              <button
                type="button"
                className={`vc-tools__option ${screenShareStream ? 'vc-tools__option--active' : ''}`}
                onClick={() => {
                  toolsMenuRef.current.open = false;
                  if (screenShareStream) { stopSharing(); }
                  else { setScreenShareError(''); setScreenShareDialogOpen(true); }
                }}
                aria-pressed={Boolean(screenShareStream)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4m-2-10 2-2 2 2" />
                </svg>
                <span>{screenShareStream ? 'Stop Sharing' : 'Share Screen'}</span>
                {screenShareStream && <span className="vc-tools__status">Live</span>}
              </button>
            </div>
          </details>

          {/* Microphone Button */}
          <button
            className={`vc-btn ${!micOn ? 'vc-btn--off' : ''}`}
            onClick={toggleMic}
            aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
            title={micOn ? 'Mute Mic' : 'Unmute Mic'}
          >
            {micOn ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
            )}
            <span className="vc-btn__label">{micOn ? 'Mic' : 'Mic Off'}</span>
          </button>

          {/* Camera Button */}
          <button
            className={`vc-btn ${!camOn ? 'vc-btn--off' : ''}`}
            onClick={toggleCam}
            aria-label={camOn ? 'Turn off camera' : 'Turn on camera'}
            title={camOn ? 'Turn Off Cam' : 'Turn On Cam'}
          >
            {camOn ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1 4.22 2.82a.5.5 0 0 0 .78-.42V7.93a.5.5 0 0 0-.78-.42L16 11" /><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            )}
            <span className="vc-btn__label">{camOn ? 'Camera' : 'Cam Off'}</span>
          </button>

          {/* Switch Camera (Flip) */}
          <button
            className="vc-btn"
            onClick={onSwitchCamera}
            disabled={!cameraReady || cameraSwitching}
            aria-label="Switch camera"
            title={`Switch Camera (Currently: ${cameraFacingMode})`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" /><circle cx="12" cy="12" r="3" /><path d="m18 22-3-3 3-3" /><path d="m6 2 3 3-3 3" /></svg>
            <span className="vc-btn__label">Flip</span>
          </button>

          <span className="vc-bar__divider" />

          {/* End Call Button */}
          <button className="vc-btn vc-btn--end" onClick={onLeaveCall} aria-label="Leave call" title="End Study Session">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4Z" transform="rotate(135 12 12)" /></svg>
            <span className="vc-btn__label">End</span>
          </button>
        </div>
      </div>

      {/* ── Screen Share Settings Dialog ── */}
      {screenShareDialogOpen && (
        <div className="vc-dialog-backdrop" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setScreenShareDialogOpen(false);
        }}>
          <form
            className="vc-dialog"
            onSubmit={startSharing}
            role="dialog"
            aria-modal="true"
            aria-labelledby="screen-share-title"
          >
            <div className="vc-dialog__header">
              <div>
                <h2 id="screen-share-title" className="sr-font-heading">Share Your Screen</h2>
                <p>Present lecture slides, code editors, or browser tabs to your study room.</p>
              </div>
              <button type="button" className="vc-dialog__close" onClick={() => setScreenShareDialogOpen(false)} aria-label="Close dialog">✕</button>
            </div>

            <label className="vc-dialog__setting">
              <span>Resolution Quality</span>
              <select value={screenQuality} onChange={(e) => setScreenQuality(e.target.value)}>
                <option value="720">720p (Bandwidth Saver)</option>
                <option value="1080">1080p (FHD Crisp)</option>
              </select>
            </label>

            <label className="vc-dialog__setting">
              <span>Target Frame Rate</span>
              <select value={screenFrameRate} onChange={(e) => setScreenFrameRate(e.target.value)}>
                <option value="15">15 fps (Slide Decks)</option>
                <option value="30">30 fps (Standard Smooth)</option>
                <option value="60">60 fps (High Motion)</option>
              </select>
            </label>

            <label className="vc-dialog__checkbox">
              <input type="checkbox" checked={includeScreenAudio} onChange={(e) => setIncludeScreenAudio(e.target.checked)} />
              <span>Share system or tab audio when available</span>
            </label>

            <p className="vc-dialog__note">The browser's native window/screen picker will open next for source selection.</p>

            {screenShareError && <p className="vc-dialog__error" role="alert">{screenShareError}</p>}

            <div className="vc-dialog__actions">
              <button type="button" className="vc-dialog__cancel" onClick={() => setScreenShareDialogOpen(false)}>Cancel</button>
              <button type="submit" className="vc-dialog__submit">Select Source ➔</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Toast Notifications ── */}
      {screenShareWarning && <div className="vc-toast vc-toast--warn" role="status">{screenShareWarning}</div>}

      {cameraError && (
        <div className="vc-toast" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span>{cameraError}</span>
        </div>
      )}
    </div>
  );
}
