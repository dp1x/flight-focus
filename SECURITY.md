# Security Policy

## Scope

Flight Focus is a **local-first, offline desktop application**. It has no
backend, no accounts, no telemetry, and is designed to make no network requests
at runtime.

The most relevant security properties to protect are therefore:

- **No outbound network calls.** Any code that introduces one is a defect.
- **No secrets in the repository.** The project ships no tokens or credentials.
- **Local data integrity.** Sessions, journey state, and achievements live in a
  local SQLite database and must not be silently mutated or exfiltrated.
- **Import validation.** The JSON import path parses untrusted files and must
  not be able to escape its data model.

## Reporting a vulnerability

Open a private security advisory via GitHub:
`Security` → `Advisories` → `Report a vulnerability`.

Please do not open a public issue for anything exploitable. Include
reproduction steps and the affected version or commit.

## Supported versions

Only the latest released version is supported.
