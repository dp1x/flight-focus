#!/usr/bin/env node
/**
 * Installs a pre-commit hook that runs the same cheap checks CI runs.
 *
 * Runs from npm's `prepare` lifecycle, so a fresh `npm install` wires it up.
 * Always exits 0: a missing or unusual checkout must never break installation.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARKER = "# flight-focus-managed-hook";

const HOOK = `#!/bin/sh
${MARKER}
# Installed by scripts/install-hooks.mjs. Re-run "npm install" to refresh.
# Bypass with: git commit --no-verify
set -e
npm run --silent check:integrity
npm run --silent typecheck
`;

try {
  const gitDir = join(process.cwd(), ".git");
  if (!existsSync(gitDir)) {
    // Not a git checkout (tarball, vendored copy). Nothing to do.
    process.exit(0);
  }

  const hooksDir = join(gitDir, "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const target = join(hooksDir, "pre-commit");
  if (existsSync(target)) {
    const existing = readFileSync(target, "utf8");
    if (!existing.includes(MARKER)) {
      console.log(
        "A pre-commit hook already exists and is not managed by this project; leaving it untouched.",
      );
      process.exit(0);
    }
  }

  writeFileSync(target, HOOK, { mode: 0o755 });
  try {
    chmodSync(target, 0o755);
  } catch {
    // Best effort; Git for Windows runs hooks through sh regardless.
  }

  console.log("Installed pre-commit hook: .git/hooks/pre-commit");
} catch (error) {
  console.warn(
    `Could not install git hooks: ${error instanceof Error ? error.message : String(error)}`,
  );
}

process.exit(0);
