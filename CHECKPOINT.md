# Flight Focus — Build Snapshot

## Current state

Recovered from a broken working tree. The project previously did not compile at
all; it now builds, lints, and passes its tests.

### Verified locally

| Gate | Status |
|---|---|
| `npm run check:integrity` | Passes |
| `npm run typecheck` (`tsc --noEmit`) | Passes, 0 errors |
| `npm run lint` | Passes, 0 errors, 0 warnings |
| `npm run test` (vitest) | 35/35 pass |
| `npm run build` (tsc + vite) | Passes — 18.2 kB CSS, 326 kB JS gzipped |
| `cargo test` | Not run locally by design — runs in CI on `windows-11-arm` |

### What was broken, and how it was repaired

**1. The app did not compile.** `src/map/FlightGlobeView.tsx` and
`src/map/FlightMap.tsx` were 12-byte files containing the literal text of a
shell redirection artefact. `App.tsx` imports `FlightGlobeView` as a default
export, so `tsc` failed with `TS2306: File is not a module` plus a nonsense
`Cannot find name 'NoNewline'`, and `npm run build` — and therefore
`tauri dev` and `tauri build`, which both call it — failed outright.

*Repair:* the missing view was rebuilt from its documented contract in
`PROJECT_CONTEXT.md` §7, cross-checked against the CSS class contract that
survived in the compiled stylesheet.

**2. The entire UI was unstyled.** `src/App.css` had been reduced to a 54-line
token stub. None of the classes `App.tsx` referenced — `.appShell`, `.topBar`,
`.timerHero`, `.sideRail`, `.statsBar`, `.achievementsPanel`, `.mapStage`,
`.extrasPanel` — existed in any stylesheet.

*Repair:* the real stylesheet was recovered from the June 23 production build
that was still sitting in `dist/assets/index-BTBD2aYK.css`, un-minified back to
868 readable lines.

**3. Three design directions were layered on top of each other.** A June build
(`.brand` / `.brandMark` / `.pill`), a `Zeitreise` cockpit markup derived from
the Stitch mockup in `stitch_design/code.html`, and a rewritten globe stylesheet.

*Repair:* converged on the recovered June design with **Flight Focus** branding.
The orphaned `Zeitreise` side rail was removed, the mockup's markup was replaced
with the recovered contract, and the globe stylesheet was folded into the single
`App.css`.

**4. The documentation claimed a status that was no longer true.**
`PROJECT_CONTEXT.md` asserted "VERIFIED STATUS ✅ `npm run build` clean, App
runs", which had not been re-checked since June.

*Repair:* both docs rewritten and reconciled. Airport count corrected from 60 to
the actual 59.

**5. A hard privacy constraint was violated.** `AirportSearch.tsx` fetched flag
images from `https://flagcdn.com`, in an app whose stated constraint is that it
makes no network requests ever.

*Repair:* flags now render the emoji already present in every dataset record.

### Correctness fixes applied

- **Timer drift.** The countdown was driven by `setInterval(1000)` sending a
  fixed `tick(1)`. Throttled background windows dropped ticks, and nothing
  reconciled against real time. Replaced with a 250 ms poll that measures a
  monotonic clock and advances by the whole seconds actually elapsed, carrying
  the sub-second remainder forward.
- **Click-through pins.** Globe pins had no back-face culling despite the spec
  requiring it, so airports on the far side of the planet remained hoverable and
  clickable. Added a per-frame normal-versus-camera test; three.js skips
  invisible objects, so this blocks interaction as well as rendering.
- **Restored session semantics.** A session restored after restart now comes back
  explicitly paused rather than leaving `running` in an ambiguous state.
- **Failed init no longer dead-ends.** A failed `initialize_focus` used to leave
  the user on an endless loading screen; it now surfaces the error and continues.

### Globe rendering rebuilt (continents + performance)

The globe was a wireframe graticule with no landmasses — the original 2D map
sprite data (`src/data/worldMap.ts`, deleted as unreferenced) was recovered from
git history and projected onto the sphere instead:

- `src/data/coastlines.ts` holds the 15 landmass rings as `[lng, lat]` arrays;
  the concatenated Indonesia entry was split into separate rings.
- `geo.buildCoastlinePositions()` subdivides long edges (6° max step, antimeridian-
  safe) and flattens everything into one Float32Array rendered as a single
  batched LineSegments draw call.
- The 59 per-pin components (each with its own `useFrame` culling callback)
  became one `InstancedMesh` with a single per-frame culling/easing pass.
- The flight arc's traveled portion is revealed with `setDrawRange` instead of
  rebuilding geometry on every session tick.

### Design system rewritten to a token set

The recovered stylesheet was itself slop (accent-colored glow shadows, a ten-
gradient starfield, five radii values, magic spacing, duplicated search styles).
`App.css`, `layout.css` and `AirportSearch.css` were rewritten on one token set:
one teal accent for live mission state, a neutral scale, 4px spacing grid,
three radii, two shadows, no gradients or glows, SVG icons instead of glyph
characters, `:focus-visible` rings. The rules live in `AGENTS.md` §UI design
rules.

### Dead code removed

`FlightMap.tsx` / `FlightMap.css` (superseded 2D map), `CountrySelector.tsx`
(unreferenced, and it fetched a path that did not exist), `data/worldMap.ts`
(unreferenced since the globe replaced the 2D map), `react.svg` / `vite.svg` /
`tauri.svg` scaffold assets, `SessionCommand` and `getThemeClass` unused exports,
and the `.kilo/vc-*.cmd` MSVC wrapper scripts made obsolete by building in CI.

## Build model

Rust is compiled in GitHub Actions on a native `windows-11-arm` runner — free for
public repositories. Local development is frontend only. See `AGENTS.md`.

## Manual smoke test

1. Pick a departure and a destination — reload — the airports persist.
2. Start a short session, confirm the ring advances and the phase pill changes.
3. Open the map view, confirm the globe renders and the plane follows the arc.
4. Hover a pin, confirm the preview panel fills in and that pins on the far side
   of the globe cannot be hovered.
5. Press Backspace on the map view — destination clears, then departure.
6. Start a session, background the window for a minute, return — the countdown
   should match wall-clock time, not the number of ticks.
7. Complete a session — stats update and any new achievement toasts.
8. Export JSON, then re-import it — counts merge without duplicates.
9. Toggle the theme in the top bar — the interface switches to light and the
   choice survives a reload.

## Known gaps

- No theme-aware variants for the 3D globe's shader colours; the scene keeps its
  dark palette in light mode.
- The airport dataset is 59 airports. `docs/AIRPORT_DATA_RESEARCH_PROMPT.md`
  contains a research prompt to expand it.
- `src/data/countries.json` is currently unreferenced reference data, reserved
  for the dataset expansion.
- `cargo clippy` runs as an advisory (non-blocking) check in CI; the existing
  Rust has not been held to clippy's bar.
