# Contributing

## Ground rules

- **Offline only.** No network calls at runtime, no analytics, no telemetry, no
  accounts. This is a hard product constraint, not a preference. If a change
  needs data, bundle it.
- **Never break `main`.** `main` is protected and requires CI to pass.
- **Small, reviewable commits.** One concern per commit, Conventional Commits
  style (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`).

## Before you push

```bash
npm run verify   # typecheck + build + tests
```

Rust is compiled in CI, not locally — see `AGENTS.md`. Do not run
`cargo build` on a workstation with a nearly full system drive.

## Commits

- `feat(globe): add backface culling for airport pins`
- `fix(timer): reconcile remaining time against wall clock`
- `docs: correct airport count in PROJECT_CONTEXT`

## Pull requests

Use the PR template. Keep the diff scoped. If you touch session logic,
persistence, audio, or the globe, say so explicitly in the description and add
or update tests.
