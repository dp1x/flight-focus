# Flight Focus

A local-first, private desktop focus timer with a flight metaphor. Pick a
departure and a destination airport, start a focus session, and a plane flies the
great-circle arc between them on a 3D globe while the timer counts down.

No account. No telemetry. No network requests at runtime.

## How it is built

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 19 + TypeScript 5.8 + Vite 7 |
| 3D globe | three.js + @react-three/fiber |
| Core logic & persistence | Rust + SQLite (`rusqlite`) |
| Audio | Web Audio API, generated locally |

## Requirements

- **Node.js 20+** (developed against Node 24)
- **No Rust toolchain needed locally** — see below

### Where compiling happens

**Rust is compiled in GitHub Actions, not on your machine.** The build workflow
runs on a native `windows-11-arm` runner, which is free for public repositories.

This is deliberate. Building locally on a Windows ARM64 machine with an
x64-only MSVC install means emulating x64, spending 5–15 GB of disk on a Cargo
`target/` directory, and wearing the SSD with every incremental rebuild. The
release workflow produces a portable executable and an installer instead.

The trade-off: a local `npm run tauri dev` will not work unless you install an
ARM64 MSVC toolchain yourself. Do UI work against the Vite dev server instead.

## Development

```bash
npm install
npm run dev
```

`scripts\dev-env.cmd` additionally routes `TEMP`/`TMP` to the RAM disk so Vite's
scratch files never touch the system SSD.

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR on `localhost:1420` |
| `npm run verify` | Everything CI runs: integrity, typecheck, lint, tests, build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |
| `npm run build` | Typecheck + production bundle into `dist/` |
| `npm run check:integrity` | Guards against corrupted source files |
| `npm run tauri` | Tauri CLI (requires a local Rust toolchain) |

Run `npm run verify` before pushing. A pre-commit hook runs the integrity check
and typecheck automatically.

## Releasing

Tag a commit and push the tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow builds natively for Windows ARM64 and attaches:

- `flight-focus-<version>-arm64-portable.zip` — no installer, just run it
- an NSIS installer executable

You can also run the workflow manually from the Actions tab.

> **Note:** the `windows-11-arm` runner only exists for **public** repositories.
> Making this repository private will break the release workflow.

## Architecture

```
src/
  App.tsx                 Layout and composition only
  App.css                 Single stylesheet (design tokens + all components)
  state/
    useFocusSession.ts    Session state machine, wall-clock timer, audio
    useJourney.ts         Departure/destination ownership + persistence
    useAchievements.ts    Achievement loading and unlock toasts
  focus/
    api.ts                Tauri IPC wrappers + shared types
    audio.ts              Web Audio ambient generators
    time.ts               Duration formatting and clamping
    theme.ts              Dark/light/system theme
  map/
    AirportSearch.tsx     Searchable airport dropdown
    AirportSearch.css
    FlightGlobe.tsx       R3F scene: sphere, pins, arc, plane
    FlightGlobeView.tsx   Selection flow, preview panel, search overlay
    geo.ts                lat/lng projection, arcs, distances, phase math
  components/
    AchievementsPanel.tsx
    DataControls.tsx      JSON export / import
  data/
    airports.json         59 airports
    countries.json        Country reference data

src-tauri/
  src/lib.rs              Session engine, SQLite persistence, IPC commands
```

## Notes on correctness

- **The timer measures real time, not ticks.** A 250 ms poll reads a monotonic
  clock and advances the session by however many whole seconds have actually
  elapsed, so a backgrounded window cannot make the countdown drift.
- **Globe pins are back-face culled.** Airports on the far side of the planet
  cannot be hovered or clicked through the sphere.
- **Flags are emoji, not images.** Nothing is fetched from a CDN, so the app
  works with no network at all.

## Data

The airport dataset is intentionally small (59 airports, 37 countries). See
`docs/AIRPORT_DATA_RESEARCH_PROMPT.md` for a ready-to-use research prompt that
expands it to a few thousand entries with full provenance tracking.

## License

MIT — see `LICENSE`.
