# StudyRooms — Complete UI Redesign Plan (Corrected & Approved)

**Product Name:** StudyRooms  
**Tagline:** Connect. Collaborate. Learn.  
**Author:** Ayush Aryan & Engineering Team  
**Date:** November 2026  
**Document Status:** Approved Architecture — Phase-by-Phase Execution  

---

## Executive Summary

This document package contains the technical audit and visual redesign specification for transforming our audio/video communication project into **StudyRooms**, a modern, high-aesthetic virtual study and collaboration platform.

### Core Directives
1. **Zero Functional Regression**: Absolutely no changes to WebRTC peer connection management, Socket.IO signaling events, media stream handling, collaborative whiteboard synchronization, or YouTube Watch Together logic.
2. **Correct Media Lifecycle**: No camera/mic requests on the landing page or dashboard. Media is initialized strictly upon entering the Pre-Join Lobby.
3. **Guest-First Architecture**: No fake or disconnected authentication screens. Recent room history is persisted locally via browser `localStorage` and clearly labeled as device-stored.
4. **Accurate Representation**: No unsupported performance claims (e.g., no guaranteed 60fps, guaranteed HD, or unlimited participants).
5. **Phase-by-Phase Execution**: Each phase is reviewed, verified via build checks, and approved before proceeding to the next.

---

## Document Package Contents

| Document | Description |
| :--- | :--- |
| **[01-ARCHITECTURE-AUDIT.md](./01-ARCHITECTURE-AUDIT.md)** | Technical inspection of codebase, WebRTC lifecycle, Socket.IO event dictionary, and guest-first data model. |
| **[02-VISUAL-IDENTITY-AND-DESIGN-SYSTEM.md](./02-VISUAL-IDENTITY-AND-DESIGN-SYSTEM.md)** | Color tokens, typography standards, geometric S-logo vector specification, glassmorphism parameters, and UI components. |
| **[03-PAGE-BY-PAGE-SPECIFICATIONS.md](./03-PAGE-BY-PAGE-SPECIFICATIONS.md)** | UI/UX specifications for Landing Page, Dashboard, Pre-Join Lobby, Video Room, Whiteboard, and Watch Together. |
| **[04-IMPLEMENTATION-ROADMAP-AND-RISKS.md](./04-IMPLEMENTATION-ROADMAP-AND-RISKS.md)** | Strict 7-phase implementation plan, risk mitigation matrix, and QA checklist. |

---

## Quick Reference: Brand Palette

```css
--sr-bg:             #080F1A;  /* Application canvas background */
--sr-surface:        #1E293B;  /* Elevated cards, sidebars, video tiles */
--sr-primary:        #6366F1;  /* Primary brand buttons, active highlights */
--sr-secondary:      #06B6D4;  /* Glowing accents, status badges */
--sr-accent:         #A855F7;  /* Gradient bridges, sticky highlights */
--sr-border:         rgba(255, 255, 255, 0.08); /* 1px crisp borders */
--sr-glass-bg:       rgba(30, 41, 59, 0.72);    /* Glassmorphic backdrop with 20px blur */
```
