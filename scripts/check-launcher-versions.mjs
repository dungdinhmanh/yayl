// Compares the official launcher feeds with launcher-versions.lock.json.
// The feed is the public electron-updater `latest.yml`; no auth, no installer download.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const lockPath = resolve(import.meta.dir, "..", "launcher-versions.lock.json");
const args = process.argv.slice(2);
const update = args.includes("--update");
const asJson = args.includes("--json");
const requested = args.find((value) => !value.startsWith("--"));

const ATTEMPTS = 3;
const TIMEOUT_MS = 15_000;

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/// Read the top-level keys and the `files:` list of an electron-updater feed.
function parseLatestYml(text) {
  const clean = (value) => value.trim().replace(/^['"]|['"]$/g, "");
  const top = {};
  const files = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s*-\s+([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (item) {
      current = { [item[1]]: clean(item[2]) };
      files.push(current);
      continue;
    }
    const nested = /^\s+([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (nested && current) {
      current[nested[1]] = clean(nested[2]);
      continue;
    }
    const flat = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (flat) {
      top[flat[1]] = clean(flat[2]);
      current = null;
    }
  }
  return { top, files };
}

async function fetchFeed(launcher) {
  const url = `${launcher.feed}/latest.yml`;
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "yayl-version-check" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { top, files } = parseLatestYml(await response.text());
      const file = files.find((entry) => entry.url === top.path) ?? files[0] ?? {};
      const version = top.version;
      const name = top.path || file.url;
      if (!version || !name) throw new Error("latest.yml has no version or path");
      const expected = `${launcher.gameTag}_Gamelauncher-${version}-setup.exe`;
      if (name !== expected) {
        throw new Error(`latest.yml path ${name} does not match ${expected}`);
      }
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size <= 0) {
        throw new Error("latest.yml has no usable size");
      }
      const sha512 = file.sha512 || top.sha512;
      if (!sha512) throw new Error("latest.yml has no sha512");
      return { version, file: name, size, sha512 };
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(attempt * 1000);
    }
  }
  throw new Error(`${url} failed after ${ATTEMPTS} attempts: ${lastError.message}`);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const ids = Object.keys(lock.launchers).filter((id) => !requested || id === requested);
if (ids.length === 0) {
  console.error(`unknown launcher: ${requested}`);
  process.exit(2);
}

const results = [];
let drift = false;

for (const id of ids) {
  const launcher = lock.launchers[id];
  try {
    const remote = await fetchFeed(launcher);
    const changed =
      remote.version !== launcher.version ||
      remote.size !== launcher.size ||
      remote.sha512 !== launcher.sha512;
    results.push({ id, name: launcher.name, locked: launcher.version, remote, changed });
    if (changed) drift = true;
  } catch (error) {
    results.push({ id, name: launcher.name, locked: launcher.version, error: error.message });
    drift = true;
  }
}

if (asJson) {
  console.log(JSON.stringify({ ok: !drift, results }, null, 2));
} else {
  for (const result of results) {
    if (result.error) {
      console.log(`${result.id.padEnd(9)} ${result.name.padEnd(16)} locked ${result.locked.padEnd(8)} error: ${result.error}`);
      continue;
    }
    const note = result.changed
      ? `remote ${result.remote.version} (${result.remote.file}, ${result.remote.size} bytes)`
      : "up to date";
    console.log(`${result.id.padEnd(9)} ${result.name.padEnd(16)} locked ${result.locked.padEnd(8)} ${note}`);
  }
}

if (!update) {
  process.exit(drift ? 1 : 0);
}

if (results.some((result) => result.error)) {
  console.error("refusing to write the lock: a feed failed");
  process.exit(2);
}

for (const result of results) {
  Object.assign(lock.launchers[result.id], {
    version: result.remote.version,
    file: result.remote.file,
    size: result.remote.size,
    sha512: result.remote.sha512,
  });
}
lock.checkedAt = new Date().toISOString().slice(0, 10);
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
console.log(`updated ${lockPath}`);
