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

export type ProxyMode = "direct" | "system" | "manual";
export type DownloadOrder = "smallest_first" | "largest_first" | "manifest";
export type BackgroundMode = "art" | "solid";

export interface ProxySettings {
  mode: ProxyMode;
  url?: string | null;
  noProxy?: string | null;
}

export interface Settings {
  installRoots: Record<string, string>;
  language: string | null;
  proxy: ProxySettings;
  downloadOrder: DownloadOrder;
  concurrency: number;
  reducedMotion: boolean;
  background: BackgroundMode;
  onboardingComplete: boolean;
  closeToTray: boolean;
}

export interface GameProfileInfo {
  id: string;
  installDir: string;
  defaultRoot: string;
}

export interface GameProfiles {
  base: string;
  games: GameProfileInfo[];
}

export interface AppInfo {
  version: string;
  debug: boolean;
}

export interface PlaytimeEntry {
  seconds: number;
  lastPlayed: number | null;
}

export interface GameExitEvent {
  game: string;
  totalSeconds: number;
  lastPlayed: number;
}

export interface VerifyIssue {
  path: string;
  kind: "missing" | "size_mismatch" | "checksum_mismatch";
  expectedSize: number;
  actualSize: number | null;
}

export interface VerifyReport {
  files: number;
  verified: number;
  bytesVerified: number;
  bytesToRepair: number;
  issues: VerifyIssue[];
}

export interface NewsBanner {
  image: string;
  url: string;
  remark: string;
}

export interface NewsItem {
  title: string;
  url: string;
  date: string;
  image: string;
}

export interface NewsSection {
  label: string;
  items: NewsItem[];
}

export interface NewsFeed {
  banners: NewsBanner[];
  sections: NewsSection[];
}

export interface GameVersion {
  local: string | null;
  latest: string | null;
  minimum: string | null;
}

export function defaultSettings(): Settings {
  return {
    installRoots: {},
    language: null,
    proxy: { mode: "direct", url: null, noProxy: null },
    downloadOrder: "smallest_first",
    concurrency: 10,
    reducedMotion: false,
    background: "art",
    onboardingComplete: false,
    closeToTray: true,
  };
}

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/* The web lab has no settings file. Keep one in memory so the settings and
   first-run screens behave the same way they do in the real app. */
let mockSettings: Settings = {
  ...defaultSettings(),
  onboardingComplete: true,
};

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
  return { ...mockSettings };
}

export async function saveInstallRoot(gameId: GameId, path: string): Promise<void> {
  if (IS_TAURI) {
    await invoke("save_install_root", { game: gameId, path });
    return;
  }
  mockSettings = {
    ...mockSettings,
    installRoots: { ...mockSettings.installRoots, [gameId]: path },
  };
}

export async function setLanguage(language: "vi" | "en"): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("set_language", { language });
  }
  mockSettings = { ...mockSettings, language };
  return { ...mockSettings };
}

export interface NetworkSettingsPatch {
  mode: ProxyMode;
  url: string | null;
  noProxy: string | null;
  downloadOrder: DownloadOrder;
  concurrency: number;
}

export async function saveNetworkSettings(
  patch: NetworkSettingsPatch
): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("save_network_settings", { patch });
  }
  mockSettings = {
    ...mockSettings,
    proxy: {
      mode: patch.mode,
      url: patch.mode === "manual" ? patch.url : null,
      noProxy: patch.mode === "manual" ? patch.noProxy : null,
    },
    downloadOrder: patch.downloadOrder,
    concurrency: patch.concurrency,
  };
  return { ...mockSettings };
}

export async function saveAppearance(
  reducedMotion: boolean,
  background: BackgroundMode
): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("save_appearance", { reducedMotion, background });
  }
  mockSettings = { ...mockSettings, reducedMotion, background };
  return { ...mockSettings };
}

export async function saveWindowBehavior(closeToTray: boolean): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("save_window_behavior", { closeToTray });
  }
  mockSettings = { ...mockSettings, closeToTray };
  return { ...mockSettings };
}

export async function saveFirstRun(
  language: "vi" | "en",
  roots: Record<string, string>
): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("save_first_run", { input: { language, roots } });
  }
  mockSettings = {
    ...mockSettings,
    language,
    installRoots: { ...mockSettings.installRoots, ...roots },
  };
  return { ...mockSettings };
}

export async function completeOnboarding(): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("complete_onboarding");
  }
  mockSettings = { ...mockSettings, onboardingComplete: true };
  return { ...mockSettings };
}

export async function resetSettings(): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("reset_settings");
  }
  mockSettings = {
    ...defaultSettings(),
    installRoots: mockSettings.installRoots,
    onboardingComplete: mockSettings.onboardingComplete,
  };
  return { ...mockSettings };
}

export async function gameProfiles(): Promise<GameProfiles> {
  if (IS_TAURI) {
    return invoke<GameProfiles>("game_profiles");
  }
  return {
    base: "D:\\Games\\YAYL",
    games: (Object.keys(GAMES) as GameId[]).map((id) => ({
      id,
      installDir: GAMES[id].path.split("\\").pop() ?? id,
      defaultRoot: GAMES[id].path,
    })),
  };
}

export async function appInfo(): Promise<AppInfo> {
  if (IS_TAURI) {
    return invoke<AppInfo>("app_info");
  }
  return { version: "0.1.0", debug: true };
}

export async function fetchPlaytime(gameId: GameId): Promise<PlaytimeEntry | null> {
  if (!IS_TAURI) return null;
  return invoke<PlaytimeEntry>("playtime", { game: gameId });
}

export async function fetchNews(gameId: GameId): Promise<NewsFeed | null> {
  if (!IS_TAURI) {
    /* Dev-only bridge from vite.config.ts. It signs the request with the same
       public protocol envelope as the Rust client so the browser lab can be
       reviewed against real news data. */
    if (!import.meta.env.DEV) return null;
    const response = await fetch(`/__dev/news?game=${encodeURIComponent(gameId)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`dev news bridge returned HTTP ${response.status}`);
    }
    const feed = (await response.json()) as NewsFeed;
    console.info(
      `[YAYL] dev news ${gameId}: ${feed.banners.length} banners, ${feed.sections.length} sections`
    );
    return feed;
  }
  return invoke<NewsFeed>("fetch_news", { game: gameId });
}

export async function gameVersion(gameId: GameId): Promise<GameVersion> {
  if (!IS_TAURI) {
    return {
      local: GAMES[gameId].version,
      latest: GAMES[gameId].latest,
      minimum: null,
    };
  }
  return invoke<GameVersion>("game_version", { game: gameId });
}

/* Open an https link in the system browser instead of navigating the webview. */
export async function openExternal(url: string): Promise<void> {
  if (!url) return;
  if (IS_TAURI) {
    await invoke("open_external", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/* Returns true when a real backend started the game. */
export async function launchGame(gameId: GameId): Promise<boolean> {
  if (!IS_TAURI) return false;
  await invoke("launch_game", { game: gameId });
  return true;
}

export async function onGameExit(
  handler: (event: GameExitEvent) => void
): Promise<() => void> {
  if (!IS_TAURI) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen<GameExitEvent>("game-exit", (event) => handler(event.payload));
}

export async function verifyGame(
  gameId: GameId,
  path: string
): Promise<VerifyReport | null> {
  if (!IS_TAURI) return null;
  return invoke<VerifyReport>("verify_game", { game: gameId, path });
}

export async function repairGame(
  gameId: GameId,
  path: string
): Promise<VerifyReport | null> {
  if (!IS_TAURI) return null;
  return invoke<VerifyReport>("repair_game", { game: gameId, path });
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
