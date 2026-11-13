import { useState } from 'react';
import StudyRoomsBrand from '../components/StudyRoomsBrand';

export default function PreJoinLobby({
  roomId,
  localVideoRef,
  cameraReady,
  cameraSwitching,
  cameraError,
  cameraFacingMode,
  onSwitchCamera,
  onJoinRoom,
  onCancel,
}) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [copied, setCopied] = useState(false);

  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('sr_display_name') || '';
  });

  const toggleMic = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
    }
    setMicOn((prev) => !prev);
  };

  const toggleCam = () => {
    const stream = localVideoRef.current?.srcObject;
    if (stream) {
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
    }
    setCamOn((prev) => !prev);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      })
      .catch(console.error);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (displayName.trim()) {
      localStorage.setItem('sr_display_name', displayName.trim());
    }
    onJoinRoom();
  };

  return (
    <div className="sr-light-page sr-lobby relative min-h-screen w-full flex flex-col items-center justify-between overflow-x-hidden">
      {/* ── Top Header ── */}
      <header className="relative z-10 w-full px-8 sm:px-14 py-6 sm:py-7 flex items-center justify-between border-b border-white/[0.06] backdrop-blur-md">
        <StudyRoomsBrand size="md" />

        <button
          type="button"
          onClick={onCancel}
          className="text-xs sm:text-sm font-semibold px-4 sm:px-5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-white/10 transition-all hover:border-indigo-500/30 active:scale-95 cursor-pointer shadow-sm"
        >
          ✕ Exit to Hub
        </button>
      </header>

      {/* ── Center Content Area ── */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-12 sm:py-20">
        <div className="w-full max-w-2xl flex flex-col items-center">
          {/* Header Title Section with generous spacing */}
          <div className="w-full flex flex-col items-center justify-center text-center mb-10 sm:mb-12">
            <div className="inline-flex items-center justify-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900/90 border border-indigo-500/30 text-xs sm:text-sm font-semibold text-slate-300 mb-4 backdrop-blur-md shadow-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
              <span>Camera and mic check</span>
            </div>

            <h1 className="sr-font-heading text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight text-center">
              Ready to join?
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-slate-400 mt-3 text-center max-w-lg w-full leading-relaxed font-normal">
              Test your camera and microphone setup before entering the room.
            </p>
          </div>

          {/* ── Video Preview Mirror Card ── */}
          <div className="sr-lobby__preview relative w-full aspect-video rounded-3xl bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center group ring-1 ring-white/10 hover:ring-indigo-500/20 transition-all duration-300">
            {/* Live Video Element */}
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                cameraFacingMode === 'user' ? 'scale-x-[-1]' : ''
              } ${!camOn ? 'opacity-0' : 'opacity-100'}`}
            />

            {/* Camera Off Placeholder */}
            {!camOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/90 p-6 text-center">
                <div className="w-20 h-20 rounded-2xl bg-slate-800/90 border border-white/10 flex items-center justify-center text-slate-400 shadow-inner">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
                    <rect x="2" y="6" width="14" height="12" rx="2" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-200">Camera is turned off</p>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">Click the camera button below to enable video preview</p>
                </div>
              </div>
            )}

            {/* Camera Initializing Overlay */}
            {!cameraReady && camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur-md text-sm text-slate-200 p-4">
                <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
                  <span className="font-medium">Starting camera preview...</span>
                </div>
              </div>
            )}

            {/* Top Left Status Badge */}
            <div className="absolute top-5 left-5 flex items-center gap-2">
              <div className="sr-lobby__status-badge flex items-center gap-2 rounded-full bg-slate-950/80 border border-white/10 text-xs font-semibold text-slate-200 backdrop-blur-md shadow-md">
                <span className={`w-2 h-2 rounded-full ${camOn && cameraReady ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-500'}`} />
                <span>{camOn && cameraReady ? 'Preview Active' : 'Camera Off'}</span>
              </div>
            </div>

            {/* In-Preview Floating Controls Dock */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2.5 px-4 rounded-2xl bg-slate-950/85 border border-white/10 shadow-2xl backdrop-blur-xl">
              {/* Mic Toggle Button */}
              <button
                type="button"
                onClick={toggleMic}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  micOn
                    ? 'bg-slate-800/90 text-slate-100 hover:bg-slate-700/90 border border-white/10 hover:border-white/20 hover:scale-105 active:scale-95'
                    : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 shadow-lg shadow-rose-500/10 active:scale-95'
                }`}
                title={micOn ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {micOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                )}
              </button>

              {/* Camera Toggle Button */}
              <button
                type="button"
                onClick={toggleCam}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  camOn
                    ? 'bg-slate-800/90 text-slate-100 hover:bg-slate-700/90 border border-white/10 hover:border-white/20 hover:scale-105 active:scale-95'
                    : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 shadow-lg shadow-rose-500/10 active:scale-95'
                }`}
                title={camOn ? 'Turn Camera Off' : 'Turn Camera On'}
              >
                {camOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
                    <rect x="2" y="6" width="14" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1 4.22 2.82a.5.5 0 0 0 .78-.42V7.93a.5.5 0 0 0-.78-.42L16 11" />
                    <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>

              {/* Flip Camera Button */}
              <button
                type="button"
                onClick={onSwitchCamera}
                disabled={!camOn || !cameraReady || cameraSwitching}
                className="w-12 h-12 rounded-xl bg-slate-800/90 text-slate-100 hover:bg-slate-700/90 disabled:opacity-40 border border-white/10 hover:border-white/20 hover:scale-105 active:scale-95 flex items-center justify-center transition-all cursor-pointer"
                title={camOn ? `Switch Camera (Currently: ${cameraFacingMode})` : 'Turn the camera on to switch cameras'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                  <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="m18 22-3-3 3-3" />
                  <path d="m6 2 3 3-3 3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Device Error Alert */}
          {cameraError && (
            <div className="mt-5 w-full p-4 rounded-2xl bg-rose-950/60 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{cameraError}</span>
            </div>
          )}

          {/* ── Join Form Card ── */}
          <div className="sr-lobby__join mt-10 sm:mt-12 w-full p-8 sm:p-10 rounded-3xl bg-slate-900/60 border border-white/10 ring-1 ring-white/5">
            <form onSubmit={handleJoin} className="flex flex-col">
              {/* Display Name Section */}
              <div className="mb-7 sm:mb-8">
                <label htmlFor="displayNameInput" className="block text-xs uppercase tracking-wider font-bold text-slate-300 mb-3 flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Your Study Display Name</span>
                </label>
                <input
                  id="displayNameInput"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name or nickname..."
                  className="w-full px-5 py-4 sm:py-4.5 rounded-2xl bg-slate-950/60 border border-white/10 text-base text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-inner tracking-wide"
                />
              </div>

              {/* Action Buttons Row with Generous Spacing */}
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
                <button
                  type="submit"
                  className="w-full sm:flex-1 py-4 sm:py-4.5 px-8 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-base tracking-wide shadow-xl shadow-indigo-600/35 hover:shadow-indigo-600/50 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
                >
                  <span>Join Meeting Room Now</span>
                  <span className="text-lg">➔</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`w-full sm:w-auto py-4 sm:py-4.5 px-6 rounded-2xl text-base font-semibold border transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap flex items-center justify-center gap-2.5 shadow-md ${
                    copied
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-emerald-500/15'
                      : 'bg-slate-800/80 hover:bg-slate-700/80 border-white/10 text-slate-200 hover:text-white hover:border-white/20 hover:scale-[1.01]'
                  }`}
                >
                  {copied ? (
                    <span>Invite Link Copied! ✓</span>
                  ) : (
                    <>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy Invite Link</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Subtle Room Encryption Pill with clean breathing space */}
            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2.5 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span>Peer-to-Peer Encrypted Room</span>
              <span>•</span>
              <span className="font-mono text-slate-400 font-medium">#{roomId}</span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 w-full border-t border-white/[0.05] py-5 px-6 text-center text-xs text-slate-400">
        StudyRooms Pre-Join Lobby • Device check
      </footer>
    </div>
  );
}
