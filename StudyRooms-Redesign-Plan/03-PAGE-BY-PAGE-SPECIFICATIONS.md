# Document 03: Page-by-Page Specifications (Updated)

## 1. Landing Page (`src/pages/LandingPage.jsx`)

The landing page introduces StudyRooms with clear, accurate marketing and instant access.

### Accurate Capability Representation
- **Real-Time Video & Audio**: Peer-to-peer WebRTC communication with adaptive multi-peer grid.
- **Collaborative Whiteboard**: Synchronized SVG vector drawing, sticky notes, and geometric shapes.
- **Synchronized YouTube Sessions**: Co-watch educational videos and lectures with synchronized playback controls.
- **Screen Sharing**: Configurable quality presets (720p/1080p, 15/30/60 fps selection) leveraging browser display capture.
- **Zero Inaccurate Claims**: No unsupported claims regarding guaranteed 60fps, guaranteed HD, or specific encryption certifications.

```
┌────────────────────────────────────────────────────────────────────────┐
│ [S] StudyRooms             Features   Demo   About      [ Launch App ] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                  CONNECT. COLLABORATE. LEARN.                          │
│                                                                        │
│                  Real-Time Collaborative Study Spaces                  │
│       P2P video calling, interactive whiteboard, and synchronized      │
│                 study tools built for student groups.                  │
│                                                                        │
│        ┌─────────────────────────┐  ┌──────────────────────┐           │
│        │ [ Enter Room Code     ] │  │  [ Join Room ➔ ]     │           │
│        └─────────────────────────┘  └──────────────────────┘           │
│                    or [ + Start Instant Study Room ]                   │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               STUDYROOMS INTERFACE DEMO PREVIEW                  │  │
│  │   Clean Dark Mode Stage  •  Live Canvas  •  Synchronized Media   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │  P2P Video   │ │ Live Canvas  │ │ Watch Party  │ │ Screen Share │  │
│  │ Direct mesh  │ │ Realtime SVG │ │ Synchronized │ │ Configurable │  │
│  │ communication│ │ vector tools │ │ study media  │ │ window/tab   │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Study Dashboard (`src/pages/Dashboard.jsx`)

The user's productivity hub for managing sessions and launching rooms.

### Features
1. **Instant Room Creation**: One-click generation of a randomized, URL-safe room slug (`study-xxxx`).
2. **Join by Code / URL**: Input field accepting raw room IDs or full URLs (`https://.../?room=xyz`).
3. **Local Session History**:
   - Persisted via browser `localStorage`.
   - Distinct label: *"Recent Rooms (Saved locally on this device)"*.
   - Allows students to quickly rejoin previous rooms or clear their local list.
4. **Copy Invitation Link**: Generates a shareable URL containing the room query parameter.

---

## 3. Pre-Join Device Lobby (`src/pages/PreJoinLobby.jsx`)

The staging area ensuring camera and microphone readiness **before** entering the call.

### Media Handling Specification
- Camera & microphone access is requested **here for the first time**, never on the Landing Page.
- Live local video mirror with audio track status indicator.
- Toggle controls for microphone mute and camera off before connecting to peers.
- Camera flip button for mobile devices (User ⟷ Environment).
- Smooth transition into `VideoCall` without re-requesting or re-initializing media tracks.

---

## 4. Video Meeting Room (`src/pages/video_call.jsx`)

- **Header Bar**:
  - Interlocking StudyRooms logo + wordmark.
  - Room ID chip with one-click link copier.
  - Elapsed study session timer (`useElapsed`).
  - Active participant counter badge.
- **Adaptive Video Stage**:
  - High-performance adaptive video grid (1–4+ peers).
  - PiP for local video when remote participants are present.
  - Holographic focus ring for solo waiting state.
- **Floating Controls Dock**:
  - Sculpted Slate glassmorphic dock (`#1E293B` with `backdrop-filter: blur(20px)`).
  - Micro-interactions on hover and active states.
  - Microphone, Camera, Flip, Tools, and End Call buttons.
  - Reskinned Screen Share Quality Dialog.

---

## 5. Collaborative Whiteboard (`src/components/Whiteboard.jsx`)

### Visual Presentation Redesign Only
- **Codebase Protection**: No modifications to coordinate calculations, SVG paths, drawing math, or undo/redo logic.
- **Visual Harmonization**:
  - Container restyled to match `#1E293B` Slate theme.
  - Palette swatches updated with StudyRooms tones: Deep Navy (`#080F1A`), Electric Indigo (`#6366F1`), Cyan (`#06B6D4`), Purple (`#A855F7`), Emerald (`#10B981`), Crimson (`#EF4444`).
  - Modernized buttons, typography (`Space Grotesk` headings), and refined sticky note styling.

---

## 6. YouTube Watch Together (`src/components/YouTubeWatchTogether.jsx`)

- Visual restyle of the player container and controls to Deep Navy / Slate glassmorphism.
- Scrub bar themed with Electric Indigo progress and Cyan playhead.
- All playback synchronization events (`youtube:share`, `youtube:control`, `youtube:state`) preserved 100%.
