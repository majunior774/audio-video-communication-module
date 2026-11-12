# Document 04: Implementation Roadmap, Risk Mitigation & QA Plan (Updated)

## 1. Strict Phase-by-Phase Workflow

Each phase must be implemented individually. Under no circumstances will multiple phases be combined or implemented concurrently.

For every phase:
1. **Explain the intended changes** in detail.
2. **List all files** to be modified or created.
3. **Detail potential impact** on existing functionality.
4. **Implement only the approved phase**.
5. **Execute build and lint verification** (`npm run build`, `npm run lint`).
6. **Report findings** and present live progress.
7. **Wait for explicit user approval** before proceeding to the subsequent phase.

---

## 2. Implementation Phases Breakdown

### Phase 1: Brand Tokens, Fonts & Shared Assets (APPROVED TO BEGIN)
- **Files Modified**: `Frontend/index.html`, `Frontend/src/index.css`.
- **Files Created**: `Frontend/src/components/StudyRoomsBrand.jsx`.
- **Scope**:
  - Load `Space Grotesk` font from Google Fonts alongside `Inter`.
  - Register StudyRooms design tokens in `index.css` (`--sr-bg: #080F1A;`, etc.).
  - Implement the geometric interlocking S SVG symbol and responsive wordmark.
- **Impact on Functionality**: **ZERO**. No logic or media connections are touched.

### Phase 2: Navigation & View Controller
- **Files Modified**: `Frontend/src/App.jsx`.
- **Scope**:
  - Implement view state management (`'landing'`, `'dashboard'`, `'lobby'`, `'room'`).
  - Ensure `getUserMedia` is **NOT** invoked on Landing Page or Dashboard.
  - Implement direct room link detection (`?room=xyz`) transitioning straight to the Lobby.
- **Impact on Functionality**: Critical inspection of `useEffect` cleanup handlers to prevent premature track stopping or socket reconnections.

### Phase 3: Landing Page & Study Dashboard
- **Files Created**: `Frontend/src/pages/LandingPage.jsx`, `Frontend/src/pages/Dashboard.jsx`.
- **Scope**:
  - Render responsive hero and feature pillars.
  - Render room launcher, join by code input, and `localStorage`-backed recent room history.
- **Impact on Functionality**: Purely presentational; passes room navigation events to `App.jsx`.

### Phase 4: Pre-Join Device Lobby
- **Files Created**: `Frontend/src/pages/PreJoinLobby.jsx`.
- **Scope**:
  - Local video mirror and audio track check.
  - Device toggles (mic/cam/flip) and invite link copy button.
- **Impact on Functionality**: Previews the media stream before joining the room; stream is handed off seamlessly to `VideoCall`.

### Phase 5: Video Call Room Visual Polish
- **Files Modified**: `Frontend/src/pages/video_call.jsx`, `Frontend/src/pages/video_call.css`.
- **Scope**:
  - Re-skin header, adaptive grid tiles, solo radar view, and Slate floating dock.
  - Re-skin screen share modal.
- **Impact on Functionality**: Preserve all props, WebRTC video refs, and screen share controls.

### Phase 6: Whiteboard & WatchTogether Visual Harmonization
- **Files Modified**: `Frontend/src/components/Whiteboard.css`, `Frontend/src/components/YouTubeWatchTogether.css`.
- **Scope**:
  - CSS updates to match Slate and Indigo design tokens.
  - No changes to SVG coordinate math, canvas scaling, or YouTube playback synchronization.
- **Impact on Functionality**: Visual styling only.

### Phase 7: Verification & Cross-Browser Responsive Testing
- **Scope**:
  - Comprehensive testing across Mobile (375px–480px), Tablet (481px–1024px), and Desktop (1025px+).
  - Verify WebRTC peer connection, screen sharing, and socket sync remain 100% functional.

---

## 3. Risk Mitigation Matrix

| Potential Risk | Root Cause | Preventive Measure |
| :--- | :--- | :--- |
| **Premature Media Access** | Requesting permissions on landing page mount. | Remove root-level `getUserMedia` invocation from initial page load; defer to `startCamera()` only upon entering `PreJoinLobby`. |
| **Stream Interruption on Transition** | Cleaning up tracks on component unmount during view change. | Store `localStream` in an persistent ref at the top-level `App` scope; do not stop tracks during transitions between Lobby and Meeting Room. |
| **Socket Connection Churn** | Re-instantiating `io(serverUrl)` when changing views. | Single persistent socket connection retained across all views. |
| **Whiteboard Coordinate Distortion** | Modifying SVG `viewBox` or canvas scaling math. | Strictly limit Whiteboard modifications to CSS styling without touching `Whiteboard.jsx` drawing code. |
| **Mobile Safari Layout Shifting** | Using `100vh` on mobile browsers. | Implement `100dvh` (dynamic viewport height) and `env(safe-area-inset-*)`. |
