---
name: Aeronautical Focus System
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#bacac5'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#859490'
  outline-variant: '#3c4a46'
  surface-tint: '#3cddc7'
  primary: '#57f1db'
  on-primary: '#003731'
  primary-container: '#2dd4bf'
  on-primary-container: '#00574d'
  inverse-primary: '#006b5f'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#dad8ee'
  on-tertiary: '#2f2f40'
  tertiary-container: '#bebcd2'
  on-tertiary-container: '#4c4b5d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#62fae3'
  primary-fixed-dim: '#3cddc7'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005047'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e3e0f7'
  tertiary-fixed-dim: '#c6c4da'
  on-tertiary-fixed: '#1a1a2a'
  on-tertiary-fixed-variant: '#464557'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  timer-display:
    fontFamily: Inter
    fontSize: 120px
    fontWeight: '300'
    lineHeight: 120px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-caps:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
  mono-data:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1200px
  gutter: 24px
  margin-safe: 40px
  panel-padding: 32px
---

## Brand & Style
The design system embodies "Flight Focus," a premium productivity environment that leverages a mission-control metaphor to facilitate deep work. The brand personality is elite and cinematic, prioritizing calm over urgency. It targets high-performance professionals who require a distraction-free, "offline-first" cockpit for their tasks.

The visual style is a hybrid of **Minimalism** and **Glassmorphism**, leaning heavily into Apple-like precision. It avoids the aggressive "gamer" aesthetics often associated with futuristic themes, opting instead for a sophisticated, spacious, and purposeful atmosphere. The UI should feel like a high-end physical instrument—precise, weighted, and exceptionally refined.

## Colors
The palette is rooted in deep space. The primary background is a near-black (#050505), which provides the canvas for depth. 

- **Primary (Refined Teal):** Used sparingly for active states, progress indicators, and "Mission Start" actions. It represents the glow of a cockpit instrument.
- **Secondary (Solid White):** Reserved for primary text and high-contrast icons to ensure maximum legibility against the dark void.
- **Surface Tones:** Deep indigos and blacks are used in gradients to create a sense of vastness and layered depth rather than flat blocks of color.
- **Accents:** Low-opacity white (5-10%) is used for glass textures and subtle "star" highlights within the background.

## Typography
The typography system balances the warmth of a humanist sans-serif with the technical precision of a monospaced face for data.

- **Inter** is the primary driver, used for its exceptional legibility and neutral, premium feel. 
- **Geist** is introduced for labels and technical data (coordinates, timestamps, flight logs) to lean into the mission-control aesthetic.
- **Timer Display:** The main countdown uses a light weight (300) with tight letter spacing to appear like a sophisticated projection. 
- **Scale:** Large headlines should have generous tracking (letter spacing) when in uppercase, while body text remains tight and readable.

## Layout & Spacing
The layout philosophy follows a **Fluid Grid** with extremely generous safe areas. Elements are never crowded; the "spaciousness" of space is a literal design requirement.

- **Rhythm:** An 8px base unit governs all dimensions.
- **The Cockpit Layout:** Content is typically centered or arranged in floating modules that mimic a pilot's field of vision. 
- **Breakpoints:**
    - **Desktop:** 12-column grid, 24px gutters, heavy internal padding (32px+) within panels.
    - **Tablet:** 8-column grid, panels stack vertically or side-by-side depending on orientation.
    - **Mobile:** 4-column grid, 16px margins. The timer remains the hero element, filling the top 40% of the viewport.

## Elevation & Depth
Hierarchy is achieved through **Glassmorphism** and tonal layering. There are no hard, opaque borders.

- **The Void (Level 0):** The #050505 background with a very subtle, static noise texture or "star" pinpoints.
- **Floating Panels (Level 1):** Semi-transparent surfaces (Background: `rgba(255, 255, 255, 0.03)`) with a `20px` to `40px` backdrop-blur. 
- **Edges:** Instead of solid borders, use a 1px inner-stroke of `rgba(255, 255, 255, 0.1)` on the top and left sides to simulate a light source from "above."
- **Shadows:** Use large, ultra-soft ambient shadows (`0 20px 50px rgba(0,0,0,0.5)`) to lift panels off the background.

## Shapes
The shape language is "Rounded" to maintain the friendly, approachable aspect of the humanist typography while feeling like molded high-end hardware.

- **Standard Elements:** Use `0.5rem` (8px) for buttons and input fields.
- **Main Panels:** Use `rounded-xl` (1.5rem / 24px) to create a soft, protective feel for the main "cockpit" modules.
- **Progress Indicators:** Circular forms are preferred over linear ones to mimic flight gauges and instruments.

## Components

### Buttons
- **Primary:** Refined Teal (#2DD4BF) background with black text. No border. Soft glow on hover (box-shadow: `0 0 15px rgba(45, 212, 191, 0.4)`).
- **Secondary/Ghost:** Transparent background with a 1px white border at 10% opacity. Text is white.

### Command Palette
The central navigation hub. A floating glass module that appears in the center of the screen. It uses a search input with no background, only a bottom divider at 10% opacity.

### Chips & Pins
- **Status Pins:** Small, 6px solid dots. Teal for "In Flight," White for "Standby," and a low-opacity white for "Scheduled."
- **Tags:** Capsule-shaped with a faint `rgba(255, 255, 255, 0.05)` fill and `label-caps` typography.

### Input Fields
Minimalist approach. Only a bottom border (1px, 10% white) that glows teal when focused. Placeholder text should be a mid-tone grey to avoid visual clutter.

### Lists
Lists of "Flight Logs" or tasks should have no visible dividers between items. Use vertical spacing (16px) to separate items, and a subtle background highlight (`rgba(255, 255, 255, 0.02)`) only on hover.

### Progress Gauges
Utilize thin, circular strokes. The "unfilled" portion of the timer should be `rgba(255, 255, 255, 0.05)` and the "filled" portion should be the primary teal.