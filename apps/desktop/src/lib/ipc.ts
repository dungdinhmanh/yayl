/* Typed wrappers for the Tauri command layer; components never call `invoke`. */

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

export interface IoStats {
  read: number;
  write: number;
}

export type ProxyMode = "direct" | "system" | "manual";
export type DownloadOrder = "smallest_first" | "largest_first" | "manifest";
export type BackgroundMode = "art" | "custom" | "solid";
export type BackgroundFit = "cover" | "contain" | "center" | "tile";

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
  backgroundPath: string | null;
  backgroundSource: string | null;
  backgroundBlur: number;
  backgroundNoise: number;
  backgroundOpacity: number;
  backgroundFit: BackgroundFit;
  backgroundMuted: boolean;
  backgroundLoop: boolean;
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
  updateAvailable: boolean;
  updateRequired: boolean;
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
    backgroundPath: null,
    backgroundSource: null,
    backgroundBlur: 0,
    backgroundNoise: 0,
    backgroundOpacity: 100,
    backgroundFit: "cover",
    backgroundMuted: true,
    backgroundLoop: true,
    onboardingComplete: false,
    closeToTray: true,
  };
}

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/* In-memory settings for the web lab. */
let mockSettings: Settings = {
  ...defaultSettings(),
  onboardingComplete: true,
};

const GIB = 1024 ** 3;

/* Deterministic disk presets for the lab. */
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

/* Total download size, cached per game. */
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

/* Native picker in Tauri; cycles drives in the lab. */
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
  background: BackgroundMode,
  backgroundBlur: number,
  backgroundNoise: number,
  backgroundOpacity: number,
  backgroundFit: BackgroundFit,
  backgroundMuted: boolean,
  backgroundLoop: boolean
): Promise<Settings> {
  if (IS_TAURI) {
    return invoke<Settings>("save_appearance", {
      patch: {
        reducedMotion,
        background,
        backgroundBlur,
        backgroundNoise,
        backgroundOpacity,
        backgroundFit,
        backgroundMuted,
        backgroundLoop,
      },
    });
  }
  mockSettings = {
    ...mockSettings,
    reducedMotion,
    background,
    backgroundBlur,
    backgroundNoise,
    backgroundOpacity,
    backgroundFit,
    backgroundMuted,
    backgroundLoop,
  };
  return { ...mockSettings };
}

let mockBackground: { url: string; label: string; video: boolean } | null = null;

function pickBackgroundFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm";
    input.style.display = "none";
    document.body.appendChild(input);
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => done(null), { once: true });
    input.click();
  });
}

/* Copies the picked media into the app cache and selects custom mode. */
export async function chooseCustomBackground(): Promise<Settings | null> {
  if (IS_TAURI) return invoke<Settings | null>("choose_custom_background");

  const file = await pickBackgroundFile();
  if (!file) return null;
  if (mockBackground) URL.revokeObjectURL(mockBackground.url);
  const url = URL.createObjectURL(file);
  // The browser hides the real path, so show a source-shaped path for review.
  mockBackground = {
    url,
    label: `C:\\Users\\kazuki\\Pictures\\${file.name}`,
    video: file.type.startsWith("video/"),
  };
  mockSettings = { ...mockSettings, background: "custom", backgroundPath: url, backgroundSource: null };
  return { ...mockSettings };
}

export async function clearCustomBackground(): Promise<Settings> {
  if (IS_TAURI) return invoke<Settings>("clear_custom_background");

  if (mockBackground) {
    URL.revokeObjectURL(mockBackground.url);
    mockBackground = null;
  }
  mockSettings = {
    ...mockSettings,
    background: mockSettings.background === "custom" ? "art" : mockSettings.background,
    backgroundPath: null,
    backgroundSource: null,
  };
  return { ...mockSettings };
}

export async function backgroundSrc(path: string): Promise<string> {
  if (!IS_TAURI) return path;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}

export function backgroundIsVideo(path: string): boolean {
  if (path.startsWith("blob:")) return mockBackground?.video ?? false;
  return /\.(mp4|webm)(?:[?#].*)?$/i.test(path);
}

/* The mock stores a blob URL, so show the source path it stands for. */
export function backgroundDisplayPath(path: string): string {
  if (IS_TAURI || !path.startsWith("blob:")) return path;
  return mockBackground?.label ?? path;
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
    /* Dev-only bridge from vite.config.ts. */
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

export interface SocialLink {
  channel: string;
  url: string;
  qr: string;
}

/* Official social channels; URLs are validated by the core. */
export async function fetchSocial(gameId: GameId): Promise<SocialLink[]> {
  if (!IS_TAURI) {
    if (!import.meta.env.DEV) return [];
    const response = await fetch(`/__dev/social?game=${encodeURIComponent(gameId)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`dev social bridge returned HTTP ${response.status}`);
    }
    return (await response.json()) as SocialLink[];
  }
  return invoke<SocialLink[]>("fetch_social", { game: gameId });
}

/* Cached background art served through the asset protocol. */
export async function fetchBackground(gameId: GameId): Promise<string | null> {
  if (!IS_TAURI) {
    if (!import.meta.env.DEV) return null;
    const response = await fetch(`/__dev/background?game=${encodeURIComponent(gameId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { url?: string };
    return typeof data.url === "string" && data.url ? data.url : null;
  }
  const path = await invoke<string | null>("fetch_background", { game: gameId });
  if (!path) return null;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".");
  const b = right.split(".");
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = Number(a[i] ?? 0);
    const y = Number(b[i] ?? 0);
    const nx = Number.isFinite(x) ? x : 0;
    const ny = Number.isFinite(y) ? y : 0;
    if (nx !== ny) return nx < ny ? -1 : 1;
  }
  return 0;
}

export async function gameVersion(gameId: GameId): Promise<GameVersion> {
  if (!IS_TAURI) {
    const local = GAMES[gameId].version;
    const latest = GAMES[gameId].latest;
    return {
      local,
      latest,
      minimum: null,
      updateAvailable: compareVersions(local, latest) < 0,
      updateRequired: false,
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

/* True when a real backend accepted the download. */
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

/* Cumulative disk I/O of this process; the download monitor takes deltas. */
let mockIo: IoStats = { read: 0, write: 0 };
export async function ioStats(): Promise<IoStats> {
  if (!IS_TAURI) {
    /* Dev-only: keep the monitor moving without a backend. */
    mockIo = {
      read: mockIo.read + Math.random() * 900_000,
      write: mockIo.write + (9 + Math.random() * 4) * 1024 * 1024,
    };
    return mockIo;
  }
  return invoke<IoStats>("io_stats");
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
