#!/usr/bin/env node
/**
 * Source integrity guard.
 *
 * This repository lost two source files to a botched shell redirect: a literal
 * redirection artefact was written into `FlightGlobeView.tsx` and
 * `FlightMap.tsx`, leaving them as 12-byte non-modules and breaking the build
 * with a confusing "Cannot find name 'NoNewline'" error.
 *
 * This script fails the build when that (or similar) corruption is present, so
 * it cannot land again. No dependencies, safe to run anywhere.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const ROOT = process.cwd();

/** Directories we never walk into. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".kilo",
  ".freebuff",
  "target",
  ".vscode",
]);

/** Extensions treated as text source we are responsible for. */
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".html",
  ".md",
  ".rs",
  ".toml",
  ".yml",
  ".yaml",
  ".cmd",
  ".ps1",
  ".svg",
]);

/** Source extensions that must never be empty. */
const MUST_HAVE_CONTENT = new Set([".ts", ".tsx", ".js", ".mjs", ".rs", ".css"]);

/**
 * The redirection artefact, assembled from parts so this file does not itself
 * contain the string it is looking for.
 */
const SHELL_ARTIFACT = ["-", "No", "Newline"].join("");

/** This file has to mention the artefact, so it is exempt from its own scan. */
const SELF = "scripts/check-source-integrity.mjs";

const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full);
      continue;
    }

    if (!TEXT_EXTENSIONS.has(extname(entry))) continue;

    const rel = relative(ROOT, full).split(sep).join("/");
    if (rel === SELF) continue;

    let raw;
    try {
      raw = readFileSync(full);
    } catch {
      continue;
    }

    // NUL bytes mean this is not text at all.
    if (raw.includes(0)) {
      problems.push(`${rel}: contains NUL bytes (not a text file)`);
      continue;
    }

    const text = raw.toString("utf8");

    if (text.includes(SHELL_ARTIFACT)) {
      problems.push(
        `${rel}: contains the shell artefact "${SHELL_ARTIFACT}" — this file was overwritten by a redirect, not edited`,
      );
      continue;
    }

    // A source file that is nothing but whitespace is a botched write.
    if (MUST_HAVE_CONTENT.has(extname(entry)) && text.trim().length === 0) {
      problems.push(`${rel}: is empty or whitespace-only`);
    }
  }
}

walk(ROOT);

if (problems.length > 0) {
  console.error("Source integrity check failed:\n");
  for (const problem of problems) {
    console.error(`  x ${problem}`);
  }
  console.error(
    `\n${problems.length} problem(s) found. Refusing to continue — a build on top of this would fail confusingly.`,
  );
  process.exit(1);
}

console.log("Source integrity check passed.");
