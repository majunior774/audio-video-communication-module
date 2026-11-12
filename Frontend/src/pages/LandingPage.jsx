import { useState } from 'react';
import StudyRoomsBrand from '../components/StudyRoomsBrand';

export default function LandingPage({ onCreateRoom, onJoinRoom, onOpenDashboard }) {
  const [roomCode, setRoomCode] = useState('');
  const [inputError, setInputError] = useState('');

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const trimmed = roomCode.trim();
    if (!trimmed) {
      setInputError('Please enter a room code or link');
      return;
    }

    try {
      if (trimmed.includes('?room=')) {
        const url = new URL(trimmed);
        const code = url.searchParams.get('room');
        if (code) {
          onJoinRoom(code.trim());
          return;
        }
      }
    } catch {
      // not a full url, use as plain code
    }

    onJoinRoom(trimmed.replace(/[^a-zA-Z0-9_-]/g, ''));
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRoomCode(text);
        setInputError('');
      }
    } catch (e) {
      console.log('Clipboard read blocked:', e);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#080F1A] text-slate-100 flex flex-col justify-between overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background ambient radial glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[750px] h-[450px] bg-gradient-to-b from-indigo-600/15 via-purple-600/10 to-transparent blur-[140px]" />
      <div className="pointer-events-none absolute top-1/2 -right-40 w-96 h-96 bg-cyan-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-10 -left-40 w-80 h-80 bg-purple-600/10 blur-[120px]" />

      {/* ── Top Navbar ── */}
      <header className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 py-5 flex items-center justify-between border-b border-white/[0.06]">
        <StudyRoomsBrand size="md" />

        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onOpenDashboard}
            className="text-xs font-semibold px-3.5 sm:px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-white/10 transition-all hover:border-indigo-500/30 active:scale-95 cursor-pointer"
          >
            Study Dashboard
          </button>
          <button
            type="button"
            onClick={onCreateRoom}
            className="text-xs font-semibold px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/25 transition-all active:scale-95 cursor-pointer"
          >
            Start Room
          </button>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10 sm:pt-14 pb-20 flex flex-col items-center text-center">
        {/* Live Status Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-white/10 text-xs font-medium text-slate-300 mb-6 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Real-Time Collaborative Study Rooms</span>
        </div>

        {/* Main Title */}
        <h1 className="sr-font-heading text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white max-w-3xl leading-[1.14]">
          Connect. Collaborate. <br />
          <span className="bg-gradient-to-r from-indigo-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent">
            Learn Together.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-4 sm:mt-5 text-sm sm:text-base md:text-lg text-slate-400 max-w-xl font-normal leading-relaxed">
          Peer-to-peer video study rooms equipped with a synchronized collaborative whiteboard, co-watching media player, and low-latency screen sharing.
        </p>

        {/* Room Launch & Join Form */}
        <div className="mt-9 w-full max-w-md p-2.5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleJoinSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value);
                  if (inputError) setInputError('');
                }}
                placeholder="Enter room code or link..."
                className="w-full px-4 py-3 pr-12 rounded-xl bg-slate-800/80 border border-white/5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[10px] uppercase font-semibold text-slate-400 hover:text-white bg-slate-700/60 hover:bg-slate-700 transition-all cursor-pointer"
                title="Paste from clipboard"
              >
                Paste
              </button>
            </div>
            <button
              type="submit"
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs tracking-wide transition-all shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Join Room
            </button>
          </form>

          {inputError && (
            <p className="text-left text-xs text-rose-400 px-3 pt-2">{inputError}</p>
          )}

          <div className="relative flex py-3 items-center">
            <div className="flex-grow border-t border-white/5" />
            <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-slate-500 font-medium">or</span>
            <div className="flex-grow border-t border-white/5" />
          </div>

          <button
            type="button"
            onClick={onCreateRoom}
            className="w-full py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-xs font-semibold text-slate-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Instant Study Room
          </button>
        </div>

        {/* ── Interactive Study Session Mockup Preview ── */}
        <div className="mt-14 w-full max-w-4xl p-2 sm:p-3 rounded-3xl bg-slate-900/60 border border-white/[0.08] shadow-2xl backdrop-blur-md">
          {/* Mock Window Top Bar */}
          <div className="px-4 py-2.5 rounded-t-2xl bg-slate-950/80 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-[11px] font-medium text-slate-400">Room: cs402-deep-learning</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live 24:18
              </span>
              <span className="text-[11px] font-medium text-slate-400">2 Study Partners</span>
            </div>
          </div>

          {/* Mock Stage Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-950/90 rounded-b-2xl">
            {/* Left Mock: Video Tiles */}
            <div className="flex flex-col gap-3">
              <div className="relative aspect-video rounded-xl bg-slate-900 border border-indigo-500/30 overflow-hidden flex items-center justify-center">
                {/* Mock User Avatar */}
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center font-bold text-white text-lg shadow-lg">
                  AR
                </div>
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/70 text-[10px] font-medium text-white flex items-center gap-1.5 backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Alex (Speaking)
                </div>
              </div>
              <div className="relative aspect-video rounded-xl bg-slate-900 border border-white/5 overflow-hidden flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-500 flex items-center justify-center font-bold text-white text-lg shadow-lg">
                  SA
                </div>
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/70 text-[10px] font-medium text-slate-300 flex items-center gap-1.5 backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  Sam
                </div>
              </div>
            </div>

            {/* Right Mock: Whiteboard */}
            <div className="relative min-h-[220px] rounded-xl bg-[#171a22] border border-white/10 p-4 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
                    <path d="M4 4h16v13H4z" />
                    <path d="m8 13 3-3 2 2 3-4" />
                  </svg>
                  Collaborative Board
                </span>
                <span className="text-[10px] text-cyan-400 font-medium">Synced in Real-Time</span>
              </div>

              {/* Vector diagram sketch simulation */}
              <div className="relative flex-1 flex items-center justify-center py-4">
                {/* SVG Graph path */}
                <svg width="160" height="70" viewBox="0 0 160 70" className="opacity-70">
                  <path d="M 10 60 Q 45 10, 80 40 T 150 20" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="80" cy="40" r="4" fill="#06B6D4" />
                  <circle cx="150" cy="20" r="4" fill="#A855F7" />
                </svg>

                {/* Sticky Note */}
                <div className="absolute right-3 top-3 w-32 p-2 rounded-lg bg-yellow-200 text-slate-900 text-[10px] shadow-md -rotate-2">
                  <p className="font-bold">Loss Function</p>
                  <p className="text-[9px] text-slate-800">L = -log(P(y|x))</p>
                </div>
              </div>

              {/* Mini dock */}
              <div className="flex items-center justify-center gap-2 pt-2 border-t border-white/5">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400">Pen</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400">Shapes</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400">Sticky</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Feature Highlights Grid ── */}
        <div className="mt-16 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
          {/* Feature 1 */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/[0.07] hover:border-indigo-500/30 transition-all group backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
            </div>
            <h3 className="sr-font-heading font-semibold text-sm text-white">Direct P2P Video</h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Encrypted peer-to-peer video & audio calls with responsive multi-tile layout and camera controls.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/[0.07] hover:border-cyan-500/30 transition-all group backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v13H4z" />
                <path d="m8 13 3-3 2 2 3-4" />
                <path d="M9 21h6m-3-4v4" />
              </svg>
            </div>
            <h3 className="sr-font-heading font-semibold text-sm text-white">Live Whiteboard</h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Shared vector drawing canvas with geometric shapes, color swatches, sticky notes, and undo history.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/[0.07] hover:border-purple-500/30 transition-all group backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
              </svg>
            </div>
            <h3 className="sr-font-heading font-semibold text-sm text-white">Watch Together</h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Synchronous YouTube lecture co-watching with synced play, pause, seek, and playback rates.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/[0.07] hover:border-indigo-500/30 transition-all group backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="13" rx="2" />
                <path d="M8 21h8m-4-4v4m-2-10 2-2 2 2" />
              </svg>
            </div>
            <h3 className="sr-font-heading font-semibold text-sm text-white">Screen Sharing</h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              Present documents, code editors, and slides with configurable stream quality and audio sharing.
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 w-full border-t border-white/[0.05] py-6 px-6 text-center text-xs text-slate-500">
        <p>StudyRooms — Connect. Collaborate. Learn. Guest-first study platform.</p>
      </footer>
    </div>
  );
}
