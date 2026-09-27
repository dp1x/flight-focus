# Flight Focus Blueprint

## 1. Product idea

Flight Focus is a focus timer that turns work into a calm flight journey. A session feels like takeoff, cruise, landing, and progress accumulation. The experience should be motivating without being loud, gamified without feeling childish, and premium without requiring cloud dependence.

The current Flight Focus app listing describes a Pomodoro-style timer with flight mode, city unlocking, a global flight map, achievements, themes, and optional iCloud sync. The product direction below keeps that core idea and rebuilds it as a lean desktop app with stronger privacy and offline control.

## 2. Product goals

- Private by default
- Offline-first
- Fast and lightweight
- Smooth Apple-like motion
- Calm ambient visuals
- Clear focus-session state
- Easy to extend with audio modes and future features

## 3. Core feature set

### Focus experience
- Pomodoro / custom session lengths
- Takeoff, cruise, touchdown phases
- Session pause, resume, skip, and reset
- Streaks, total focus time, and milestones
- Focus map and destination unlocks
- Session history and productivity stats

### Visual system
- Glassy but restrained cards
- Soft gradients and layered depth
- Animated takeoff / landing transitions
- Map-based journey visualization
- Theme presets with strong contrast support
- Reduced-motion fallback

### Audio system
- White noise
- Brown noise
- Quiet hum / aircraft cabin hum
- Binaural beats (at various levels for brainwaves: delta, theta, beta, alpha, gamma)
- Import your own sound file, control settings
- Loop playback, maybe with fade in/out
- Per-session audio presets
- Master mute and volume controls

### Privacy and storage
- Local sessions database
- Local settings store
- Optional encrypted export/import
- No account required for core use
- Optional sync only if added later and clearly opt-in

## 4. Recommended architecture

### Shell
- Tauri desktop app
- React + TypeScript frontend
- Rust backend for core logic and system integration

Why this stack:
- Tauri gives a small native desktop shell and lets the frontend stay web-based while core logic lives in Rust.
- It supports any frontend framework and is designed for a small app footprint.
- Its security model supports window-specific and platform-specific capabilities.

### Frontend
- React UI with a single primary route for focus mode
- Separate routes/panels for stats, library, settings, and themes
- Motion system built with Framer Motion or equivalent
- Design tokens for spacing, blur, radius, shadows, typography
- Accessible keyboard-first controls

### Rust core
- Session state machine
- Timer scheduler
- Audio playback orchestration
- Persistence layer
- Permissions and window control
- OS integrations if needed later

### Storage
- Local SQLite or equivalent local store for durable history
- Simple key-value store for preferences
- Optional exported backup format in JSON
- No network dependence for normal operation

### Event flow
1. User starts a focus session.
2. Rust validates mode and creates a session record.
3. UI switches to takeoff animation.
4. Timer ticks from the Rust scheduler or a dedicated timing service.
5. Audio mode starts or fades in.
6. State updates stream to the UI.
7. On completion, touchdown animation runs.
8. Stats, streaks, and map progress are committed locally.

## 5. Agentic coding workflow

Use the project as an agent-friendly codebase, not a pile of prompts.

### Files that matter
- `AGENTS.md` for project-level rules
- `README.md` for human setup
- `docs/` for product and engineering notes
- Optional Kilo custom modes for:
  - architecture
  - implementation
  - debugging
  - QA
  - documentation

### How the coding agent should work
- Read project instructions first
- Inspect the smallest relevant files
- Plan before editing
- Prefer one concern per change
- Keep diffs reviewable
- Verify behavior after each meaningful change
- Write or update tests when core logic changes

### What the agent should optimize for
- Deterministic timer logic
- Minimal state duplication
- Clear separation of UI and core logic
- Readable code over abstraction density
- Safety in file and permission handling
- Stable performance on modest hardware

## 6. Recommended module layout

- `src/ui/`
  - screens
  - components
  - theme
  - motion
- `src/state/`
  - session state
  - settings
  - stats
- `src/audio/`
  - generators
  - loop playback
  - presets
- `src/map/`
  - route logic
  - unlocks
  - achievements
- `src/rust/`
  - timer engine
  - persistence
  - platform hooks

## 7. UI behavior

### Primary screen
- One dominant focus surface
- Session status visible at a glance
- Time remaining large and centered
- Current phase clear
- Audio controls minimal and reachable

### Secondary screens
- Stats
- Map and destinations
- Themes and sound modes
- Settings
- Export / backup

### Motion rules
- Motion should feel liquid and continuous
- Keep transitions short and functional
- Use easing that feels premium, not playful
- Never make motion necessary for comprehension
- Always support reduced-motion mode
- Should not be a pain on the GPU, keep it lightweight, lean, and efficient

## 8. Audio feature design

### Built-in modes
- White noise
- Brown noise
- Cabin hum
- Binaural beats

### Import mode
- Accept common local audio files
- Validate file type before import
- Cache waveform and metadata locally
- Let the user choose loop start and end points

### Playback behavior
- Seamless loop with fade edges
- Optional crossfade between tracks
- Session-linked presets
- Independent volume from system audio

## 9. Non-functional requirements

- Launch fast
- Keep memory low
- Work offline
- Avoid background network polling
- Respect accessibility settings
- Be resilient to sleep/wake and app focus changes
- Keep animation and audio smooth on modest laptops

## 10. Build phases

### Phase 1
- Focus timer
- Local persistence
- Basic themes
- Audio playback
- Session stats

### Phase 2
- Map journey
- Unlock system
- Achievements
- Advanced animations
- Export/import

### Phase 3
- Optional sync
- Extra integrations
- More nuanced analytics, still local-first
- Plugin or MCP-based extensibility if genuinely needed

## 11. Practical implementation choice

Best default:
- Tauri + React + Rust
- Local SQLite
- Framer Motion-style motion system
- Web Audio API or native audio bridge
- Optional plugin layer only when necessary

This gives the cleanest path to a small, private, premium-feeling desktop app.
