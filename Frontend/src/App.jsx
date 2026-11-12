import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { io } from 'socket.io-client';
import VideoCall from './pages/video_call';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import PreJoinLobby from './pages/PreJoinLobby';

const waitForStablePeer = (peer) => {
  if (peer.signalingState === 'stable') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      peer.removeEventListener('signalingstatechange', onStateChange);
      reject(new Error('Timed out waiting for the peer connection to become stable.'));
    }, 10000);
    const onStateChange = () => {
      if (peer.signalingState === 'stable') {
        window.clearTimeout(timeoutId);
        peer.removeEventListener('signalingstatechange', onStateChange);
        resolve();
      } else if (peer.signalingState === 'closed') {
        window.clearTimeout(timeoutId);
        peer.removeEventListener('signalingstatechange', onStateChange);
        reject(new Error('The peer connection closed during screen-share negotiation.'));
      }
    };
    peer.addEventListener('signalingstatechange', onStateChange);
  });
};

const turnUrls = import.meta.env.VITE_TURN_URLS
  ?.split(',')
  .map((url) => url.trim())
  .filter(Boolean) ?? [];
const turnUsername = import.meta.env.VITE_TURN_USERNAME?.trim();
const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

if (turnUrls.length > 0 && (!turnUsername || !turnCredential)) {
  console.error(
    'TURN URLs are configured, but VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL are required.'
  );
}

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  ...(turnUrls.length > 0 && turnUsername && turnCredential
    ? [{ urls: turnUrls, username: turnUsername, credential: turnCredential }]
    : []),
];

function capSenderBitrate(sender, maxBitrate) {
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) {
    throw new Error('The sender has no bitrate encoding to configure.');
  }
  const [encoding, ...otherEncodings] = parameters.encodings ?? [];
  parameters.encodings = [
    { ...encoding, maxBitrate },
    ...otherEncodings,
  ];
  return sender.setParameters(parameters);
}

function tryCapSenderBitrate(sender, maxBitrate) {
  if (!sender?.track) return Promise.resolve();
  return Promise.resolve().then(() => capSenderBitrate(sender, maxBitrate));
}

async function logIceConnectionType(peer, userId) {
  const stats = await peer.getStats();
  let selectedPair;

  stats.forEach((report) => {
    if (
      report.type === 'candidate-pair' &&
      report.state === 'succeeded' &&
      report.nominated
    ) {
      selectedPair = report;
    }
  });

  if (!selectedPair) {
    console.log(`⏳ No selected ICE candidate pair yet for ${userId}`);
    return;
  }

  const localCandidate = stats.get(selectedPair.localCandidateId);
  const remoteCandidate = stats.get(selectedPair.remoteCandidateId);

  if (
    localCandidate?.candidateType === 'relay' ||
    remoteCandidate?.candidateType === 'relay'
  ) {
    console.log(`👍 TURN SERVER IS WORKING with user: ${userId}`, {
      localCandidate: localCandidate?.candidateType,
      remoteCandidate: remoteCandidate?.candidateType,
    });
  } else {
    console.log(`✅ Direct connection (no TURN relay) with user: ${userId}`, {
      localCandidate: localCandidate?.candidateType,
      remoteCandidate: remoteCandidate?.candidateType,
    });
  }
}

function recordRecentRoom(id) {
  if (!id) return;
  try {
    const raw = localStorage.getItem('sr_recent_rooms');
    const existing = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((item) => item.id !== id);
    const updated = [{ id, visitedAt: Date.now() }, ...filtered].slice(0, 8);
    localStorage.setItem('sr_recent_rooms', JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recent room to localStorage:', e);
  }
}

function App() {
  // Navigation & View Controller
  const getInitialState = () => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room')?.trim();
    if (roomParam) {
      return { view: 'lobby', room: roomParam };
    }
    return { view: 'landing', room: '' };
  };

  const [initial] = useState(getInitialState);
  const [currentView, setCurrentView] = useState(initial.view); // 'landing' | 'dashboard' | 'lobby' | 'room'
  const [roomId, setRoomId] = useState(initial.room);

  // Device & Camera State
  const [cameraFacingMode, setCameraFacingMode] = useState('user');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraSwitching, setCameraSwitching] = useState(false);
  const [cameraError, setCameraError] = useState('');

  // Signalling Server URL
  const serverUrl = import.meta.env.DEV
    ? window.location.origin
    : import.meta.env.VITE_SERVER_URL;

  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);

  // Video / Audio Refs
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraSwitchInProgressRef = useRef(false);

  // WebRTC Peer & Screen Share Refs
  const pendingCandidatesRef = useRef(new Map());
  const peersRef = useRef(new Map());
  const screenShareSendersRef = useRef(new Map());
  const screenNegotiationQueuesRef = useRef(new Map());
  const makingOfferRef = useRef(new Set());
  const screenShareStreamRef = useRef(null);
  const screenShareEndedHandlerRef = useRef(null);
  const screenSharesRef = useRef(new Map());
  const roomIdRef = useRef(roomId);

  const [remoteStreams, setRemoteStreams] = useState([]);
  const [screenShareStream, setScreenShareStream] = useState(null);

  // Keep roomIdRef in sync
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Browser navigation (Back / Forward)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room')?.trim();
      if (roomParam) {
        setRoomId(roomParam);
        roomIdRef.current = roomParam;
        setCurrentView('lobby');
      } else {
        setRoomId('');
        roomIdRef.current = '';
        setCurrentView('landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ─── Camera Access (Only triggered in Lobby or Meeting) ───
  const startCamera = useCallback(async () => {
    if (localStreamRef.current) {
      setCameraReady(true);
      if (localVideoRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      return localStreamRef.current;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacingMode } },
        audio: true,
      });
      localStreamRef.current = stream;
      setCameraReady(true);
      setCameraError('');
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Failed to access camera/microphone:', err);
      setCameraError(`Camera access failed: ${err.message}`);
      throw err;
    }
  }, [cameraFacingMode]);

  // Initialize camera only when in Lobby or Room
  useEffect(() => {
    if (currentView === 'lobby' || currentView === 'room') {
      if (!localStreamRef.current) {
        startCamera().catch(console.error);
      } else if (localVideoRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  }, [currentView, startCamera]);

  // Global teardown on component unmount
  useEffect(() => {
    const peers = peersRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const screenShareSenders = screenShareSendersRef.current;
    const screenShares = screenSharesRef.current;

    return () => {
      screenShareStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenShareStreamRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      for (const peer of peers.values()) {
        peer.close();
      }
      peers.clear();
      pendingCandidates.clear();
      screenShareSenders.clear();
      screenShares.clear();
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ─── Screen Sharing Publish Helpers ───
  const publishScreenShareState = useCallback((streamId = screenShareStreamRef.current?.id) => {
    if (!streamId) return;
    socketRef.current?.emit('screen-share:state', {
      roomId: roomIdRef.current,
      sharing: true,
      streamId,
      trackMids: Object.fromEntries(
        [...screenShareSendersRef.current.entries()].map(([peerId, senders]) => [
          peerId,
          {
            video: senders.videoTransceiver?.mid ?? null,
            audio: senders.audioTransceiver?.mid ?? null,
          },
        ])
      ),
    });
  }, []);

  const renegotiateScreenPeer = useCallback((userId, peer) => {
    const previous = screenNegotiationQueuesRef.current.get(userId) ?? Promise.resolve();
    const negotiation = previous
      .catch((error) => {
        console.error(`Previous screen-share negotiation with ${userId} failed:`, error);
      })
      .then(async () => {
        await waitForStablePeer(peer);
        if (peer.signalingState === 'closed') return;
        makingOfferRef.current.add(userId);
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socketRef.current?.emit('offer', {
            offer,
            target: userId,
          });
          publishScreenShareState();
        } finally {
          makingOfferRef.current.delete(userId);
        }
      });
    screenNegotiationQueuesRef.current.set(userId, negotiation);
    return negotiation.finally(() => {
      if (screenNegotiationQueuesRef.current.get(userId) === negotiation) {
        screenNegotiationQueuesRef.current.delete(userId);
      }
    });
  }, [publishScreenShareState]);

  const stopScreenShare = useCallback(async () => {
    const stream = screenShareStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && screenShareEndedHandlerRef.current) {
      videoTrack.removeEventListener('ended', screenShareEndedHandlerRef.current);
    }
    screenShareEndedHandlerRef.current = null;

    const peers = [...peersRef.current.entries()];
    const replaceResults = await Promise.allSettled(peers.map(async ([userId, peer]) => {
      const senders = screenShareSendersRef.current.get(userId);
      if (!senders) return;
      const tracks = [];
      if (senders.video) tracks.push(senders.video.replaceTrack(null));
      if (senders.audio) tracks.push(senders.audio.replaceTrack(null));
      await Promise.all(tracks);
      if (senders.videoTransceiver) senders.videoTransceiver.direction = 'recvonly';
      if (senders.audioTransceiver) senders.audioTransceiver.direction = 'recvonly';
      await renegotiateScreenPeer(userId, peer);
    }));

    screenShareStreamRef.current = null;
    stream.getTracks().forEach((track) => track.stop());
    setScreenShareStream(null);
    socketRef.current?.emit('screen-share:state', {
      roomId: roomIdRef.current,
      sharing: false,
    });

    const failed = replaceResults.find((result) => result.status === 'rejected');
    if (failed) {
      throw new Error(
        `Could not stop sending a screen-share track: ${failed.reason?.message ?? failed.reason}`,
        { cause: failed.reason }
      );
    }
  }, [renegotiateScreenPeer]);

  const startScreenShare = useCallback(async ({
    width,
    height,
    frameRate,
    includeAudio,
  }) => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing requires a supported browser and a secure (HTTPS) page.');
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate },
      },
      audio: includeAudio,
    });
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('The selected source did not provide a video track.');
    }

    const audioTrack = stream.getAudioTracks()[0] ?? null;
    videoTrack.contentHint = 'detail';
    screenShareStreamRef.current = stream;
    try {
      const negotiations = [];
      for (const [userId, peer] of peersRef.current) {
        let senders = screenShareSendersRef.current.get(userId);
        if (!senders) {
          senders = {
            video: null,
            audio: null,
            videoTransceiver: null,
            audioTransceiver: null,
            cameraSenders: new Set(),
          };
          screenShareSendersRef.current.set(userId, senders);
        }

        if (senders.video) {
          await senders.video.replaceTrack(videoTrack);
          if (senders.videoTransceiver) senders.videoTransceiver.direction = 'sendrecv';
        } else {
          senders.video = peer.addTrack(videoTrack, stream);
          senders.videoTransceiver = peer.getTransceivers().find(
            (transceiver) => transceiver.sender === senders.video
          );
        }

        if (audioTrack) {
          if (senders.audio) {
            await senders.audio.replaceTrack(audioTrack);
            if (senders.audioTransceiver) senders.audioTransceiver.direction = 'sendrecv';
          } else {
            senders.audio = peer.addTrack(audioTrack, stream);
            senders.audioTransceiver = peer.getTransceivers().find(
              (transceiver) => transceiver.sender === senders.audio
            );
          }
        }
        negotiations.push(renegotiateScreenPeer(userId, peer));
      }
      await Promise.all(negotiations);
    } catch (error) {
      screenShareStreamRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
      await Promise.allSettled(
        [...screenShareSendersRef.current.values()].flatMap((senders) => [
          senders.video?.replaceTrack(null),
          senders.audio?.replaceTrack(null),
        ].filter(Boolean))
      );
      throw new Error(`Could not send the screen share: ${error.message}`, { cause: error });
    }

    const bitrateResults = await Promise.allSettled(
      [...screenShareSendersRef.current.values()].flatMap(({ video, audio }) => [
        tryCapSenderBitrate(video, 2_000_000),
        tryCapSenderBitrate(audio, 128_000),
      ])
    );
    const bitrateFailure = bitrateResults.find((result) => result.status === 'rejected');
    const bitrateWarning = bitrateFailure
      ? 'Screen sharing is active, but this browser could not apply the bandwidth limit.'
      : '';
    if (bitrateFailure) {
      console.warn('Could not limit screen-share bandwidth:', bitrateFailure.reason);
    }

    setScreenShareStream(stream);
    publishScreenShareState(stream.id);

    const onEnded = () => {
      stopScreenShare().catch((error) => {
        console.error('Failed to stop a screen share after the source ended:', error);
      });
    };
    screenShareEndedHandlerRef.current = onEnded;
    videoTrack.addEventListener('ended', onEnded, { once: true });

    if (includeAudio && !audioTrack) {
      return 'The selected source did not provide shareable audio. Screen video is still being shared.';
    }
    return bitrateWarning;
  }, [publishScreenShareState, renegotiateScreenPeer, stopScreenShare]);

  // ─── Camera Switching (User ⟷ Environment) ───
  const switchCamera = async () => {
    if (cameraSwitchInProgressRef.current) return;

    const localStream = localStreamRef.current;
    const currentVideoTrack = localStream?.getVideoTracks()[0];
    const nextFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    if (!localStream || !currentVideoTrack) {
      setCameraError('The camera is not ready yet.');
      return;
    }

    cameraSwitchInProgressRef.current = true;
    setCameraSwitching(true);
    setCameraError('');

    let nextVideoTrack;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextFacingMode } },
        audio: false,
      });
      nextVideoTrack = nextStream.getVideoTracks()[0];
      if (!nextVideoTrack) {
        throw new Error('No video track was returned by the selected camera.');
      }

      const videoSenders = [];
      for (const peer of peersRef.current.values()) {
        const sender = peer.getSenders().find(
          (s) => s.track?.kind === 'video'
        );
        if (sender) {
          videoSenders.push(sender);
        }
      }
      // remote peers update
      await Promise.all(videoSenders.map((sender) =>
        sender.replaceTrack(nextVideoTrack)
      ));
      // local update
      localStream.removeTrack(currentVideoTrack);
      localStream.addTrack(nextVideoTrack);

      currentVideoTrack.stop();
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      setCameraFacingMode(nextFacingMode);
    } catch (error) {
      nextVideoTrack?.stop();
      console.error('Failed to switch camera:', error);
      setCameraError(`Unable to switch camera: ${error.message}`);
    } finally {
      cameraSwitchInProgressRef.current = false;
      setCameraSwitching(false);
    }
  };

  // ─── WebRTC Mesh & Signaling Lifecycle (Active ONLY when currentView === 'room') ───
  useEffect(() => {
    if (currentView !== 'room' || !roomId) {
      return undefined;
    }

    let cancelled = false;
    roomIdRef.current = roomId;
    const peers = peersRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const screenShareSenders = screenShareSendersRef.current;
    const screenShares = screenSharesRef.current;

    const startSignaling = async () => {
      // Ensure media stream exists before signaling
      if (!localStreamRef.current) {
        await startCamera();
      }
      if (cancelled) return;

      socketRef.current = io(serverUrl, {
        transports: ['websocket'],
      });
      setSocket(socketRef.current);

      const addPendingCandidates = async (userId, peer) => {
        const candidatesOfUser = pendingCandidatesRef.current.get(userId) || [];
        for (const candidate of candidatesOfUser) {
          try {
            await peer.addIceCandidate(candidate);
          } catch (error) {
            console.error('Failed to add queued ICE candidate:', error);
          }
        }
        pendingCandidatesRef.current.delete(userId);
      };

      const constrainScreenShareSenders = async (userId) => {
        if (!screenShareStreamRef.current) return;
        const senders = screenShareSendersRef.current.get(userId);
        if (!senders) return;
        const results = await Promise.allSettled([
          tryCapSenderBitrate(senders.video, 2_000_000),
          tryCapSenderBitrate(senders.audio, 128_000),
        ]);
        for (const result of results) {
          if (result.status === 'rejected') {
            console.warn(`Could not limit screen-share bandwidth for ${userId}:`, result.reason);
          }
        }
      };

      const refreshScreenSenders = (userId, peer) => {
        const senders = screenShareSendersRef.current.get(userId);
        if (!senders) return;
        const candidates = peer.getTransceivers().filter(
          (transceiver) => !senders.cameraSenders.has(transceiver.sender)
        );
        senders.videoTransceiver ??= candidates.find(
          (transceiver) => transceiver.receiver.track.kind === 'video'
        );
        senders.audioTransceiver ??= candidates.find(
          (transceiver) => transceiver.receiver.track.kind === 'audio'
        );
        senders.video ??= senders.videoTransceiver?.sender;
        senders.audio ??= senders.audioTransceiver?.sender;
      };

      const configurePeerConnection = (peer, userId) => {
        peer.onicecandidate = (e) => {
          if (e.candidate && userId) {
            socketRef.current?.emit('candidate', {
              candidate: e.candidate,
              target: userId,
            });
          }
        };
        peer.onicecandidateerror = (event) => {
          console.error(`ICE candidate gathering failed for ${userId}:`, {
            url: event.url,
            errorCode: event.errorCode,
            errorText: event.errorText,
          });
        };
        peer.ontrack = (e) => {
          const stream = e.streams[0] ?? new MediaStream([e.track]);
          const share = screenSharesRef.current.get(userId);
          const mid = e.transceiver.mid;
          const source = share?.streamId === stream.id ||
            (share?.videoMid && share.videoMid === mid) ||
            (share?.audioMid && share.audioMid === mid)
            ? 'screen'
            : 'camera';

          setRemoteStreams((previous) => {
            const exists = previous.some(
              (item) => item.userId === userId && item.stream.id === stream.id
            );
            if (exists) {
              return previous.map((item) =>
                item.userId === userId && item.stream.id === stream.id
                  ? { ...item, stream, source, mids: [...new Set([...item.mids, mid])] }
                  : item
              );
            }
            return [...previous, { userId, stream, source, mids: [mid] }];
          });
        };

        peer.onconnectionstatechange = () => {
          console.log(`CONNECTION with ${userId}:`, peer.connectionState);
          if (peer.connectionState === 'connected') {
            logIceConnectionType(peer, userId).catch(console.error);
          }
        };
      };

      const ensurePeerConnection = (userId, reserveScreenReceiveSlots = false) => {
        const existingPeer = peersRef.current.get(userId);
        if (existingPeer && existingPeer.signalingState !== 'closed') return existingPeer;

        const peer = new RTCPeerConnection({ iceServers });
        configurePeerConnection(peer, userId);

        const localStream = localStreamRef.current;
        if (!localStream) {
          throw new Error('Local media stream is not ready');
        }
        const localAudioTrack = localStream.getAudioTracks()[0];
        const localVideoTrack = localStream.getVideoTracks()[0];
        if (!localAudioTrack || !localVideoTrack) {
          throw new Error('Both camera and microphone tracks are required to join the call');
        }

        const cameraSenders = new Set([
          peer.addTrack(localAudioTrack, localStream),
          peer.addTrack(localVideoTrack, localStream),
        ]);
        const senders = {
          video: null,
          audio: null,
          videoTransceiver: null,
          audioTransceiver: null,
          cameraSenders,
        };
        const screenStream = screenShareStreamRef.current;
        const screenVideoTrack = screenShareStreamRef.current?.getVideoTracks()[0];
        const screenAudioTrack = screenShareStreamRef.current?.getAudioTracks()[0];
        if (screenVideoTrack) {
          senders.video = peer.addTrack(screenVideoTrack, screenStream);
        } else if (reserveScreenReceiveSlots) {
          senders.videoTransceiver = peer.addTransceiver('video', { direction: 'recvonly' });
          senders.video = senders.videoTransceiver.sender;
        }
        if (screenAudioTrack) {
          senders.audio = peer.addTrack(screenAudioTrack, screenStream);
        } else if (reserveScreenReceiveSlots) {
          senders.audioTransceiver = peer.addTransceiver('audio', { direction: 'recvonly' });
          senders.audio = senders.audioTransceiver.sender;
        }
        screenShareSendersRef.current.set(userId, senders);
        refreshScreenSenders(userId, peer);

        peersRef.current.set(userId, peer);
        return peer;
      };

      // ── Socket Events ──
      socketRef.current.on('connect', () => {
        console.log(`Connected to StudyRooms signalling: ${socketRef.current.id}`);
        socketRef.current.emit('join-room', roomId);
      });
      socketRef.current.on('connect_error', (error) => {
        console.error('Socket connection failed:', error.message);
      });

      socketRef.current.on('user-joined', (userId) => {
        console.log(`Study partner joined: ${userId}`);
      });

      socketRef.current.on('user-left', (userId) => {
        console.log(`User left: ${userId}`);
        const peer = peersRef.current.get(userId);
        if (peer) {
          peer.close();
          peersRef.current.delete(userId);
        }
        pendingCandidatesRef.current.delete(userId);
        screenShareSendersRef.current.delete(userId);
        screenNegotiationQueuesRef.current.delete(userId);
        makingOfferRef.current.delete(userId);
        screenSharesRef.current.delete(userId);
        setRemoteStreams((previous) => previous.filter((item) => item.userId !== userId));
      });

      socketRef.current.on('screen-share:state', ({
        roomId: eventRoomId,
        userId,
        sharing,
        streamId,
        trackMids,
      }) => {
        if (eventRoomId !== roomId) return;
        let share = null;
        if (sharing && typeof streamId === 'string') {
          const mids = trackMids?.[socketRef.current.id];
          share = {
            streamId,
            videoMid: mids?.video ?? null,
            audioMid: mids?.audio ?? null,
          };
          screenSharesRef.current.set(userId, share);
        } else {
          screenSharesRef.current.delete(userId);
        }
        setRemoteStreams((previous) => {
          const remotes = sharing
            ? previous
            : previous.filter((item) => item.userId !== userId || item.source !== 'screen');
          return remotes.map((item) =>
            item.userId === userId
              ? {
                  ...item,
                  source: sharing && (
                    item.stream.id === streamId ||
                    (share.videoMid && item.mids.includes(share.videoMid)) ||
                    (share.audioMid && item.mids.includes(share.audioMid))
                  )
                    ? 'screen'
                    : 'camera',
                }
              : item
          );
        });
      });

      socketRef.current.on('existing-users', async (users) => {
        for (const Id of users) {
          try {
            const peer = ensurePeerConnection(Id, true);
            makingOfferRef.current.add(Id);
            try {
              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);
              socketRef.current.emit('offer', { offer, target: Id });
              publishScreenShareState();
            } finally {
              makingOfferRef.current.delete(Id);
            }
          } catch (error) {
            console.log('Failed to create offer:', error);
          }
        }
      });

      socketRef.current.on('offer', async ({ offer, from }) => {
        try {
          const peer = ensurePeerConnection(from);
          const offerCollision = makingOfferRef.current.has(from) || peer.signalingState !== 'stable';
          const polite = socketRef.current.id.localeCompare(from) > 0;
          if (offerCollision && !polite) return;
          if (offerCollision && peer.signalingState === 'have-local-offer') {
            await peer.setLocalDescription({ type: 'rollback' });
          }
          if (peer.signalingState !== 'stable') {
            throw new Error(`Cannot accept offer while signaling is ${peer.signalingState}`);
          }
          makingOfferRef.current.delete(from);
          await peer.setRemoteDescription(offer);
          refreshScreenSenders(from, peer);
          await addPendingCandidates(from, peer);

          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await constrainScreenShareSenders(from);

          socketRef.current.emit('answer', { answer, target: from });
          publishScreenShareState();
        } catch (error) {
          console.error('Failed to handle offer:', error);
        }
      });

      socketRef.current.on('answer', async ({ answer, from }) => {
        try {
          const peer = peersRef.current.get(from);
          if (!peer) return;
          await peer.setRemoteDescription(answer);
          refreshScreenSenders(from, peer);
          await addPendingCandidates(from, peer);
          await constrainScreenShareSenders(from);
          publishScreenShareState();
        } catch (error) {
          console.error('Answer handling error:', error);
        }
      });

      socketRef.current.on('candidate', async ({ candidate, from }) => {
        try {
          const peer = peersRef.current.get(from);
          if (!peer) {
            const queued = pendingCandidatesRef.current.get(from) || [];
            queued.push(candidate);
            pendingCandidatesRef.current.set(from, queued);
            return;
          }
          if (peer.remoteDescription) {
            await peer.addIceCandidate(candidate);
          } else {
            const queued = pendingCandidatesRef.current.get(from) || [];
            queued.push(candidate);
            pendingCandidatesRef.current.set(from, queued);
          }
        } catch (error) {
          console.error('Failed to add candidate:', error);
        }
      });
    };

    startSignaling().catch(console.error);

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      for (const peer of peers.values()) {
        peer.close();
      }
      peers.clear();
      pendingCandidates.clear();
      screenShareSenders.clear();
      screenShares.clear();
      setRemoteStreams([]);
    };
  }, [currentView, publishScreenShareState, renegotiateScreenPeer, roomId, serverUrl, startCamera]);

  // ─── User Navigation Handlers ───
  const handleCreateRoom = useCallback(() => {
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const newRoomId = `study-${randomSuffix}`;
    setRoomId(newRoomId);
    roomIdRef.current = newRoomId;
    window.history.pushState({}, '', `?room=${encodeURIComponent(newRoomId)}`);
    setCurrentView('lobby');
  }, []);

  const handleJoinRoom = useCallback((targetId) => {
    const cleanId = (targetId || '').trim();
    if (!cleanId) return;
    setRoomId(cleanId);
    roomIdRef.current = cleanId;
    window.history.pushState({}, '', `?room=${encodeURIComponent(cleanId)}`);
    setCurrentView('lobby');
  }, []);

  const handleEnterMeeting = useCallback(() => {
    if (!roomId) return;
    recordRecentRoom(roomId);
    setCurrentView('room');
  }, [roomId]);

  const handleCancelLobby = useCallback(() => {
    // Stop local camera preview
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setCameraReady(false);
    window.history.pushState({}, '', window.location.pathname);
    setRoomId('');
    roomIdRef.current = '';
    setCurrentView('dashboard');
  }, []);

  const handleLeaveMeeting = useCallback(() => {
    // 1. Close peers
    for (const peer of peersRef.current.values()) {
      peer.close();
    }
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    screenShareSendersRef.current.clear();
    screenSharesRef.current.clear();
    makingOfferRef.current.clear();
    setRemoteStreams([]);

    // 2. Stop screen sharing
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((track) => track.stop());
      screenShareStreamRef.current = null;
      setScreenShareStream(null);
    }

    // 3. Stop local camera stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setCameraReady(false);

    // 4. Disconnect socket
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);

    // 5. Navigate to Dashboard
    window.history.pushState({}, '', window.location.pathname);
    setRoomId('');
    roomIdRef.current = '';
    setCurrentView('dashboard');
  }, []);

  // ─── View Router Render ───
  if (currentView === 'landing') {
    return (
      <LandingPage
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onOpenDashboard={() => setCurrentView('dashboard')}
      />
    );
  }

  if (currentView === 'dashboard') {
    return (
      <Dashboard
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onBackToHome={() => setCurrentView('landing')}
      />
    );
  }

  if (currentView === 'lobby') {
    return (
      <PreJoinLobby
        roomId={roomId}
        localVideoRef={localVideoRef}
        cameraReady={cameraReady}
        cameraSwitching={cameraSwitching}
        cameraError={cameraError}
        cameraFacingMode={cameraFacingMode}
        onSwitchCamera={switchCamera}
        onJoinRoom={handleEnterMeeting}
        onCancel={handleCancelLobby}
      />
    );
  }

  // Active Video Meeting Room
  return (
    <VideoCall
      localVideoRef={localVideoRef}
      remoteStreams={remoteStreams}
      cameraFacingMode={cameraFacingMode}
      cameraReady={cameraReady}
      cameraSwitching={cameraSwitching}
      cameraError={cameraError}
      onSwitchCamera={switchCamera}
      socket={socket}
      roomId={roomId}
      screenShareStream={screenShareStream}
      onStartScreenShare={startScreenShare}
      onStopScreenShare={stopScreenShare}
      onLeaveCall={handleLeaveMeeting}
    />
  );
}

export default App;
