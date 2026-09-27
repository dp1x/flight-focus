#!/usr/bin/env node
/**
 * One-shot dev utility: beautify a minified stylesheet into readable form.
 * Usage: node scripts/beautify-css.mjs <in.css> <out.css>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node scripts/beautify-css.mjs <in.css> <out.css>");
  process.exit(1);
}

const raw = readFileSync(inPath, "utf8");

let out = "";
let indent = 0;
let i = 0;
const tab = "  ";

// Never break inside a string literal.
let inString = false;
let stringChar = "";

while (i < raw.length) {
  const ch = raw[i];

  if (inString) {
    out += ch;
    if (ch === stringChar && raw[i - 1] !== "\\") inString = false;
    i++;
    continue;
  }

  if (ch === '"' || ch === "'") {
    inString = true;
    stringChar = ch;
    out += ch;
    i++;
    continue;
  }

  if (ch === "{") {
    out = out.trimEnd() + " {\n" + tab.repeat(++indent);
    i++;
    continue;
  }
  if (ch === "}") {
    out = out.trimEnd() + "\n" + tab.repeat(--indent) + "}\n";
    if (indent === 0) out += "\n";
    i++;
    continue;
  }
  if (ch === ";") {
    out = out.trimEnd() + ";\n" + tab.repeat(indent);
    i++;
    continue;
  }
  if (ch === ",") {
    out = out.trimEnd() + ",\n" + tab.repeat(indent);
    i++;
    continue;
  }
  if (ch === "\n") {
    // The minifier strips comments; keep declarations on one line each.
    i++;
    continue;
  }
  out += ch;
  i++;
}

writeFileSync(outPath, out.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
console.log(`wrote ${outPath}`);
