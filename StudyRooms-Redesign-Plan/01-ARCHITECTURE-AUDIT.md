# Document 01: Current Technical Architecture Audit (Updated)

## 1. Project Topology

```
audio-video-communication-module/
├── Backend/
│   ├── src/
│   │   ├── server.js              # Express + HTTP server + Socket.IO server & WebRTC signaling broker
│   │   ├── whiteboard.js          # Room-based collaborative whiteboard event handlers & state store
│   │   ├── youtube.js             # Synchronized YouTube playback state broker
│   │   └── Routes/StreamRoute.js  # Test endpoints
│   ├── package.json               # express, socket.io, mongoose, cors, dotenv
│   └── .env                       # PORT=5000, MONGO_URI
└── Frontend/
    ├── public/                    # favicon.svg, icons.svg
    ├── src/
    │   ├── main.jsx               # React 19 mount point inside StrictMode
    │   ├── App.jsx                # WebRTC RTCPeerConnection coordinator, getUserMedia lifecycle
    │   ├── App.css & index.css    # Tailwind CSS v4 root styling & base resets
    │   ├── pages/
    │   │   ├── video_call.jsx     # Current video room UI (dock, grid, PIP, header, tools)
    │   │   └── video_call.css     # Video call styling (responsive breakpoints, layouts)
    │   └── components/
    │       ├── Whiteboard.jsx     # 1025-line SVG vector canvas & sticky note board
    │       ├── Whiteboard.css     # Whiteboard styling
    │       ├── YouTubeWatchTogether.jsx # YouTube IFrame API synchronized co-player
    │       └── YouTubeWatchTogether.css # WatchTogether styling
    ├── package.json               # react, socket.io-client, tailwindcss, @tailwindcss/vite, basic-ssl
    └── vite.config.js             # Vite 8 config with basic-ssl for local HTTPS
```

---

## 2. Authentication & Data Persistence Audit

1. **Authentication Status**:
   - There are **no authentication endpoints**, user tables, JWT tokens, or session validation in the backend.
   - The frontend operates in a **guest-first model**.
   - **Correction Applied**: No disconnected or fake login/auth screens will be introduced. The user joins as a guest with an optional display name stored locally.

2. **Room & Session Persistence Status**:
   - The backend currently stores active rooms solely in memory (`io.sockets.adapter.rooms`, `screenShares` Map, `boards` Map, and `videoRooms` Map).
   - **Correction Applied**: Recent study room history will use lightweight client-side `localStorage`. No mock or unauthorized database endpoints will be created. The UI will explicitly designate this as "Saved on this device".

---

## 3. Real-Time Signaling & WebRTC Lifecycle

The application operates as a mesh WebRTC network coordinated via Socket.IO:

```
[User A: Local Camera]                    [Backend: server.js]                    [User B: Remote Peer]
        │                                          │                                         │
        ├── join-room (roomId) ───────────────────►│                                         │
        │◄─ existing-users [User B] ───────────────┤                                         │
        │                                          ├──── user-joined (User A) ──────────────►│
        │                                          │                                         │
        ├── ensurePeerConnection()                 │                                         │
        ├── createOffer() ────────────────────────►│──── offer ─────────────────────────────►│
        │                                          │◄─── answer ─────────────────────────────┤
        │◄─ answer ────────────────────────────────┤                                         │
        │                                          │                                         │
        ├── candidate ────────────────────────────►│──── candidate ─────────────────────────►│
        │◄─ candidate ─────────────────────────────┤◄─── candidate ──────────────────────────┤
        │                                          │                                         │
        ▼════════════════════════════════════════════════════════════════════════════════════▼
                         [Direct P2P Encrypted Audio / Video Stream]
```

### Critical WebRTC Methods in `App.jsx`
1. **`startCamera()`**: Requests user media stream (`{ video: { facingMode: { ideal: 'user' } }, audio: true }`) and mounts it to `localVideoRef`.
2. **`ensurePeerConnection(userId, reserveScreenReceiveSlots)`**: Instantiates `RTCPeerConnection` with STUN/TURN ICE servers (`stun.l.google.com:19302` and configured TURN relays).
3. **`switchCamera()`**: Replaces the active video track using `sender.replaceTrack(nextVideoTrack)` across all connected peers without tearing down the call.
4. **`startScreenShare()`**: Invokes `navigator.mediaDevices.getDisplayMedia()`, applies bandwidth caps via `capSenderBitrate()` (2 Mbps video / 128 kbps audio), and renegotiates tracks.

---

## 4. Corrected Media Lifecycle Rules

1. **No Early Device Activation**: The Landing Page and Dashboard must **never** call `navigator.mediaDevices.getUserMedia()`.
2. **On-Demand Camera/Mic Check**: Device access is requested **only** when entering the Pre-Join Lobby or opening a direct meeting link.
3. **Preservation on Transition**: The stream initialized in the Pre-Join Lobby is passed directly into the active meeting room without calling `getTracks().forEach(t => t.stop())` or creating a second stream.
4. **No Spurious Socket Reconnections**: Moving between view states must never trigger a new `io(serverUrl)` instance.
5. **Intentional Termination Only**: Media tracks are stopped only when the user explicitly clicks "End Call" or leaves the session.
