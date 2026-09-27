# Flight Focus — Project Context & GUI Handoff

> **Handoff document.** Paste this into ChatGPT/Gemini/Claude to continue the GUI
> build, interrogate you for design decisions, or iterate on the visual design.
> Generated 2026-06-22. All code compiles. App runs. Globe renders but needs visual
> polish.

## QUICK START — How to run this project

```cmd
:: 1. One-time: add MSVC linker to PATH (Windows-on-ARM only)
.kilo\vc-env.cmd
:: Then CLOSE and reopen your terminal.

:: 2. Install deps (already done, but if starting fresh)
npm install

:: 3. Run the frontend dev server (hot reload, fastest feedback)
npm run dev

:: 4. Run with Tauri desktop shell (Rust + WebView2 window)
npm run tauri dev
:: Or if MSVC isn't on PATH yet:
.kilo\vc-tauri.cmd dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server, HMR, opens `localhost:1420` in browser |
| `npm run build` | `tsc` type-check + Vite production build |
| `npm run tauri dev` | Full Tauri app (Rust backend + WebView2) |
| `cargo test` (from `src-tauri/`) | 10 Rust unit tests (session engine + serde) |
| `npm run tauri build` | Release build → MSI + NSIS installers |

> **This is a Windows-on-ARM machine.** Rust builds use `x86_64-pc-windows-msvc`
> override (not native aarch64) because only x64 MSVC tools are installed.
> See `CHECKPOINT.md` "Windows-on-ARM toolchain notes" for details.

## VERIFIED STATUS (2026-06-22)

| Gate | Status |
|---|---|
| `cargo check` | ✅ 0 errors |
| `cargo test` | ✅ 10/10 pass |
| `npm run build` (tsc + vite) | ✅ Clean, 318 KB gzipped |
| `tauri build` (release) | ✅ exe + MSI + NSIS installer produced |
| App launch | ✅ Window "Flight Focus", ~56 MB RAM |

## CURRENT STATE — What's done vs what needs work

### Done (functionally complete)
- **Rust core**: Session state machine (idle→takeoff→cruise→touchdown→rest), SQLite persistence, IPC commands
- **59 airports** with lat/lng data
- **Airport selection**: departure → arrival flow, search, backspace to clear
- **Flight arc animation**: great-circle path, plane travels during sessions
- **Timer**: start/pause/resume/skip/reset/complete, phase-gated progress
- **Achievements**: 7 unlocks with unlock toasts
- **Data portability**: JSON export/import
- **Theming**: dark palette (`#0b0c10` / `#66fcf1` / `#45a29e`)
- **3D Globe**: react-three-fiber WebGL sphere, atmosphere rim, airport pins, flight arc, auto-rotate, orbit controls

### Needs work (the "GUI is shit" part — your words)
The 3D globe renders but the **visual design is rough**. This is where you hand
off to ChatGPT + Google Stitch. Specifically:

1. **Visual polish of the globe**: The sphere is a plain dark ball with a wireframe
   overlay. It needs a better material (subtle Earth feel, or stylized dot-grid,
   or graticule with continent outlines). The atmosphere rim glow is working but
   may need tuning.
2. **Airport pins**: Currently plain small spheres. They need to feel more
   refined — maybe elongated cones, glowing dots, or size variation by hub status.
3. **The side preview panel**: Layout and typography are functional but not premium.
4. **The timer view**: Not a 3D concern but the overall app layout, spacing,
   typography, and motion could all be leveled up.
5. **The search overlay**: Functional but visually basic.
6. **Transitions**: The globe selection flow works but doesn't have smooth camera
   animations or visual feedback "juice" (ripple on select, pulse on departure
   confirmation, etc.).
7. **Overall layout**: The timer/map toggle, stats, achievements panels — all
   functional, all need visual design attention.

## 1. What the app is

**Flight Focus** — a local-first, private, lightweight desktop focus timer with
a flight metaphor. You pick a departure and destination airport, start a focus
session, and a plane "flies" between them while a Pomodoro-style timer counts
down. Calm, premium, Apple-like motion. Optional ambient audio. No network, no
accounts, no telemetry.

Built with **Tauri 2** (desktop shell) + **React 19 / TypeScript** (UI) +
**Rust** (core timer logic, SQLite persistence). Local-first only.

## 2. Tech stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 19 + TypeScript 5.8 + Vite 7 |
| 3D (new) | three.js + @react-three/fiber + @react-three/drei |
| Core logic / persistence | Rust + SQLite (rusqlite) |
| IPC | Tauri `invoke` |

No backend. Everything runs locally. No network calls ever.

## 3. Current file map (frontend)

```
src/
  App.tsx                  # Root. Owns session + journey state. THE INTEGRATION POINT.
  App.css                  # All styles (single stylesheet)
  main.tsx                 # React entry
  focus/
    api.ts                 # Tauri IPC wrappers + all shared TS types
    audio.ts               # Web Audio ambient modes
    theme.ts               # Light/dark theme hook
  map/
    FlightMap.tsx          # OLD 2D SVG map — being replaced by the globe
    FlightMap.css
    AirportSearch.tsx      # Searchable dropdown — KEEP, reuse on globe view
  components/
    AchievementsPanel.tsx
    DataControls.tsx       # Export/import JSON
  data/
    airports.json          # 59 airports
    countries.json
    worldMap.ts            # Equirectangular projection helpers + continent outlines
```

## 4. Data shapes (canonical — from `src/focus/api.ts`)

### Airport (`src/map/AirportSearch.tsx` export)
```ts
interface Airport {
  code: string;        // "ATL"  (IATA)
  icao: string;        // "KATL"
  name: string;        // "Hartsfield-Jackson Atlanta International Airport"
  city: string;        // "Atlanta"
  country: string;     // "United States"
  countryCode: string; // "US"
  flag: string;        // "🇺🇸" (emoji)
  lat: number;         // 33.6407
  lng: number;         // -84.4277
  keywords: string[];  // ["atlanta","georgia","delta",...]
}
```
59 airports in `src/data/airports.json`. Import as `import airports from "./data/airports.json"`.

### Phase (session lifecycle — core to the globe's animation)
```ts
type Phase = "idle" | "takeoff" | "cruise" | "touchdown" | "rest";
```
- `idle` — no session
- `takeoff` — first ~18% of session (climb)
- `cruise` — middle ~64% (level flight)
- `touchdown` — last ~18% (descent)
- `rest` — session complete, on the ground

### FocusSession
```ts
interface FocusSession {
  id: string;
  phase: Phase;
  startedAt: string;
  totalDurationSeconds: number;
  remainingSeconds: number;
  completed: boolean;
  audio: AudioMode;
  lastHeartbeat: string;
}
```

## 5. State ownership — READ THIS BEFORE WIRING

All selection state lives in **`App.tsx`** and flows down via props:

```tsx
const [departure, setDeparture] = useState<Airport | null>(null);
const [destination, setDestination] = useState<Airport | null>(null);
const [session, setSession] = useState<FocusSession | undefined>(undefined);
const [mapView, setMapView] = useState(false);
```

**The globe component receives these as props and reports selections UP via
callbacks. It does NOT own the airport state.** On selection change, `App.tsx`
auto-persists via `setJourney(departure.code, destination.code)`.

Derived values the globe needs:
- `flightProgress = (totalDurationSeconds - remainingSeconds) / totalDurationSeconds` (0–1), `undefined` when no active session.
- `phase` from `session?.phase`.

## 6. THE BUILD: Rotating 3D globe (Palantir-style)

### Goal
Replace the flat SVG `FlightMap` with a real WebGL globe. Airports are pins on
a sphere. You select departure then arrival by clicking pins (or via search).
A side panel previews the hovered/selected airport. The plane flies the great-
circle arc during a session.

### Rendering approach
**react-three-fiber** (Three.js React renderer). Add deps:
```
three @react-three/fiber @react-three/drei @types/three
```

### Globe geometry
- Sphere, radius ~1.0, low segment count (~48×48) for perf.
- Dark base material (`#0b0c10`) with subtle fresnel/atmosphere rim glow in
  cyan (`#66fcf1`) using a custom shader or drei `<Sphere>` + emissive edges.
- Optional: a faint dotted "graticule" (lat/lng grid) or continent dots. The
  existing `src/data/worldMap.ts` has continent lat/lng outlines you can
  project onto the sphere surface as a thin line set if you want landmasses.
  Keep it subtle — this is a stylized globe, not Google Earth.

### lat/lng → 3D sphere position
```ts
function latLngToVector3(lat: number, lng: number, radius = 1.0): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);   // polar angle from +Y
  const theta = (lng + 180) * (Math.PI / 180); // azimuth
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z =  (radius * Math.sin(phi) * Math.sin(theta));
  const y =  (radius * Math.cos(phi));
  return [x, y, z];
}
```
Pins sit at `radius + smallOffset` so they hover above the surface.

### Airport pins
- One small mesh per airport (cone or sphere, ~0.015 radius).
- Color by role: unselected = dim white/grey, departure = cyan `#66fcf1`,
  destination = teal `#45a29e`.
- Hover = scale up + tooltip.
- Click = select (see flow below).
- Backface cull: hide pins on the far side of the globe (dot product of pin
  normal vs camera-to-center < 0) so you can't click through the planet.

### Flight arc
- Great-circle curve from departure → destination using `THREE.Quaternion`
  rotation or a sampled slerp between the two surface points. Use
  `@react-three/drei`'s `<QuadraticBezierLine>` / `<CatmullRomLine>` or a
  custom `THREE.CatmullRomCurve3` lifted to an arc apex (~1.15× radius).
- Visible only when both departure AND destination are set.
- The plane mesh travels along this curve at `flightProgress` (phase-gated:
  takeoff clamps to 0–0.18, cruise 0.18–0.82, touchdown 0.82–1.0 — reuse the
  existing `phaseProgress` logic from `FlightMap.tsx` lines 30–41).

### Camera & rotation
- OrbitControls (drei) so the user can drag to rotate.
- **Gentle auto-rotate** when idle (no hover/drag/active session) — ~0.05
  rad/sec. Pause auto-rotate while user interacts or a tooltip is open.
- On airport selection, **smoothly rotate the globe to bring that airport to
  center-front** (animate camera or globe rotation over ~600ms with easing).
- Respect `prefers-reduced-motion`: disable auto-rotate and selection spin-up;
  just snap. Keep pin hover/click fully functional.

## 7. Interaction spec (the part you specified)

### Selecting airports
- **Click a pin** → assigns it to the next empty slot:
  1. If `departure` is null → this click sets `departure`.
  2. Else if `destination` is null → this click sets `destination`.
  3. Else (both set) → replace `departure` with the new airport and clear
     `destination` (restart the flow). Or open a tiny "replace departure /
     destination / cancel" affordance — pick whichever is simpler; behavior
     must be discoverable.
- **Double-click a pin** → force-assign as departure (clears destination).
  (You mentioned double-click → departure; honoring it.)
- **Search box** (keep `AirportSearch`, place it as an overlay in the corner of
  the globe view): selecting a result behaves identically to clicking that pin
  AND spins the globe to it.

### Keyboard
- **Backspace / Delete**:
  1. If `destination` set → clear `destination`.
  2. Else if `departure` set → clear `departure`.
  3. Else → no-op.
- **Escape** → clear focus / close tooltips.

### Side preview panel
- When you **hover** a pin (or focus a search result), show a side panel
  (right edge of the globe view) with: flag, IATA code, full name, city +
  country, and the lat/lng. This is a *preview*, not a commit — the airport is
  only committed to departure/destination on click.
- When an airport is the active `departure` or `destination`, it stays
  highlighted on the globe and in the panel even without hover.

## 8. Visual style (from AGENTS.md + existing CSS)

- Dark, premium, calm. Background near-black `#0b0c10` → `#1f2833` gradient.
- Accent cyan `#66fcf1` (departure/primary), teal `#45a29e` (destination).
- Text muted `#9fb3c8`, bright `#c5c6c7`.
- Soft depth, subtle blur, restrained gradients. No hard neon. No clutter.
- Motion fluid but purposeful; every transition has a function.
- **Must remain usable with motion disabled** (reduced-motion media query).

## 9. Hard constraints

- **Offline only.** No texture fetches from CDNs. If you want an Earth texture,
  bundle it locally in `public/` or generate procedurally. Procedural /
  graticule-only is preferred to keep the bundle small and stay network-free.
- **No new network calls, no analytics, no accounts.**
- **Bundle size matters** — three.js is ~150KB gzipped. Acceptable here, but
  don't pull in heavy extras (no `@react-three/postprocessing` unless needed).
- **Reduced motion is first-class.**
- TypeScript strict. Handle errors explicitly. Keep modules narrow.

## 10. File map — what to touch vs what to leave alone

### ✅ SAFE TO MODIFY (frontend UI only)
```
src/App.tsx                    # Root layout, state, routing between views
src/App.css                    # All styles — primary target for visual work
src/map/FlightGlobe.tsx        # 3D globe: sphere, pins, arc, plane, camera
src/map/FlightGlobe.css        # Globe container + preview panel + search styles
src/map/FlightGlobeView.tsx     # Globe wrapper: selection flow, side panel, search overlay
src/map/geo.ts                 # lat/lng→sphere projection, arc building, phase math
src/map/AirportSearch.tsx      # Searchable airport dropdown (reused on globe)
src/components/*.tsx           # Achievements panel, data controls, etc.
src/focus/theme.ts             # Light/dark theme hook
src/focus/audio.ts             # Web Audio ambient modes
```

### 🚫 DO NOT TOUCH (verified working, backend logic)
```
src-tauri/src/lib.rs           # Rust session engine + all Tauri commands
src-tauri/src/main.rs          # Rust entry point
src-tauri/Cargo.toml           # Rust dependencies
src/focus/api.ts               # Tauri IPC wrappers + shared TS types
src/data/airports.json         # 59 airports — data, not UI
src/data/countries.json        # Country data
src/data/worldMap.ts           # Equirectangular projection helpers
```

### 🔧 INFRASTRUCTURE (only if needed)
```
vite.config.ts                 # Vite config (code-splitting three.js if bundle gets big)
tsconfig.json                  # TypeScript config
package.json                   # Dependencies (already has three + r3f + drei)
.tauri/tauri.conf.json        # Tauri window size, title, etc.
```

## 11. Integration contract (how the globe plugs into App.tsx)

`App.tsx` currently renders `<FlightGlobeView>` inside the `mapView` branch:

```tsx
<FlightGlobeView
  departure={departure}              // Airport | null
  destination={destination}          // Airport | null
  flightProgress={flightProgress}     // number | undefined (0–1)
  phase={session?.phase}              // Phase | undefined
  airports={AIRPORTS}                // Airport[]
  onSelectDeparture={setDeparture}
  onSelectDestination={setDestination}
  onClearDeparture={() => setDeparture(null)}
  onClearDestination={() => setDestination(null)}
/>
```

State ownership: `App.tsx` owns `departure` / `destination` and persists changes
to Rust via `setJourney()`. The globe reports selections UP through these
callbacks. It does NOT own airport state internally.

## 12. Build & verify commands

```cmd
:: One-time: add MSVC tools to PATH permanently (Windows-on-ARM)
.kilo\vc-env.cmd
:: Then CLOSE and reopen your terminal.

:: Type-check + Vite build (fast — run this every change)
npm run build

:: Dev server with HMR (fastest feedback loop)
npm run dev

:: Rust check + tests (unaffected by frontend changes)
cd src-tauri && cargo check && cargo test

:: Run with Tauri desktop shell
npm run tauri dev
:: Or if MSVC isn't on PATH yet:
.kilo\vc-tauri.cmd dev
```

## 13. What NOT to do

- **Don't touch Rust.** Session engine is verified (10/10 tests). It's correct.
- **Don't change `focus/api.ts` IPC types** unless absolutely necessary.
- **Don't add network calls, analytics, or accounts.** Offline-only app.
- **Don't fetch textures from CDNs.** Bundle locally in `public/` or generate procedurally.
- **Don't break the timer view.** The globe replaces the map view only.
- **Don't bloat the bundle** — three.js is ~150KB gzipped already, keep extras minimal.
- **Reduced motion is first-class** — everything must work with `prefers-reduced-motion`.

