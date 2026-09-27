# Flight Focus — Build Snapshot

## Phase 3 — Achievements, Data Portability, Session Map (Complete in code)

### Completed
- **Core focus app**: Rust session engine, SQLite, Tauri IPC, Web Audio, React UI, theme
- **Map journey**: 60 airports, flight arc map, search, journey persistence, map/timer toggle
- **Map plane animation**: SVG `animateMotion` idle loop; session progress positions plane along arc
- **Phase-linked visuals**: Takeoff/cruise/touchdown styling on timer + map
- **Achievements (7 unlocks)**: First Flight, Frequent Flyer, Hour in Cruise, Week Streak, Route Planner, Globe Trotter, Long Haul — stored locally, evaluated after sessions and journey changes
- **Export / import**: JSON bundle with sessions, journey, achievements, destination history — merge import via file picker
- **Branding**: `flight-focus` product name throughout
- **Rust unit tests**: Session engine + serde shape tests

### UI entry points
- **Show map** — flight arc with session-linked plane progress
- **Progress & data** — achievements grid + export/import controls
- Unlock toast appears when new achievements are earned

### Build status (verified 2026-06-21)
- **`cargo check`**: clean (0 errors)
- **`cargo test`**: 10/10 pass — session engine + serde shape tests
- **`npm run build`** (tsc + vite): clean, 239 kB JS bundle / 781 ms
- **`cargo build`** (debug bin): links cleanly, 18.3 s
- **`tauri build`** (release): see notes below

### Fixes applied during verification
- Removed `pub` from all `#[tauri::command]` fns — the Tauri command macro
  generates a `__cmd__*` item next to each fn; a `pub` fn in the same module
  as `generate_handler!` collides with that generated item (E0255, "defined
  multiple times"). Commands are only referenced by `generate_handler!` within
  the crate, so they don't need to be `pub`.
- `serialize_str(self.to_string())` → `serialize_str(&self.to_string())`.
- `save_json_stat<T: Serialize>` → `+ ?Sized` so it accepts unsized slices.
- `stats()` now maps `rusqlite::Error` → `FlightFocusError` instead of leaking it.
- Phase transition allows `Takeoff → Touchdown` directly, so short sessions or
  large ticks that run out of time during the 30 s takeoff band complete
  correctly instead of erroring.
- Prefixed unused `State` params with `_` (3 commands).

### Windows-on-ARM toolchain notes
This is a Windows-on-ARM machine. The system rustup default is
`aarch64-pc-windows-msvc`, but only the **x86_64** MSVC VC tools are installed
in VS Build Tools 2026. To build here:

1. **Project rustc override** (already set):
   `rustup override set stable-x86_64-pc-windows-msvc`
   (from `src-tauri/`). `rustup default` refuses a non-host toolchain, so use
   an override scoped to the project.
2. **`src-tauri/.cargo/config.toml`** pins `[build] target = "x86_64-pc-windows-msvc"`.
3. **MSVC env wrapper**: `.kilo/vc-cargo.cmd` sources `vcvars64.bat` (puts the
   real `cl.exe` / `link.exe` / `INCLUDE` / `LIB` on PATH) then runs `cargo %*`.
   Cargo/tauri need the MSVC linker; it is not on PATH by default.
   `.kilo/vc-tauri.cmd` does the same for `npm run tauri`.

### Build commands (this machine)
```cmd
:: Rust check + tests
src-tauri\.kilo\..\..\.kilo\vc-cargo.cmd check
src-tauri\.kilo\..\..\.kilo\vc-cargo.cmd test

:: Frontend
npm install
npm run build

:: Native bin (debug)
.kilo\vc-cargo.cmd build   (run from src-tauri)

:: Full release bundle (installer)
.kilo\vc-tauri-build.cmd
```

### Manual smoke test (app now builds)
1. Pick departure + destination → reload → airports persist
2. Start a short session → plane moves on map when toggled
3. Complete session → stats update, achievement unlock toast if earned
4. Export JSON → import same file → counts merge without duplicates
5. Toggle reduced motion in OS → map plane stays static at departure when idle

### Future ideas
- Achievement detail modal with unlock dates
- Replace import merge with explicit replace option in UI
- Phase-synced audio crossfade on takeoff/touchdown
- More airports and route distance stats
