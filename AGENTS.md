# AGENTS.md

## Project

Flight Focus — a local-first, private, lightweight desktop focus timer with a
flight metaphor, smooth restrained motion, and optional locally generated
ambient audio.

## Hard constraints

- **Offline only.** No network requests at runtime. No analytics, no telemetry,
  no accounts, no hidden calls. If a feature needs data, bundle it.
- **No CDN assets.** Flags are emoji fields in the dataset. Images and fonts
  ship in the repository or are generated procedurally.
- **Local storage only.** Sessions, journey state, achievements and preferences
  stay on the machine. Never add a backend service for convenience.
- **Reduced motion is first-class.** Everything must remain usable with
  `prefers-reduced-motion: reduce`.

## Build model — read this first

**Do not compile Rust on the development machine.** It is a Windows ARM64 laptop
with an x64-only MSVC install, so a local `cargo build` emulates x64, consumes
5–15 GB in `src-tauri/target/`, and wears the SSD on every incremental rebuild.
The system drive has little headroom.

- Rust is compiled and tested in GitHub Actions on a native `windows-11-arm`
  runner (free for public repositories).
- Local work is frontend only: `npm run dev`, `npm run verify`.
- `npm run tauri dev` requires a local ARM64 MSVC toolchain and is not the
  supported loop.
- Scratch output belongs on the RAM disk:
  `scripts\dev-env.cmd` routes `TEMP`/`TMP` to `R:\Temp\ff`.

Never commit `dist/`, `src-tauri/target/`, or `src-tauri/gen/schemas/`.

## Verification

`npm run verify` runs everything CI runs. Never push without it.

| Check | Command |
|---|---|
| Corrupted-source guard | `npm run check:integrity` |
| Types | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm run test` |
| Production build | `npm run build` |

The integrity check exists because this repository previously lost two source
files to a botched shell redirect: the text of a redirection artefact was written
into `FlightGlobeView.tsx` and `FlightMap.tsx`, leaving them as 12-byte
non-modules and breaking the build with a confusing error. **Never write source
files with `echo` or shell redirection.** Use an editor tool.

## Architecture

| Layer | Role |
|---|---|
| Tauri 2 | Desktop shell |
| React + TypeScript | UI, composition only |
| Rust | Session engine, persistence, IPC |
| Web Audio API | Generated ambient audio |

Module boundaries:

- `src/state/` owns behaviour. Hooks own session, journey and achievements.
- `src/App.tsx` is layout and composition. It should not accumulate logic.
- `src/focus/api.ts` is the only place that talks to Rust.
- `src/map/geo.ts` holds pure geometry and phase math — testable, no React.
- `src/map/FlightGlobe.tsx` owns the R3F scene. Selection state does not live
  inside it; it reports upward through callbacks.

## Coding standards

- TypeScript strict. `noUnusedLocals` and `noUnusedParameters` are on.
- Keep effect dependency arrays honest. If a lint warning asks for a dependency,
  restructure to use a ref rather than suppressing it.
- Write clear, typed, maintainable code. Prefer one concern per module.
- Handle errors explicitly. Surface them; do not swallow them silently.
- Timing logic must be deterministic and based on measured wall-clock time, never
  on an assumption that a timer fired on schedule.

## UI design rules (no exceptions unless the user overrides)

Derived from the AI-slop UI field guide; treat as the design law for this repo.

- **Color.** Exactly one accent (`--accent`, signal teal), reserved for live
  mission state and the primary action. Everything else is the neutral scale.
  No gradients, no glow shadows, no pure `#000`/`#fff`. Text meets WCAG AA.
- **Typography.** System font stack (offline). Six sizes from `--text-*`, three
  weights max (400/500/600). No font weight above 600 anywhere.
- **Spacing.** Only `--space-*` tokens (4px grid). No arbitrary px values.
- **Shape & depth.** Three radii (`--radius-sm/md/full`) assigned by component
  type. Two layered shadows (`--shadow-1/2`), never colored. Borders are 1px
  low-opacity neutral.
- **Icons.** `src/components/icons.tsx` SVG set only — never emoji or unicode
  glyphs as interface icons. Flag/achievement emoji are dataset content, not UI.
- **Motion.** Only on real state changes, 120–250ms, ease-out, animating only
  the properties that change. Never `transition: all`. Respect reduced motion.
- **Tokens live in `src/App.css`.** Components never hardcode hex or magic
  numbers. When unsure whether an effect earns its place, leave it out.

## Tests

Add or update tests when touching session logic, persistence, timing, or
geometry. `src/map/geo.test.ts` and `src/focus/time.test.ts` are the pattern:
pure functions, real published values as anchors, no mocks.

## Git

- `main` is protected: linear history, no force pushes, no deletions.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `ci:`, `chore:`.
- One concern per commit. Keep diffs reviewable.
- Never commit secrets. A gitleaks workflow runs on every push and PR.

## Documentation

Keep `README.md`, `PROJECT_CONTEXT.md` and `CHECKPOINT.md` accurate. If you
cannot verify a claim, do not write it as verified. Stale "all green" claims
were how this project's documentation became actively misleading.

## Do not

- Add network calls, analytics, accounts, or a backend.
- Write source files through shell redirection.
- Compile Rust locally.
- Bypass the local data model for convenience.
- Commit build output.
- Introduce a second overlapping design direction without retiring the first.
