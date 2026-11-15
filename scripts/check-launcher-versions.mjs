// Compares the official launcher feeds with launcher-versions.lock.json.
// The feed is the public electron-updater `latest.yml`; no auth, no installer
// download. `--extract` additionally unpacks the published installer to read
// the auth salt, game tag and API base out of `app.asar`.
import { createHash } from "node:crypto";
import { createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extractAsar, readLauncherFacts } from "./launcher-facts.mjs";

const lockPath = resolve(import.meta.dir, "..", "launcher-versions.lock.json");
const args = process.argv.slice(2);
const update = args.includes("--update");
const extract = args.includes("--extract");
const all = args.includes("--all");
const asJson = args.includes("--json");
const requested = args.find((value) => !value.startsWith("--"));

const ATTEMPTS = 3;
const FEED_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

if (extract && !update) {
  console.error("--extract needs --update; it writes what it reads");
  process.exit(2);
}

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
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
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

/// Download once and prove the bytes are the ones the feed describes.
async function downloadInstaller(url, destination, expected) {
  const response = await fetch(url, {
    headers: { "user-agent": "yayl-version-check" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const hash = createHash("sha512");
  let size = 0;
  await pipeline(
    Readable.fromWeb(response.body),
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        size += chunk.length;
        yield chunk;
      }
    },
    createWriteStream(destination),
  );
  if (size !== expected.size) {
    throw new Error(`downloaded ${size} bytes, feed says ${expected.size}`);
  }
  const sha512 = hash.digest("base64");
  if (sha512 !== expected.sha512) {
    throw new Error(`downloaded sha512 ${sha512} does not match the feed`);
  }
}

async function readInstallerFacts(launcher, remote) {
  const work = mkdtempSync(join(tmpdir(), `yayl-${launcher.gameTag}-`));
  try {
    const installer = join(work, remote.file);
    console.error(`  downloading ${remote.file} (${remote.size} bytes)`);
    await downloadInstaller(`${launcher.feed}/${remote.file}`, installer, remote);
    const asar = extractAsar(installer, work);
    const facts = readLauncherFacts(asar);
    if (facts.version !== remote.version) {
      throw new Error(`asar says ${facts.version}, feed says ${remote.version}`);
    }
    if (facts.gameTag !== launcher.gameTag) {
      throw new Error(`asar says game tag ${facts.gameTag}, lock says ${launcher.gameTag}`);
    }
    return facts;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const ids = Object.keys(lock.launchers).filter((id) => !requested || id === requested);
if (ids.length === 0) {
  console.error(`unknown launcher: ${requested}`);
  process.exit(2);
}

const results = [];
let drift = false;
let wrote = false;

for (const id of ids) {
  const launcher = lock.launchers[id];
  try {
    const remote = await fetchFeed(launcher);
    const changed =
      remote.version !== launcher.version ||
      remote.size !== launcher.size ||
      remote.sha512 !== launcher.sha512;
    const result = { id, name: launcher.name, locked: launcher.version, remote, changed };
    if (changed) drift = true;

    if (extract && (changed || all)) {
      const facts = await readInstallerFacts(launcher, remote);
      result.facts = facts;
      const saltMoved = facts.authSalt !== launcher.authSalt;
      const baseMoved = facts.apiBase !== launcher.apiBase;
      result.changed = changed || saltMoved || baseMoved;
      if (result.changed) drift = true;
    }

    results.push(result);
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
    const extra = result.facts ? ` salt ${result.facts.authSalt}` : "";
    console.log(`${result.id.padEnd(9)} ${result.name.padEnd(16)} locked ${result.locked.padEnd(8)} ${note}${extra}`);
  }
}

// A failed feed or a failed extraction leaves the lock untouched: a half
// refreshed lock would build with a version and a salt that never shipped.
if (results.some((result) => result.error)) {
  process.exit(2);
}

if (update) {
  for (const result of results) {
    const launcher = lock.launchers[result.id];
    Object.assign(launcher, {
      version: result.remote.version,
      file: result.remote.file,
      size: result.remote.size,
      sha512: result.remote.sha512,
      ...(result.facts ? { authSalt: result.facts.authSalt, apiBase: result.facts.apiBase } : {}),
    });
    if (result.changed) wrote = true;
  }
  if (wrote) {
    lock.checkedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    if (!asJson) console.log(`updated ${lockPath}`);
  }
  process.exit(0);
}

process.exit(drift ? 1 : 0);
