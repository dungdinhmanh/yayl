// Reads the facts YAYL needs out of an official launcher installer without
// running it: unpack the NSIS payload, open `resources/app.asar`, and pull the
// version, auth salt, game tag and API base out of the main bundle.
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

const SEVEN_ZIP = [
  process.env.YAYL_7Z,
  "7zz",
  "7z",
  "7za",
  "C:\\Program Files\\7-Zip\\7z.exe",
  "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  "C:\\Windows\\System32\\7z.exe",
].filter(Boolean);

/// 7-Zip is the only tool that unpacks an electron-builder NSIS installer.
export function findSevenZip() {
  for (const candidate of SEVEN_ZIP) {
    try {
      execFileSync(candidate, ["i"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("7-Zip not found; install 7zz or set YAYL_7Z");
}

function unpack(sevenZip, archive, destination) {
  execFileSync(sevenZip, ["x", archive, `-o${destination}`, "-y"], { stdio: "ignore" });
}

function findPayload(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findPayload(path));
    else if (/^app-(?:64|32)\.7z$/i.test(entry.name)) found.push(path);
  }
  return found.sort((a, b) => a.localeCompare(b));
}

/// Unpack the installer into `workDir` and return the path to `app.asar`.
export function extractAsar(installer, workDir) {
  const sevenZip = findSevenZip();
  const nsisDir = join(workDir, "nsis");
  const appDir = join(workDir, "app");
  unpack(sevenZip, installer, nsisDir);
  const payload = findPayload(nsisDir).at(-1);
  if (!payload) {
    throw new Error("installer has no app-32.7z or app-64.7z payload");
  }
  unpack(sevenZip, payload, appDir);
  const asar = join(appDir, "resources", "app.asar");
  if (!statSync(asar, { throwIfNoEntry: false })) {
    throw new Error("installer has no resources/app.asar");
  }
  return asar;
}

/// `asar` is a JSON header at a fixed offset followed by the file bytes.
export function readAsar(file) {
  const fd = openSync(file, "r");
  const head = Buffer.alloc(16);
  readSync(fd, head, 0, 16, 0);
  const jsonLength = head.readUInt32LE(12);
  const json = Buffer.alloc(jsonLength);
  readSync(fd, json, 0, jsonLength, 16);
  const header = JSON.parse(json.toString("utf8"));
  const dataStart = 8 + head.readUInt32LE(4);
  return {
    read(path) {
      let node = header;
      for (const part of path.split("/")) {
        node = node?.files?.[part];
        if (!node) throw new Error(`app.asar has no ${path}`);
      }
      if (typeof node.size !== "number") throw new Error(`app.asar entry ${path} has no size`);
      const buffer = Buffer.alloc(node.size);
      readSync(fd, buffer, 0, node.size, dataStart + Number(node.offset));
      return buffer;
    },
    close() {
      closeSync(fd);
    },
  };
}

const SALT = /["']?salt["']?\s*:\s*["']([0-9A-Fa-f]{32})["']/;
const GAME_ID = /["']?game_id["']?\s*:\s*["']([A-Za-z0-9_]{2,64})["']/;
const GAME_TAG = /["']?game_tag["']?\s*:\s*["']([A-Za-z0-9_]{2,64})["']/;
const GAME_ID_CAMEL = /gameId\s*:\s*["']([A-Za-z0-9_]{2,64})["']/;
const API_BASE = /https:\/\/api-launcher-[a-z]{2,8}\.yo-star\.com/;

/// The launcher passes `electron.app.getVersion()` into the auth header, so the
/// package version of the asar is the protocol version it sends.
export function readLauncherFacts(asarPath) {
  const asar = readAsar(asarPath);
  try {
    const pkg = JSON.parse(asar.read("package.json").toString("utf8"));
    const main = asar.read("out/main/index.js").toString("utf8");
    const salt = SALT.exec(main)?.[1];
    if (!salt) throw new Error("main bundle has no auth salt");
    const apiBase = API_BASE.exec(main)?.[0];
    if (!apiBase) throw new Error("main bundle has no api-launcher host");
    const gameTag =
      GAME_TAG.exec(main)?.[1] ?? GAME_ID_CAMEL.exec(main)?.[1] ?? GAME_ID.exec(main)?.[1];
    if (!gameTag) throw new Error("main bundle has no game tag");
    if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
      throw new Error("package.json has no version");
    }
    return {
      name: typeof pkg.name === "string" ? pkg.name : "",
      version: pkg.version,
      gameTag,
      authSalt: salt.toUpperCase(),
      apiBase,
    };
  } finally {
    asar.close();
  }
}
