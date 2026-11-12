# Document 02: Visual Identity & Design System

## 1. Brand Identity Overview

- **Brand Name:** StudyRooms
- **Tagline:** Connect. Collaborate. Learn.
- **Personality:**
  - Modern and futuristic
  - Premium and professional
  - Clean and intuitive
  - Collaborative and welcoming
- **Core Aesthetic:** Dark mode elegance with controlled neon accents, subtle glassmorphism, and zero AI clutter.

---

## 2. Color Palette Specification

```
┌────────────────────────────────────────────────────────────────────────┐
│                              DEEP NAVY                                 │
│                               #080F1A                                  │
│                 Base canvas & application background                   │
└────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────┐    ┌───────────────────────────────┐
│           SURFACE SLATE           │    │        ELECTRIC INDIGO        │
│              #1E293B              │    │            #6366F1            │
│  Cards, panels, video tile frame  │    │     Primary brand actions     │
└───────────────────────────────────┘    └───────────────────────────────┘

┌───────────────────────────────────┐    ┌───────────────────────────────┐
│               CYAN                │    │            PURPLE             │
│              #06B6D4              │    │            #A855F7            │
│   Glowing edges, live statuses    │    │   Gradients, highlight notes  │
└───────────────────────────────────┘    └───────────────────────────────┘
```

### Complete CSS Custom Property Tokens
```css
:root {
  /* Surface & Background */
  --sr-bg: #080F1A;
  --sr-surface-subtle: #0F172A;
  --sr-surface: #1E293B;
  --sr-surface-hover: #26334D;
  --sr-surface-active: #334155;

  /* Brand Accents */
  --sr-primary: #6366F1;
  --sr-primary-hover: #4F46E5;
  --sr-secondary: #06B6D4;
  --sr-secondary-hover: #0891B2;
  --sr-accent: #A855F7;
  --sr-danger: #EF4444;
  --sr-danger-hover: #DC2626;
  --sr-success: #10B981;

  /* Text & Typography */
  --sr-text-primary: #F8FAFC;
  --sr-text-secondary: #94A3B8;
  --sr-text-muted: #64748B;

  /* Glassmorphism & Borders */
  --sr-border: rgba(255, 255, 255, 0.08);
  --sr-border-focus: rgba(99, 102, 241, 0.5);
  --sr-glass-bg: rgba(30, 41, 59, 0.72);
  --sr-glass-blur: blur(20px);
  --sr-shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.35);
  --sr-shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.6);

  /* Gradients */
  --sr-gradient-brand: linear-gradient(135deg, #6366F1 0%, #06B6D4 100%);
  --sr-gradient-subtle: linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.02) 100%);
  --sr-gradient-glow: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
}
```

---

## 3. Typography Rules

### Font Families
- **Headings & Hero Copy:** `Space Grotesk`, sans-serif (Weights: 600 SemiBold, 700 Bold)
- **Interface & Body Text:** `Inter`, system-ui, sans-serif (Weights: 400 Regular, 500 Medium, 600 SemiBold)

### Hierarchy Scale
| Level | Font | Size | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Title** | Space Grotesk | 48px – 56px | 1.1 | -0.03em | Landing page hero |
| **Section Title** | Space Grotesk | 28px – 32px | 1.2 | -0.02em | Dashboard, Modal headers |
| **Card Heading** | Space Grotesk | 18px – 20px | 1.3 | -0.01em | Video tile labels, tool headers |
| **Body Large** | Inter | 15px – 16px | 1.5 | 0 | Descriptions, lobby details |
| **Body Small** | Inter | 13px – 14px | 1.4 | +0.01em | Button labels, secondary notes |
| **Micro Labels** | Inter | 10px – 11px | 1.2 | +0.06em | Status chips, timestamps, badges |

---

## 4. StudyRooms Geometric Logo Specification

### Vector Concept: Interlocking Connection Loops
The logo represents two interlocking, geometric mobius-style nodes forming an abstract "S":
1. Left curve curves upward in Electric Indigo (`#6366F1`).
2. Central bridge transitions smoothly into Cyan (`#06B6D4`).
3. Right curve loops downward in Purple (`#A855F7`).

### Standalone SVG Symbol Structure
```xml
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sr-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366F1" />
      <stop offset="50%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#A855F7" />
    </linearGradient>
  </defs>
  <!-- Node A: Top-left loop -->
  <path d="M12 6C7.58 6 4 9.58 4 14C4 18.42 7.58 22 12 22H18C20.21 22 22 20.21 22 18C22 15.79 20.21 14 18 14H12C9.79 14 8 12.21 8 10C8 7.79 9.79 6 12 6H20" 
        stroke="url(#sr-logo-grad)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Node B: Bottom-right loop -->
  <path d="M24 30C28.42 30 32 26.42 32 22C32 17.58 28.42 14 24 14H18C15.79 14 14 15.79 14 18C14 20.21 15.79 22 18 22H24C26.21 22 28 23.79 28 26C28 28.21 26.21 30 24 30H16" 
        stroke="url(#sr-logo-grad)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

---

## 5. UI Style & Interaction Guidelines

1. **Restrained Glows**:
   - Use soft, low-opacity glow highlights (`rgba(99, 102, 241, 0.12)`) on active cards.
   - Active speaker tiles receive a 1.5px Cyan/Indigo border gradient with a 6px outer spread.
2. **Micro-Interactions**:
   - Buttons scale to `0.96` on `:active` with `0.1s ease`.
   - Tooltips fade in over `0.15s` with `translateY(-3px)`.
3. **Glassmorphism Formula**:
   - `background: rgba(30, 41, 59, 0.75)`
   - `backdrop-filter: blur(20px)`
   - `border: 1px solid rgba(255, 255, 255, 0.08)`
4. **No AI Slop Rule**:
   - No generic multi-colored cartoon gradients.
   - No floating random shapes or decorative blobs.
   - Purposeful whitespace, clear hierarchy, high readability.
