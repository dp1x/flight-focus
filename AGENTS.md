# AGENTS.md

## Project
Flight Focus — a local-first, private, lightweight desktop focus app with a flight metaphor, smooth Apple-like motion, and optional ambient audio modes.

## Operating principles
- Prefer small, composable changes over broad rewrites.
- Keep the codebase simple enough to understand without an external service dependency.
- Default to offline/local behavior.
- Never introduce telemetry, ads, or hidden network calls.
- Preserve user data locally unless a sync feature is explicitly requested.

## Architecture constraints
- Desktop-first shell: Tauri.
- UI: React + TypeScript.
- Core logic: Rust.
- Persistence: local-first storage only.
- Audio: local generation or local file playback only.
- Cloud features must be optional and behind clear feature flags.

## Product goals
- Fast start-up.
- Low memory use.
- Calm, premium, Apple-like visual language.
- Smooth but restrained animation.
- Distraction-free focus sessions.
- Strong privacy and resilience offline.

## Coding standards
- Write clear, typed, maintainable TypeScript.
- Use Rust for stateful, sensitive, or performance-critical logic.
- Handle errors explicitly.
- Avoid clever abstractions that reduce readability.
- Keep modules narrow in responsibility.
- Use accessible UI patterns and keyboard support.
- Respect reduced-motion settings.

## UI standards
- Visual style: clean, minimal, soft depth, subtle blur, restrained gradients.
- Motion: fluid and purposeful, never noisy.
- Prefer content hierarchy over decoration.
- Use spacious layouts and strong typography.
- Ensure every transition has a functional purpose.
- Keep the app usable with motion disabled.

## Data and privacy
- Store settings, sessions, streaks, and audio preferences locally.
- Encrypt sensitive local data if any secrets or tokens are ever added.
- Do not log personal content unnecessarily.
- Do not require login.

## Agent workflow
- Read the existing structure before editing.
- Make the smallest useful change.
- Update docs when behavior or architecture changes.
- Add tests or checks when touching session logic, persistence, audio, or permissions.
- Verify changes in the app shell and not only in isolated components.

## When building features
- Start with the focus-session state machine.
- Keep timer logic deterministic.
- Separate UI animation from core timing.
- Keep audio playback independent from the timer engine.
- Treat background/lock-screen behavior as a first-class requirement.
- Make every feature work offline by default.

## Kilo Code usage guidance
- Use project-level instructions first.
- Prefer custom modes for specialized tasks:
  - Architect for design and system decisions
  - Code for implementation
  - Debug for failures and reproduction
  - QA for verification and accessibility checks
- Use narrow tool permissions for safer modes.
- Keep MCP integrations explicit, reviewed, and optional.

## Do not
- Add unnecessary backend services.
- Add analytics or tracking by default.
- Bypass the local data model for convenience.
- Inflate the UI with many panels or dense controls.
- Ship features without a clear offline story.
