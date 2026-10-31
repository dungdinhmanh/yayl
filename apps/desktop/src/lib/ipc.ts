/* Typed wrappers for the Tauri command layer.
   The web build has no Rust host, so every wrapper falls back to the mock data
   used by the UI lab. Components never call `invoke` directly. */

import { GAMES, type GameId } from "../data";

export interface DiskSpace {
  freeBytes: number;
  totalBytes: number;
}

export interface InstallPlan {
  path: string;
  drive: string;
  downloadBytes: number;
  installBytes: number;
  freeBytes: number;
  totalBytes: number;
  enoughSpace: boolean;
  missingBytes: number;
}

export type DownloadState =
  | "pending"
  | "running"
  | "verifying"
  | "paused"
  | "completed"
  | "failed";

export type DownloadPhase =
  | "preparing"
  | "downloading"
  | "verifying"
  | "committing"
  | "done"
  | "paused"
  | "failed";

export interface DownloadSnapshot {
  game: string;
  version: string;
  state: DownloadState;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  installed: boolean;
  resumable: boolean;
  active: boolean;
}

export interface DownloadProgress {
  game: string;
  phase: DownloadPhase;
  downloaded: number;
  downloadTotal: number;
  installed: number;
  installTotal: number;
  bytesPerSec: number;
  filesDone: number;
  filesTotal: number;
  code?: string;
  detail?: string;
}

export interface Settings {
  installRoots: Record<string, string>;
  language: string | null;
}

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const GIB = 1024 ** 3;

/* Deterministic drive presets so the lab can demonstrate enough/insufficient
   space by changing the path. */
const DISK_PRESETS: Record<string, DiskSpace> = {
  "C:": { freeBytes: 24 * GIB, totalBytes: 256 * GIB },
  "D:": { freeBytes: 182 * GIB, totalBytes: 512 * GIB },
  "E:": { freeBytes: 720 * GIB, totalBytes: 1024 * GIB },
};

const MOCK_DRIVES = ["D:", "E:", "C:"];

const downloadCache = new Map<GameId, number>();

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(command, args);
}

export function isTauri(): boolean {
  return IS_TAURI;
}

export function driveOf(path: string): string {
  const match = /^([A-Za-z]):/.exec(path.trim());
  return match ? `${match[1].toUpperCase()}:` : "D:";
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}

/* Total download size for a game. Cached per game: changing the install path
   only needs the disk query to run again. */
export async function fetchDownloadBytes(gameId: GameId): Promise<number> {
  const cached = downloadCache.get(gameId);
  if (cached !== undefined) return cached;

  if (IS_TAURI) {
    const bytes = await invoke<number>("download_bytes", { game: gameId });
    downloadCache.set(gameId, bytes);
    return bytes;
  }

  await delay(650);
  const bytes = GAMES[gameId].downloadBytes;
  downloadCache.set(gameId, bytes);
  return bytes;
}

export async function fetchDiskSpace(path: string): Promise<DiskSpace> {
  if (!path.trim()) throw new Error("empty install path");

  if (IS_TAURI) {
    return invoke<DiskSpace>("disk_space", { path });
  }

  await delay(420);
  return DISK_PRESETS[driveOf(path)] ?? DISK_PRESETS["D:"];
}

/* Manifest size and disk space are independent: run both at the same time. */
export async function planInstall(gameId: GameId, path: string): Promise<InstallPlan> {
  const [downloadBytes, disk] = await Promise.all([
    fetchDownloadBytes(gameId),
    fetchDiskSpace(path),
  ]);
  const missingBytes = Math.max(0, downloadBytes - disk.freeBytes);
  return {
    path,
    drive: driveOf(path),
    downloadBytes,
    installBytes: downloadBytes,
    freeBytes: disk.freeBytes,
    totalBytes: disk.totalBytes,
    enoughSpace: missingBytes === 0,
    missingBytes,
  };
}

/* Real host: opens a native folder picker. Lab: cycles the drive so the disk
   query can be reviewed without a file dialog. */
export async function chooseInstallFolder(current: string): Promise<string> {
  if (IS_TAURI) {
    const selected = await invoke<string | null>("choose_install_folder", { defaultPath: current });
    return selected || current;
  }

  const currentDrive = driveOf(current);
  const index = MOCK_DRIVES.indexOf(currentDrive);
  const next = MOCK_DRIVES[(index + 1) % MOCK_DRIVES.length];
  return current.replace(/^[A-Za-z]:/, next);
}

export async function openInstallFolder(gameId: GameId, path: string): Promise<void> {
  if (IS_TAURI) {
    await invoke("open_install_folder", { game: gameId, path });
    return;
  }
  console.info(`[YAYL mock] open install folder: ${path}`);
}

export async function defaultInstallRoot(gameId: GameId): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("default_install_root", { game: gameId });
  }
  return GAMES[gameId].path;
}

export async function loadSettings(): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("load_settings");
  }
  return { installRoots: {}, language: null };
}

export async function saveInstallRoot(gameId: GameId, path: string): Promise<void> {
  if (IS_TAURI) {
    await invoke("save_install_root", { game: gameId, path });
  }
}

export async function downloadStatus(
  gameId: GameId,
  path: string
): Promise<DownloadSnapshot | null> {
  if (!IS_TAURI || !path.trim()) return null;
  return invoke<DownloadSnapshot | null>("download_status", { game: gameId, path });
}

/* Returns true when a real backend accepted the download. The web lab keeps
   its static download state so the UI can still be reviewed. */
export async function startDownload(gameId: GameId, path: string): Promise<boolean> {
  if (!IS_TAURI) return false;
  await invoke("start_download", { game: gameId, path });
  return true;
}

export async function cancelDownload(gameId: GameId): Promise<void> {
  if (IS_TAURI) {
    await invoke("cancel_download", { game: gameId });
  }
}

/* Drop the saved resume state but keep downloaded and partial files. */
export async function discardDownload(gameId: GameId, path: string): Promise<void> {
  if (IS_TAURI) {
    await invoke("discard_download", { game: gameId, path });
  }
}

export async function onDownloadProgress(
  handler: (progress: DownloadProgress) => void
): Promise<() => void> {
  if (!IS_TAURI) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen<DownloadProgress>("download-progress", (event) => handler(event.payload));
}

export async function windowMinimize(): Promise<void> {
  if (IS_TAURI) await invoke("window_minimize");
}

export async function windowToggleMaximize(): Promise<void> {
  if (IS_TAURI) await invoke("window_toggle_maximize");
}

export async function windowClose(): Promise<void> {
  if (IS_TAURI) await invoke("window_close");
}

export function fileUrl(path: string): string {
  return `file:///${path.replace(/\\/g, "/")}`;
}
