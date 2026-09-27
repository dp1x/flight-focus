# Zero To One Everything Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Flight Focus prototype into a complete, polished, local-first desktop app with a deterministic timer, verified Rust/Tauri core, clean journey/map behavior, and release-grade UI polish.

**Architecture:** Keep the app desktop-first with React + TypeScript on the frontend and Rust in Tauri for stateful logic, persistence, and commands. Treat the focus-session engine as the source of truth, keep audio independent from timer state, and keep all user data local in SQLite or a local settings store. The work should land in small, testable increments so the core timing behavior is locked down before feature expansion.

**Tech Stack:** Tauri 2, React 19, TypeScript 5, Rust 2021, SQLite via `rusqlite`, Web Audio API, Vite.

---

### Task 1: Make The Build Environment Verifiable

**Files:**
- Modify: `README.md`
- Modify: `CHECKPOINT.md`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Document the required Windows toolchain**

Add a short setup note that calls out Visual Studio Build Tools with the C++ workload, because `cargo check` currently fails without `link.exe`.

- [ ] **Step 2: Align app naming with the product**

Rename the template identifiers in `src-tauri/tauri.conf.json` from `tauri-app` to `flight-focus` so the packaged app, window title, and identifier match the product.

- [ ] **Step 3: Define the verification commands**

Update the checkpoint to list the exact commands the next agent should run after the linker is available:

```bash
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

### Task 2: Lock Down The Session Engine With Tests

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add unit tests for deterministic session flow**

Add a `#[cfg(test)] mod tests` block in `src-tauri/src/lib.rs` that covers the engine directly.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_session_starts_idle_and_counts_down() {
        let mut engine = FocusSessionEngine::new();
        let session = engine.create_session(CreateSessionRequest {
            duration_seconds: 1500,
            audio_mode: Some(AudioMode::None),
        }).expect("create session");

        assert_eq!(session.phase, Phase::Idle);
        assert_eq!(session.total_duration_seconds, 1500);
        assert_eq!(session.remaining_seconds, 1500);
        assert!(!session.completed);
    }

    #[test]
    fn tick_advances_to_cruise_before_touchdown() {
        let mut engine = FocusSessionEngine::new();
        engine.create_session(CreateSessionRequest {
            duration_seconds: 120,
            audio_mode: Some(AudioMode::None),
        }).expect("create session");

        let session = engine.tick(1).expect("tick");
        assert!(matches!(session.phase, Phase::Takeoff | Phase::Cruise));
        assert_eq!(session.remaining_seconds, 119);
    }

    #[test]
    fn pause_and_resume_keep_same_session() {
        let mut engine = FocusSessionEngine::new();
        let created = engine.create_session(CreateSessionRequest {
            duration_seconds: 300,
            audio_mode: Some(AudioMode::None),
        }).expect("create session");

        let paused = engine.pause().expect("pause");
        let resumed = engine.resume().expect("resume");

        assert_eq!(created.id, paused.id);
        assert_eq!(paused.id, resumed.id);
        assert_eq!(paused.total_duration_seconds, resumed.total_duration_seconds);
    }

    #[test]
    fn skip_returns_summary_and_clears_session() {
        let mut engine = FocusSessionEngine::new();
        engine.create_session(CreateSessionRequest {
            duration_seconds: 300,
            audio_mode: Some(AudioMode::None),
        }).expect("create session");

        let summary = engine.skip().expect("skip").expect("summary");
        assert!(!summary.completed);
        assert!(engine.current().expect("current").is_none());
    }

    #[test]
    fn complete_clears_elapsed_state() {
        let mut engine = FocusSessionEngine::new();
        engine.create_session(CreateSessionRequest {
            duration_seconds: 60,
            audio_mode: Some(AudioMode::None),
        }).expect("create session");

        let summary = engine.complete().expect("complete");
        assert!(summary.completed);
        assert_eq!(summary.phase, Phase::Touchdown);
    }
}
```

- [ ] **Step 2: Run the tests until they compile cleanly**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: pass on a machine with the MSVC linker installed.

### Task 3: Make Timer State The Single Source Of Truth

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/focus/api.ts`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Replace the DOM-only duration input with React state**

Add `const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);` in `src/App.tsx`, bind it to the duration input, and pass it to `createFocusSession`.

```tsx
const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);

<input
  type="number"
  min={5}
  max={180}
  value={selectedDurationMinutes}
  onChange={(e) => {
    const next = Math.max(5, Math.min(180, Number(e.target.value) || DEFAULT_DURATION_MINUTES));
    setSelectedDurationMinutes(next);
  }}
  className="input"
/>
```

- [ ] **Step 2: Make the IPC contract explicit for journey and session commands**

Verify that the Tauri command argument names and TypeScript wrapper names line up. If `set_journey` keeps snake_case in Rust, keep the Rust command arguments as `departure_code` and `destination_code` only if the frontend wrapper sends those exact keys; otherwise change the wrapper to match the generated IPC payload shape.

- [ ] **Step 3: Make tick handling deterministic**

Choose one timing model and enforce it end to end. The simplest safe option is:

```rust
pub fn tick(&mut self, dt_seconds: i64) -> Result<FocusSession, FlightFocusError> {
    let dt_seconds = dt_seconds.max(0);
    // update by whole seconds only
}
```

Then have the frontend either stop sending fractional seconds or accumulate elapsed time locally and call the backend in whole-second increments.

- [ ] **Step 4: Normalize completion behavior**

Make the Rust engine, stats write path, and UI all agree on what happens when time hits zero. The frontend should not need to infer the final state from partial timer data.

### Task 4: Clean Up The Focus UI And Playback Controls

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/focus/audio.ts`

- [ ] **Step 1: Remove dead or misleading UI state**

Delete unused state and branches that do not affect behavior. Keep `running`, `session`, and `mapView` only if they all drive visible UI.

- [ ] **Step 2: Make audio mode transitions explicit**

Ensure `startAudioForMode`, `stopAudio`, and volume changes do not overlap in a way that leaks nodes or causes double playback.

```ts
useEffect(() => {
  if (!session) {
    void stopAudio();
    return;
  }
  void startAudioForMode(session.audio, volume);
}, [session, volume]);
```

- [ ] **Step 3: Fix visible copy and symbols**

Replace template-looking or corrupted labels such as the cabin-hum icon text if they render incorrectly, and make the top-level title and phase copy consistent with the Flight Focus brand.

- [ ] **Step 4: Run the frontend build again**

Run:

```bash
npm run build
```

Expected: pass with no new warnings introduced by the timer changes.

### Task 5: Make Journey Persistence Boring And Reliable

**Files:**
- Modify: `src/map/AirportSearch.tsx`
- Modify: `src/map/FlightMap.tsx`
- Modify: `src/map/FlightMap.css`
- Modify: `src/App.tsx`
- Modify: `src/focus/api.ts`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Keep airport data loading simple**

Remove duplicate imports or mixed loading paths for `airports.json` so the app loads the airport list once and reuses it.

- [ ] **Step 2: Verify save/load on both airport fields**

Selecting a departure and destination should persist and restore correctly across reloads.

- [ ] **Step 3: Make the Rust journey store resilient**

Treat malformed or missing journey JSON as `None`, not as a hard failure, so local state corruption does not block app startup.

- [ ] **Step 4: Add a quick manual validation path**

Use the app shell to confirm: select two airports, reload, verify the same pair comes back, swap them, reload again, verify the swap persists.

### Task 6: Finish The Map Animation And CSS Consolidation

**Files:**
- Modify: `src/map/FlightMap.tsx`
- Modify: `src/map/FlightMap.css`
- Modify: `src/App.css`

- [ ] **Step 1: Remove the broken plane offset-path animation**

The current `offset-path: path(\"\")` animation is not a valid flight path. Replace it with either SVG animation along the actual arc path or a simpler pulsing plane marker that follows the computed arc position.

- [ ] **Step 2: Move styling into one place**

Pick either inline `<style>` blocks in `FlightMap.tsx` or `FlightMap.css`, not both. Keep the final styling in the CSS file unless there is a strong reason to keep SVG-local styles inline.

- [ ] **Step 3: Respect reduced motion fully**

Keep the map legible and useful when animations are disabled. No information should depend on motion to be understood.

- [ ] **Step 4: Verify the map visually**

Run the app in the Tauri shell and inspect the map at desktop and narrow window sizes to confirm the arc, tooltip, and labels render correctly.

### Task 7: Finish App Identity And Packaging

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Replace template product names everywhere**

Rename remaining `tauri-app` identifiers to `flight-focus` in the Tauri config, Rust crate metadata if needed, and any user-facing packaging strings.

- [ ] **Step 2: Make local setup obvious**

Update the README with the exact prerequisites, install steps, and run commands for a local-first desktop app.

- [ ] **Step 3: Keep scripts minimal**

Preserve the current Vite/Tauri scripts unless a new script is required for testing or packaging. Avoid adding extra tooling unless it materially reduces friction.

### Task 8: Ship Readiness Verification

**Files:**
- Modify: `CHECKPOINT.md`
- Modify: `README.md`

- [ ] **Step 1: Run the full verification sequence**

Run these commands after the MSVC linker is available:

```bash
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

- [ ] **Step 2: Do a manual end-to-end smoke test**

Verify start, pause, resume, skip, reset, completion, stats refresh, journey persistence, and map toggle behavior in the actual desktop shell.

- [ ] **Step 3: Update the checkpoint to reflect the real state**

Mark the completed work and leave the next unresolved item at the top of the checkpoint so the next agent does not repeat the same discovery work.
