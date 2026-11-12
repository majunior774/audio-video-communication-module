import { useState, useEffect } from 'react';
import StudyRoomsBrand from '../components/StudyRoomsBrand';

const TIMER_MODES = [
  { id: 'focus25', label: '25m Focus', minutes: 25 },
  { id: 'deep50', label: '50m Deep', minutes: 50 },
  { id: 'break5', label: '5m Break', minutes: 5 },
  { id: 'break15', label: '15m Rest', minutes: 15 },
];

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Previously';
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Dashboard({ onCreateRoom, onJoinRoom, onBackToHome }) {
  // Join room form state
  const [roomInput, setRoomInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Display Name personalization
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('sr_display_name') || '';
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);

  // Recent Rooms (Local persistence only)
  const [recentRooms, setRecentRooms] = useState(() => {
    try {
      const raw = localStorage.getItem('sr_recent_rooms');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to load recent rooms from localStorage:', e);
      return [];
    }
  });

  // Pomodoro Focus Timer State
  const [timerMode, setTimerMode] = useState('focus25');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  // Focus Timer interval effect
  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timerRunning]);

  const handleSelectTimerMode = (mode) => {
    setTimerMode(mode.id);
    setTimeLeft(mode.minutes * 60);
    setTimerRunning(false);
  };

  const handleToggleTimer = () => {
    if (timeLeft === 0) {
      const selected = TIMER_MODES.find((m) => m.id === timerMode) || TIMER_MODES[0];
      setTimeLeft(selected.minutes * 60);
      setTimerRunning(true);
    } else {
      setTimerRunning((prev) => !prev);
    }
  };

  const handleResetTimer = () => {
    setTimerRunning(false);
    const selected = TIMER_MODES.find((m) => m.id === timerMode) || TIMER_MODES[0];
    setTimeLeft(selected.minutes * 60);
  };

  const formatTimerMinutes = Math.floor(timeLeft / 60);
  const formatTimerSeconds = timeLeft % 60;
  const timerDisplay = `${String(formatTimerMinutes).padStart(2, '0')}:${String(
    formatTimerSeconds
  ).padStart(2, '0')}`;

  const currentModeMinutes = (TIMER_MODES.find((m) => m.id === timerMode) || TIMER_MODES[0]).minutes;
  const totalModeSeconds = currentModeMinutes * 60;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((totalModeSeconds - timeLeft) / totalModeSeconds) * 100)
  );

  // Display Name handlers
  const handleSaveDisplayName = (e) => {
    e?.preventDefault();
    const clean = nameDraft.trim();
    setDisplayName(clean);
    if (clean) {
      localStorage.setItem('sr_display_name', clean);
    } else {
      localStorage.removeItem('sr_display_name');
    }
    setIsEditingName(false);
  };

  const avatarInitials = (displayName || 'Guest User')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'GU';

  // Join Room handler
  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const trimmed = roomInput.trim();
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
      // not a full url
    }

    const clean = trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!clean) {
      setInputError('Invalid room code');
      return;
    }

    onJoinRoom(clean);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRoomInput(text);
        setInputError('');
      }
    } catch {
      // Clipboard blocked
    }
  };

  // Copy Room Link
  const copyRoomLink = (id) => {
    const origin = window.location.origin;
    const url = `${origin}/?room=${encodeURIComponent(id)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2200);
    }).catch(console.error);
  };

  // Delete single room from history
  const deleteRoomFromHistory = (idToDelete) => {
    setRecentRooms((prev) => {
      const updated = prev.filter((r) => r.id !== idToDelete);
      try {
        localStorage.setItem('sr_recent_rooms', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to update recent rooms:', e);
      }
      return updated;
    });
  };

  // Clear all history
  const clearHistory = () => {
    try {
      localStorage.removeItem('sr_recent_rooms');
    } catch (e) {
      console.error('Failed to clear recent rooms:', e);
    }
    setRecentRooms([]);
  };

  // Filtered rooms
  const filteredRooms = recentRooms.filter((room) => {
    if (!searchQuery.trim()) return true;
    return room.id.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  return (
    <div className="sr-light-page sr-dashboard relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden">
      {/* ── Top Header ── */}
      <header className="sr-dashboard__header relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-3 sm:gap-4">
          <StudyRoomsBrand size="md" />
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/90 text-[11px] font-semibold text-indigo-300 border border-indigo-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Study Hub
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Display Name Badge */}
          <div className="relative">
            {isEditingName ? (
              <form onSubmit={handleSaveDisplayName} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Your Name..."
                  autoFocus
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-indigo-500/50 text-white focus:outline-none w-28 sm:w-36"
                />
                <button
                  type="submit"
                  className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="px-1.5 py-1 text-[11px] text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  ✕
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(displayName);
                  setIsEditingName(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-xs text-slate-200 transition-all cursor-pointer group"
                title="Click to edit your study display name"
              >
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                  {avatarInitials}
                </div>
                <span className="max-w-[100px] truncate font-medium">
                  {displayName || 'Set Name'}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-slate-400 group-hover:text-white transition-colors"
                >
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onBackToHome}
            className="text-xs font-semibold px-3 sm:px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/10 transition-all active:scale-95 cursor-pointer"
          >
            ← Home
          </button>
        </div>
      </header>

      {/* ── Main Dashboard Content ── */}
      <main className="sr-dashboard__main relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 pt-8 pb-16 flex-1 flex flex-col gap-8">
        {/* Welcome Section & Quick Stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="sr-font-heading text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              Study Dashboard
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Welcome back{displayName ? `, ${displayName}` : ''}. Jump into a room, manage your focus sessions, or rejoin past study spaces.
            </p>
          </div>

          {/* Quick Stats Pills */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <div className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 backdrop-blur-sm flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <div className="text-left">
                <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                  Recent Rooms
                </p>
                <p className="text-xs font-bold text-white">{recentRooms.length} stored</p>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 backdrop-blur-sm flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${timerRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <div className="text-left">
                <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                  Focus Clock
                </p>
                <p className="text-xs font-bold text-white">{timerRunning ? 'Running' : 'Standby'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Grid: Launch Room + Join Room ── */}
        <div className="sr-dashboard__action-grid grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Start Instant Study Room */}
          <div className="sr-dashboard__card relative p-6 rounded-2xl bg-slate-900/80 border border-white/10 flex flex-col justify-between transition-all group overflow-hidden">
            <div>
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <h2 className="sr-font-heading text-lg font-bold text-white">
                Instant Study Room
              </h2>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                Create a room for your group, then use video, the shared whiteboard, or synchronized media as you study.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-3">
              <button
                type="button"
                onClick={onCreateRoom}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs tracking-wide shadow-lg shadow-indigo-600/25 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                Launch Room Now ➔
              </button>
              <p className="text-[11px] text-slate-400 text-center">
                Creates a shareable room link instantly
              </p>
            </div>
          </div>

          {/* Card 2: Join with Code or Link */}
          <div className="sr-dashboard__card relative p-6 rounded-2xl bg-slate-900/80 border border-white/10 flex flex-col justify-between transition-all group overflow-hidden">
            <div>
              <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <h2 className="sr-font-heading text-lg font-bold text-white">
                Join with Room Code
              </h2>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                Paste an invitation link or enter an existing alphanumeric room identifier to meet up with your study partners.
              </p>
            </div>

            <form onSubmit={handleJoinSubmit} className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-2.5">
              <div className="relative">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => {
                    setRoomInput(e.target.value);
                    if (inputError) setInputError('');
                  }}
                  placeholder="e.g. physics-prep or full link..."
                  className="w-full px-4 py-3 pr-14 rounded-xl bg-slate-800/80 border border-white/10 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[10px] uppercase font-semibold text-slate-400 hover:text-white bg-slate-700/60 hover:bg-slate-700 transition-all cursor-pointer"
                  title="Paste from clipboard"
                >
                  Paste
                </button>
              </div>

              {inputError && (
                <p className="text-[11px] text-rose-400 px-1">{inputError}</p>
              )}

              <button
                type="submit"
                disabled={!roomInput.trim()}
                className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-xs tracking-wide transition-all active:scale-[0.98] cursor-pointer shadow-md shadow-cyan-600/20"
              >
                Join Study Room ➔
              </button>
            </form>
          </div>
        </div>

        {/* ── Productivity Section: Focus Pomodoro Timer Widget ── */}
        <div className="sr-dashboard__panel sr-dashboard__timer p-6 rounded-2xl bg-slate-900/60 border border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h2 className="sr-font-heading text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  Focus Study Timer
                  {timerRunning && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Active
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-400">
                  Stay in the flow state with structured focus & rest intervals
                </p>
              </div>
            </div>

            {/* Mode Selector Tabs */}
            <div className="inline-flex p-1 rounded-xl bg-slate-950/80 border border-white/5 gap-1 overflow-x-auto">
              {TIMER_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleSelectTimerMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    timerMode === mode.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timer Display & Controls Row */}
          <div className="p-5 rounded-xl bg-slate-950/70 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              {/* Giant Space Grotesk Countdown */}
              <div className="sr-font-heading text-4xl sm:text-5xl font-bold tracking-tight text-white tabular-nums">
                {timerDisplay}
              </div>

              {/* Progress Bar Container */}
              <div className="w-32 sm:w-48 flex flex-col gap-1.5">
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{Math.round(progressPercent)}% elapsed</span>
                  <span>{currentModeMinutes}m</span>
                </div>
              </div>
            </div>

            {/* Timer Actions */}
            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={handleToggleTimer}
                className={`flex-1 md:flex-initial px-5 py-2.5 rounded-xl font-semibold text-xs tracking-wide transition-all shadow-md active:scale-95 cursor-pointer ${
                  timerRunning
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
                }`}
              >
                {timerRunning ? '⏸ Pause Focus' : timeLeft === 0 ? '↻ Restart' : '▶ Start Focus'}
              </button>

              <button
                type="button"
                onClick={handleResetTimer}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-white/10 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                title="Reset timer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ── Recent Rooms (Client-side localStorage) ── */}
        <div className="sr-dashboard__panel sr-dashboard__recent p-6 rounded-2xl bg-slate-900/60 border border-white/10">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="sr-font-heading text-base font-bold text-white">
                  Recent Study Rooms
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-white/5">
                  Local Device
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Quickly rejoin past collaborative sessions from this browser
              </p>
            </div>

            {/* Search Filter and Clear Button */}
            <div className="flex items-center gap-2">
              {recentRooms.length > 2 && (
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter rooms..."
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-white/10 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-28 sm:w-36"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {recentRooms.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors px-2.5 py-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Rooms List or Empty State */}
          {recentRooms.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-xl px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-white/5 flex items-center justify-center text-slate-400 mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-slate-300">
                No recent study rooms on this browser yet
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm mt-1">
                When you create or join a study room, it will appear here so you can rejoin with one click.
              </p>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No rooms match "{searchQuery}".
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className="py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group transition-colors"
                >
                  {/* Room Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                      #
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                        {room.id}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {formatRelativeTime(room.visitedAt)}
                      </p>
                    </div>
                  </div>

                  {/* Room Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Copy Link Button */}
                    <button
                      type="button"
                      onClick={() => copyRoomLink(room.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                        copiedId === room.id
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-800/80 hover:bg-slate-700/80 border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      {copiedId === room.id ? 'Copied Link! ✓' : 'Copy Link'}
                    </button>

                    {/* Rejoin Button */}
                    <button
                      type="button"
                      onClick={() => onJoinRoom(room.id)}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-sm shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
                    >
                      Rejoin ➔
                    </button>

                    {/* Delete item button */}
                    <button
                      type="button"
                      onClick={() => deleteRoomFromHistory(room.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Remove from history"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="sr-dashboard__footer relative z-10 w-full border-t border-white/[0.05] py-5 px-6 text-center text-xs text-slate-400">
        StudyRooms Hub • Client-managed session history • Connect. Collaborate. Learn.
      </footer>
    </div>
  );
}
