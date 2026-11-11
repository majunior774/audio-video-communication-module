import { useCallback, useEffect, useRef, useState } from 'react';
import './YouTubeWatchTogether.css';

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYBACK_RATES = new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
const YOUTUBE_API_URL = 'https://www.youtube.com/iframe_api';

let youtubeApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };

    let script = document.querySelector(`script[src="${YOUTUBE_API_URL}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = YOUTUBE_API_URL;
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener('error', () => {
      youtubeApiPromise = null;
      reject(new Error('Could not load the YouTube player.'));
    }, { once: true });
  });

  return youtubeApiPromise;
}

function parseVideoId(value) {
  const input = value.trim();
  if (YOUTUBE_ID_PATTERN.test(input)) return input;

  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }
  if (hostname !== 'youtube.com' && hostname !== 'youtube-nocookie.com') {
    return null;
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  const id = url.searchParams.get('v') ??
    (['embed', 'shorts', 'live', 'v'].includes(pathParts[0]) ? pathParts[1] : null);
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
}

function getTargetPosition(state) {
  if (!state) return 0;
  const elapsed = state.playing
    ? Math.max(0, Date.now() - state.updatedAt) / 1000
    : 0;
  return state.position + elapsed * state.playbackRate;
}

function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function YouTubeWatchTogether({ socket, roomId }) {
  const [videoInput, setVideoInput] = useState('');
  const [playback, setPlayback] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [needsPlaybackGesture, setNeedsPlaybackGesture] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState('');
  const playerHostRef = useRef(null);
  const playerContainerRef = useRef(null);
  const playerRef = useRef(null);
  const playbackRef = useRef(null);
  const socketRef = useRef(socket);
  const roomIdRef = useRef(roomId);
  const applyStateRef = useRef(null);
  const seekTimeRef = useRef(null);

  useEffect(() => {
    socketRef.current = socket;
    roomIdRef.current = roomId;
  }, [roomId, socket]);

  const applyPlaybackState = useCallback((state, forceLoad = false) => {
    const player = playerRef.current;
    const YT = window.YT;
    if (!player || !state || !YT?.PlayerState || !playerReady) return;

    if (!state.videoId) {
      if (player.getVideoData?.()?.video_id) {
        player.stopVideo();
      }
      return;
    }

    const targetPosition = getTargetPosition(state);
    const currentVideoId = player.getVideoData?.()?.video_id;
    const currentPlayerState = player.getPlayerState?.();
    const videoChanged = currentVideoId !== state.videoId;

    if (forceLoad || videoChanged) {
      const videoOptions = {
        videoId: state.videoId,
        startSeconds: targetPosition,
      };
      if (state.playing) {
        player.loadVideoById(videoOptions);
      } else {
        player.cueVideoById(videoOptions);
      }
      setNeedsPlaybackGesture(false);
    } else {
      const localTime = player.getCurrentTime?.() ?? 0;
      if (Math.abs(localTime - targetPosition) > 1.25) {
        player.seekTo(targetPosition, true);
      }

      const isLocallyPlaying = currentPlayerState === YT.PlayerState.PLAYING ||
        currentPlayerState === YT.PlayerState.BUFFERING;
      if (state.playing && !isLocallyPlaying) {
        player.playVideo();
      } else if (!state.playing && isLocallyPlaying) {
        player.pauseVideo();
      }
    }

    if (
      Number.isFinite(state.playbackRate) &&
      player.getPlaybackRate?.() !== state.playbackRate
    ) {
      player.setPlaybackRate(state.playbackRate);
    }

  }, [playerReady]);

  useEffect(() => {
    playbackRef.current = playback;
    applyStateRef.current = applyPlaybackState;
    if (playerReady && playback) applyPlaybackState(playback);
  }, [applyPlaybackState, playback, playerReady]);

  useEffect(() => {
    if (!socket) return undefined;

    const joinRoom = () => socket.emit('youtube:join', { roomId });
    const onState = (state) => {
      if (state.roomId !== roomId) return;
      setPlayback(state);
      setError('');
      if (!state.videoId) {
        seekTimeRef.current = null;
        setSeekTime(null);
        setCurrentTime(0);
        setDuration(0);
      }
      if (state.playing) setNeedsPlaybackGesture(false);
    };
    const onError = ({ message }) => setError(message);

    socket.on('connect', joinRoom);
    socket.on('youtube:state', onState);
    socket.on('youtube:error', onError);
    if (socket.connected) joinRoom();

    return () => {
      socket.off('connect', joinRoom);
      socket.off('youtube:state', onState);
      socket.off('youtube:error', onError);
    };
  }, [roomId, socket]);

  useEffect(() => {
    let cancelled = false;
    let player;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerHostRef.current) return;

        player = new YT.Player(playerHostRef.current, {
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              setPlayerReady(true);
              setVideoTitle(event.target.getVideoData?.()?.title ?? '');
              if (playbackRef.current) {
                applyStateRef.current?.(playbackRef.current, true);
              }
              event.target.setVolume(70);
            },
            onStateChange: (event) => {
              const YTState = window.YT?.PlayerState;
              if (!YTState) return;
              const loadedTitle = event.target.getVideoData?.()?.title;
              if (loadedTitle) setVideoTitle(loadedTitle);
              if (event.data === YTState.PLAYING) {
                setNeedsPlaybackGesture(false);
              } else if (event.data === YTState.ENDED) {
                socketRef.current?.emit('youtube:control', {
                  roomId: roomIdRef.current,
                  action: 'pause',
                  position: event.target.getDuration?.() ?? 0,
                });
              }
            },
            onAutoplayBlocked: () => setNeedsPlaybackGesture(true),
            onError: (event) => {
              const messages = {
                2: 'The YouTube video link or ID is invalid.',
                5: 'YouTube could not decode this video in the embedded player.',
                100: 'This video was removed, is private, or is unavailable.',
                101: 'The video owner does not allow embedded playback.',
                150: 'The video owner does not allow embedded playback.',
                153: 'YouTube could not verify the page that opened the player.',
              };
              setError(messages[event.data] ??
                `YouTube could not play this video (error ${event.data}).`);
            },
          },
        });
        playerRef.current = player;
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message);
      });

    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
      setPlayerReady(false);
      setVideoTitle('');
    };
  }, []);

  useEffect(() => {
    if (!playerReady || !playback?.videoId) return undefined;

    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const currentTime = player.getCurrentTime?.();
      const videoDuration = player.getDuration?.();
      const YTState = window.YT?.PlayerState;
      const sharedState = playbackRef.current;
      if (Number.isFinite(currentTime) && seekTimeRef.current === null) {
        setCurrentTime(currentTime);
      }
      if (Number.isFinite(videoDuration)) setDuration(videoDuration);
      setVolume(player.getVolume?.() ?? 70);
      setMuted(Boolean(player.isMuted?.()));

      if (
        Number.isFinite(currentTime) &&
        sharedState?.playing &&
        player.getPlayerState?.() === YTState?.PLAYING
      ) {
        const sharedPosition = getTargetPosition(sharedState);
        if (Math.abs(currentTime - sharedPosition) > 2) {
          player.seekTo(sharedPosition, true);
        }
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [playback?.videoId, playerReady]);

  const shareVideo = (event) => {
    event.preventDefault();
    const videoId = parseVideoId(videoInput);
    if (!videoId) {
      setError('Paste a valid YouTube video link or 11-character video ID.');
      return;
    }

    setError('');
    socket?.emit('youtube:share', { roomId, videoId });
    setVideoInput('');
  };

  const stopVideo = () => socket?.emit('youtube:clear', { roomId });

  const joinPlayback = () => {
    const player = playerRef.current;
    if (!player || !playback?.videoId) return;
    const position = getTargetPosition(playback);
    player.seekTo(position, true);
    player.playVideo();
    socketRef.current?.emit('youtube:control', {
      roomId: roomIdRef.current,
      action: 'play',
      position,
    });
    setNeedsPlaybackGesture(false);
  };

  const togglePlayback = () => {
    const player = playerRef.current;
    const YTState = window.YT?.PlayerState;
    if (!player || !YTState || !playback?.videoId) return;

    const position = player.getCurrentTime?.() ?? currentTime;
    if (player.getPlayerState() === YTState.PLAYING) {
      player.pauseVideo();
      socketRef.current?.emit('youtube:control', {
        roomId: roomIdRef.current,
        action: 'pause',
        position,
      });
    } else {
      player.playVideo();
      socketRef.current?.emit('youtube:control', {
        roomId: roomIdRef.current,
        action: 'play',
        position,
      });
    }
  };

  const commitSeek = () => {
    const position = seekTimeRef.current;
    if (position === null) return;
    seekTimeRef.current = null;
    setSeekTime(null);
    setCurrentTime(position);
    playerRef.current?.seekTo(position, true);
    socketRef.current?.emit('youtube:control', {
      roomId: roomIdRef.current,
      action: 'seek',
      position,
    });
  };

  const changePlaybackRate = (event) => {
    const playbackRate = Number(event.target.value);
    if (!PLAYBACK_RATES.has(playbackRate)) return;
    socketRef.current?.emit('youtube:control', {
      roomId: roomIdRef.current,
      action: 'rate',
      playbackRate,
    });
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted?.() || player.getVolume?.() === 0) {
      player.unMute();
      player.setVolume(volume || 70);
      setMuted(false);
      if (volume === 0) setVolume(70);
    } else {
      player.mute();
      setMuted(true);
    }
  };

  const changeVolume = (event) => {
    const nextVolume = Number(event.target.value);
    playerRef.current?.unMute();
    playerRef.current?.setVolume(nextVolume);
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  };

  const toggleFullscreen = async () => {
    const container = playerContainerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (fullscreenError) {
      setError(`Unable to change fullscreen: ${fullscreenError.message}`);
    }
  };

  useEffect(() => {
    const updateFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === playerContainerRef.current);
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  return (
    <section className="watch-together" aria-label="Watch YouTube together">
      <header className="watch-together-heading">
        <div className="watch-together-brand">
          <div className="watch-together-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
            </svg>
          </div>
          <div>
            <h2>Watch together</h2>
            <p>Playback stays in sync for everyone</p>
          </div>
        </div>
        {playback?.videoId && (
          <span className="watch-together-live">
            <span />
            Shared
          </span>
        )}
      </header>

      <form className="watch-together-share" onSubmit={shareVideo}>
        <label htmlFor="watch-together-url">YouTube link</label>
        <div className="watch-together-input-row">
          <input
            id="watch-together-url"
            value={videoInput}
            onChange={(event) => setVideoInput(event.target.value)}
            placeholder="Paste a YouTube link"
            autoComplete="url"
          />
          <button type="submit" disabled={!socket?.connected || !videoInput.trim()}>
            Share
          </button>
        </div>
      </form>

      {error && (
        <div className="watch-together-error" role="status">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button>
        </div>
      )}

      <div className="watch-together-player" ref={playerContainerRef}>
        <div className="watch-together-player-host" ref={playerHostRef} />
        {!playback?.videoId && (
          <div className="watch-together-empty">
            <div className="watch-together-empty-icon" aria-hidden="true">
              <svg width="27" height="27" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
              </svg>
            </div>
            <strong>Pick something to watch</strong>
            <span>Share a YouTube link and it will appear for everyone in this call.</span>
          </div>
        )}
        {needsPlaybackGesture && playback?.playing && (
          <div className="watch-together-play-overlay">
            <button type="button" onClick={joinPlayback}>
              Tap to join playback
            </button>
          </div>
        )}
        {playback?.videoId && (
          <div className="watch-together-controls" aria-label="Video controls">
            <div className="watch-together-seek-row">
              <span>{formatTime(seekTime ?? currentTime)}</span>
              <input
                type="range"
                min="0"
                max={Math.max(duration, 1)}
                step="0.1"
                value={Math.min(seekTime ?? currentTime, duration || 0)}
                aria-label="Seek video"
                onChange={(event) => {
                  const position = Number(event.target.value);
                  seekTimeRef.current = position;
                  setSeekTime(position);
                }}
                onPointerUp={commitSeek}
                onKeyUp={commitSeek}
                onBlur={commitSeek}
              />
              <span>{formatTime(duration)}</span>
            </div>
            <div className="watch-together-control-row">
              <button
                type="button"
                className="watch-together-control-button"
                onClick={togglePlayback}
                aria-label={playback.playing ? 'Pause for everyone' : 'Play for everyone'}
                title={playback.playing ? 'Pause for everyone' : 'Play for everyone'}
                disabled={!playerReady}
              >
                {playback.playing ? '❚❚' : '▶'}
              </button>
              <div className="watch-together-volume">
                <button
                  type="button"
                  className="watch-together-control-button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  title={muted ? 'Unmute' : 'Mute'}
                  disabled={!playerReady}
                >
                  {muted || volume === 0 ? '×' : '◖'}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={muted ? 0 : volume}
                  aria-label="Volume"
                  onChange={changeVolume}
                  disabled={!playerReady}
                />
              </div>
              <select
                value={playback.playbackRate ?? 1}
                onChange={changePlaybackRate}
                aria-label="Playback speed for everyone"
                title="Playback speed for everyone"
              >
                {Array.from(PLAYBACK_RATES).map((rate) => (
                  <option key={rate} value={rate}>{rate}x</option>
                ))}
              </select>
              <button
                type="button"
                className="watch-together-control-button watch-together-fullscreen"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? '↙' : '↗'}
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="watch-together-footer">
        <div className="watch-together-video-title">
          {videoTitle || (playback?.videoId ? 'Shared YouTube video' : 'No video selected')}
        </div>
        {playback?.videoId && (
          <button type="button" className="watch-together-stop" onClick={stopVideo}>
            Remove video
          </button>
        )}
        <span>Everyone can control playback</span>
      </footer>
    </section>
  );
}
