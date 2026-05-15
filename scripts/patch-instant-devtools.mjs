#!/usr/bin/env node

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const DASH_URL = normalizeHttpUrl(
  process.env.INSTANT_DASH_URL ?? "https://dash.sebastianpatrickk.site",
  "INSTANT_DASH_URL",
);
const API_URL = normalizeHttpUrl(
  process.env.INSTANT_API_URL ?? "https://instant-api.sebastianpatrickk.site",
  "INSTANT_API_URL",
);
const WEBSOCKET_URL = normalizeWebsocketUrl(
  process.env.INSTANT_WEBSOCKET_URL ??
    `${API_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}/runtime/session`,
  "INSTANT_WEBSOCKET_URL",
);

const packageRoots = [
  path.join(rootDir, "node_modules", "@instantdb", "core"),
  path.join(rootDir, "node_modules", "@instantdb", "react"),
  path.join(rootDir, "node_modules", "@instantdb", "admin"),
].filter(existsSync);

const runtimeExtensions = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx"]);

const replacements = [
  ["https://instantdb.com", DASH_URL],
  ["https://api.instantdb.com", API_URL],
  ["wss://api.instantdb.com/runtime/session", WEBSOCKET_URL],
];

let scanned = 0;
let changed = 0;

for (const packageRoot of packageRoots) {
  for (const filePath of walk(packageRoot)) {
    const ext = path.extname(filePath);
    if (
      !runtimeExtensions.has(ext) ||
      filePath.endsWith(".map") ||
      filePath.endsWith(".d.ts") ||
      filePath.includes(`${path.sep}__tests__${path.sep}`)
    ) {
      continue;
    }

    scanned += 1;
    const original = readFileSync(filePath, "utf8");
    let next = original;

    for (const [from, to] of replacements) {
      next = next.split(from).join(to);
    }

    if (next !== original) {
      writeFileSync(filePath, next);
      changed += 1;
      console.log(`patched ${path.relative(rootDir, filePath)}`);
    }
  }
}

if (packageRoots.length === 0) {
  console.warn("No @instantdb packages found. Run npm install, then rerun this script.");
  process.exitCode = 1;
} else if (changed === 0) {
  console.log(`No Instant URLs needed patching across ${scanned} files.`);
} else {
  console.log(
    `Patched ${changed} Instant file(s): dashboard=${DASH_URL}, api=${API_URL}, websocket=${WEBSOCKET_URL}`,
  );
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") {
      continue;
    }

    const entryPath = path.join(dir, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      yield* walk(entryPath);
    } else if (stats.isFile()) {
      yield entryPath;
    }
  }
}

function normalizeHttpUrl(value, envName) {
  const url = normalizeUrl(value, envName);
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(`${envName} must start with http:// or https://`);
  }
  return url;
}

function normalizeWebsocketUrl(value, envName) {
  const url = normalizeUrl(value, envName);
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    throw new Error(`${envName} must start with ws:// or wss://`);
  }
  return url;
}

function normalizeUrl(value, envName) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error(`${envName} cannot be empty`);
  }
  return trimmed;
}
