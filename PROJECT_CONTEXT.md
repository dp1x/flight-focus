# Flight Focus — Project Context & Handoff

> **Handoff document.** Paste this into a coding agent to continue work on the
> app. Everything here has been checked against the code. Where something is
> unverified, it says so.

## What the app is

**Flight Focus** — a local-first, private, lightweight desktop focus timer with a
flight metaphor. Pick a departure and a destination airport, start a focus
session, and a plane flies the great-circle arc between them on a 3D globe while
the timer counts down through takeoff → cruise → touchdown.

Calm, premium, restrained motion. Optional locally generated ambient audio. No
network, no accounts, no telemetry.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 19 + TypeScript 5.8 + Vite 7 |
| 3D | three.js + @react-three/fiber + @react-three/drei |
| Core logic / persistence | Rust + SQLite (`rusqlite`) |
| IPC | Tauri `invoke` |
| Audio | Web Audio API, generated in-process |

## Build model — the most important thing to know

**Rust is compiled in GitHub Actions, never on the development machine.**

The development machine is a Windows ARM64 laptop with only x64 MSVC tools
installed. Building locally therefore meant emulating x64 through MSVC wrapper
scripts, writing 5–15 GB into `src-tauri/target/`, and wearing a system SSD that
has little free space. None of that is necessary: a **public** repository gets
GitHub's native `windows-11-arm` runner for free.

Consequences:

- Local commands are `npm run dev` and `npm run verify`. Nothing else.
- `npm run tauri dev` needs a local ARM64 MSVC toolchain and is unsupported.
- The `.kilo/vc-*.cmd` wrapper scripts and `src-tauri/.cargo/config.toml`'s
  `target = "x86_64-pc-windows-msvc"` pin have been deleted. The pin would have
  broken the ARM64 CI build.
- Scratch output goes to the RAM disk via `scripts\dev-env.cmd`.

> The `windows-11-arm` runner only exists for public repositories. Making the
> repository private breaks the release workflow.

## Verified status

Last verified by running the commands locally, except where noted.

| Gate | Status |
|---|---|
| `npm run check:integrity` | Passes |
| `npm run typecheck` | Passes, 0 errors |
| `npm run lint` | Passes, 0 errors, 0 warnings |
| `npm run test` | 35/35 pass |
| `npm run build` | Passes — 326 kB JS gzipped |
| `cargo test` | Runs in CI only; not verified locally by design |

See `CHECKPOINT.md` for what was broken and how it was repaired.

## File map

```
src/
  App.tsx                  Layout and composition only
  App.css                  Design tokens + component styles
  layout.css               Mission-control layout layer (loaded after App.css)
  main.tsx                 React entry
  state/
    useFocusSession.ts     Session state machine, wall-clock timer, audio
    useJourney.ts          Departure/destination ownership + persistence
    useAchievements.ts     Achievement loading + unlock toasts
  focus/
    api.ts                 Tauri IPC wrappers + all shared TS types
    audio.ts               Web Audio ambient generators
    time.ts                Duration formatting + clamping
    theme.ts               Dark / light / system theme
  map/
    AirportSearch.tsx      Searchable airport dropdown (+ Airport interface)
    AirportSearch.css      Dropdown styles (single source of truth)
    FlightGlobe.tsx        R3F scene: sphere, coastlines, instanced pins, arc
    FlightGlobeView.tsx    Selection flow, preview panel, search overlay
    geo.ts                 Projection, arcs, coastlines, distances, phase math
    geo.test.ts            Geometry and phase tests
  components/
    AchievementsPanel.tsx
    DataControls.tsx       JSON export / import
    icons.tsx              Shared inline SVG interface icons
  data/
    airports.json          59 airports, 37 countries
    coastlines.ts          15 landmass rings ([lng, lat] pairs) for the globe
    countries.json         Country reference data (currently unreferenced)

src-tauri/
  src/lib.rs               Session engine, SQLite persistence, IPC commands
  src/main.rs              Binary entry
  tauri.conf.json          Window config: "Flight Focus", 800x600

scripts/                   Dev environment, integrity guard, hook installer,
                           RAM disk tooling
docs/
  AIRPORT_DATA_RESEARCH_PROMPT.md
```

## Data shapes

### Airport (`src/map/AirportSearch.tsx`)

```ts
interface Airport {
  code: string;        // "ATL"   IATA
  icao: string;        // "KATL"
  name: string;        // "Hartsfield-Jackson Atlanta International Airport"
  city: string;        // "Atlanta"
  country: string;     // "United States"
  countryCode: string; // "US"
  flag: string;        // "🇺🇸"  emoji — rendered directly, never fetched
  lat: number;         // 33.6407
  lng: number;         // -84.4277
  keywords: string[];  // lowercase search aliases
}
```

`AirportSearch` filters on every field except `lat`/`lng`.

### Phase

```ts
type Phase = "idle" | "takeoff" | "cruise" | "touchdown" | "rest";
```

- `idle` — no session
- `takeoff` — first ~18% of the session (climb)
- `cruise` — the middle ~64%
- `touchdown` — the last ~18% (descent)
- `rest` — complete, on the ground

`phaseProgress()` in `src/map/geo.ts` maps a raw 0–1 progress onto these bands;
`phaseProgress` is unit-tested, including a check that progress never moves
backwards across the sequence.

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

## State ownership

- **Session, timer, audio** → `useFocusSession`. It owns the wall-clock
  reconciliation loop and the audio lifecycle. It reports completion upward
  through an `onEnded` callback rather than reaching into stats itself.
- **Departure / destination** → `useJourney`. It persists via `setJourney()` once
  both ends are known, and owns `swap`, `clearDeparture`, `clearDestination` and
  `reload` (used after a data import).
- **Achievements** → `useAchievements`. Diffs against the previous snapshot to
  decide what to toast, and auto-dismisses the toast after 5 seconds.
- **The globe owns exactly two things**: the hovered airport and the spin
  request. It reports every selection upward through callbacks and never holds
  the route itself, so the timer and the globe cannot disagree.

## Interaction spec (globe view)

- **Click a pin** → fills the next empty slot: departure, then destination. With
  both filled, it restarts the flow from the newly clicked departure.
- **Double-click a pin** → forces departure and clears destination.
- **Search** → behaves exactly like clicking that pin, and spins the globe to it.
  The overlay has separate departure and destination fields.
- **Backspace / Delete** → clears destination first, then departure. Ignored
  while typing in a search box.
- **Preview panel** → shows the hovered airport, falling back to destination then
  departure, with flag, IATA code, name, location, coordinates, its role, and the
  great-circle distance from the departure.
- **Auto-rotate** pauses while the user drags and resumes afterwards. With
  reduced motion enabled, auto-rotate and selection spin-up are disabled but pin
  hover and click keep working.

## Design system

Tokens live in `:root` in `src/App.css`:

- Background `--bg: #050505`, with a CSS-only starfield on `.appShell:before`
- Primary `--primary: #57f1db`, container `--primary-container: #2dd4bf`
- Text `--text: #e5e2e1`, secondary `--text-secondary: #bacac5`, muted `--text-muted: #859490`
- Glass: `--glass-bg`, `--glass-border`, `--glass-blur`
- Radii `--r-sm` … `--r-xl`, `--r-full`; spacing `--u: 8px`; `--safe: 40px`

Light mode re-points the same token set under `:root[data-theme=light]`. The
globe's shader colours are not theme-aware, so the 3D scene keeps its dark
palette in light mode.

`stitch_design/` holds the original Stitch mockup and its design tokens, kept for
reference. Its markup used a `Zeitreise` brand and a cockpit side rail that were
never implemented; that direction was retired in favour of the restored design.

## Constraints

- **Offline only.** No network calls at runtime. No CDN assets. Flags are emoji.
- **No accounts, no telemetry.**
- **Reduced motion is first-class.**
- **Bundle size:** three.js is ~150 kB gzipped. Don't add heavy extras.
- TypeScript strict, plus `noUnusedLocals` and `noUnusedParameters`.

## Commands

```bash
npm install
npm run dev        # Vite dev server, localhost:1420
npm run verify     # integrity + typecheck + lint + tests + build
scripts\dev-env.cmd  # the same, with TEMP/TMP on the RAM disk
```

Releasing: push a `v*` tag. The Release workflow builds ARM64 and attaches a
portable zip plus an NSIS installer.

## Known gaps

- No theme-awareness in the globe shader.
- 59 airports; `docs/AIRPORT_DATA_RESEARCH_PROMPT.md` contains a research prompt
  to expand the dataset.
- `src/data/countries.json` is unreferenced reference data, reserved for that
  expansion.
- `cargo clippy` is advisory (non-blocking) in CI.
- `complete_focus_session` is exposed over IPC from Rust but never called from
  the UI — the tick loop completes sessions on its own.
