# Flight Focus

A local-first, private desktop focus app with a flight metaphor — smooth motion, optional ambient audio, and a journey map between real airports.

## Prerequisites

### All platforms
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)

### Windows
Install **Visual Studio Build Tools** with the **Desktop development with C++** workload. Rust on Windows needs `link.exe` from MSVC.

```powershell
# Verify after install
where.exe link
cargo --version
```

## Setup

```bash
npm install
```

## Development

```bash
npm run tauri dev
```

## Verification

```bash
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

## Architecture

- **Shell:** Tauri 2 (desktop-first)
- **UI:** React 19 + TypeScript + Vite
- **Core logic:** Rust (focus session engine, SQLite persistence)
- **Audio:** Web Audio API (local generation only)
- **Data:** Stored locally in `%LOCALAPPDATA%/flight-focus/` on Windows

## Features

- Deterministic focus session phases: takeoff → cruise → touchdown → rest
- Pause, resume, skip, reset with local session stats
- Ambient audio modes: white/brown noise, cabin hum, binaural beats
- Journey map with 60 major airports, great-circle flight arcs
- System-aware dark/light theme with reduced-motion support
