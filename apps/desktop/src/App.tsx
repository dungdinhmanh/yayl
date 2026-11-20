import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  GAMES,
  HOME_STATES,
  SERVERS,
  SERVER_LIST,
  defaultServerId,
  serverOf,
  type GameId,
  type GameState,
} from "./data";
import { I18N } from "./i18n";
import Rail from "./components/Rail";
import Home from "./pages/Home";
import DevBar from "./components/DevBar";
import ConfirmDialog from "./components/ConfirmDialog";
import InstallDialog from "./components/InstallDialog";
import ServerDialog from "./components/ServerDialog";
import SocialLinks from "./components/SocialLinks";
import {
  backgroundCacheBytes,
  backgroundIsVideo,
  backgroundSrc,
  cancelDownload,
  defaultInstallRoot,
  defaultSettings,
  discardDownload,
  downloadStatus,
  fetchBackground,
  fetchNews,
  fetchPlaytime,
  fetchSocial,
  gameVersion,
  isTauri,
  launchGame,
  loadSettings,
  onDownloadProgress,
  onGameExit,
  openInstallFolder,
  repairGame,
  saveBackgroundCache,
  saveInstallRoot,
  startDownload,
  verifyGame,
  windowClose,
  windowMinimize,
  windowToggleMaximize,
  type BackgroundFit,
  type DownloadProgress,
  type DownloadSnapshot,
  type GameVersion,
  type NewsFeed,
  type PlaytimeEntry,
  type Settings,
  type SocialLink,
} from "./lib/ipc";

const SettingsPage = lazy(() => import("./pages/Settings"));

type View = "home" | "settings";

/* Tile is rendered as a repeating background div; video falls back to cover. */
function customObjectFit(fit: BackgroundFit): CSSProperties["objectFit"] {
  if (fit === "contain") return "contain";
  if (fit === "center") return "none";
  return "cover";
}

export type Lang = "vi" | "en";

const GAME_IDS = Object.keys(GAMES) as GameId[];
const PROFILE_IDS = SERVER_LIST.map((server) => server.id);
const QUERY = new URLSearchParams(window.location.search);

function queryGame(): GameId {
  const value = QUERY.get("game") as GameId | null;
  return value && GAME_IDS.includes(value) ? value : "arknights";
}

function queryServer(gameId: GameId): string {
  const value = QUERY.get("server");
  if (value && SERVERS[gameId].some((server) => server.id === value)) return value;
  return defaultServerId(gameId);
}

function queryState(): GameState | null {
  const value = QUERY.get("state") as GameState | null;
  return value && (HOME_STATES as readonly string[]).includes(value) ? value : null;
}

function queryLang(): Lang {
  return QUERY.get("lang") === "en" ? "en" : "vi";
}

type LiveDownload = {
  state: GameState;
  progress: number;
  bytesDone: number;
  bytesTotal: number;
  speed: number;
  filesDone: number;
  filesTotal: number;
  version: string;
  code?: string;
};

function percentOf(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

function stateFromSnapshot(snapshot: DownloadSnapshot): GameState {
  if (snapshot.installed || snapshot.state === "completed") return "ready";
  switch (snapshot.state) {
    case "paused":
      return "paused";
    case "failed":
      return "error";
    case "verifying":
      return snapshot.active ? "verifying" : "paused";
    case "running":
      return snapshot.active ? "downloading" : "paused";
    case "pending":
      return snapshot.bytesDone > 0 ? "paused" : "install";
  }
}

function liveFromSnapshot(snapshot: DownloadSnapshot): LiveDownload {
  return {
    state: stateFromSnapshot(snapshot),
    progress: percentOf(snapshot.bytesDone, snapshot.bytesTotal),
    bytesDone: snapshot.bytesDone,
    bytesTotal: snapshot.bytesTotal,
    speed: 0,
    filesDone: snapshot.filesDone,
    filesTotal: snapshot.filesTotal,
    version: snapshot.version,
  };
}

function stateFromPhase(phase: DownloadProgress["phase"]): GameState {
  switch (phase) {
    case "preparing":
    case "downloading":
    case "committing":
      return "downloading";
    case "verifying":
      return "verifying";
    case "done":
      return "ready";
    case "paused":
      return "paused";
    case "failed":
      return "error";
  }
}

function liveFromProgress(progress: DownloadProgress): LiveDownload {
  return {
    state: stateFromPhase(progress.phase),
    progress: percentOf(progress.downloaded, progress.downloadTotal),
    bytesDone: progress.downloaded,
    bytesTotal: progress.downloadTotal,
    speed: progress.bytesPerSec,
    filesDone: progress.filesDone,
    filesTotal: progress.filesTotal,
    version: "",
    code: progress.code,
  };
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}

function initialActiveServers(): Record<GameId, string> {
  const active = {} as Record<GameId, string>;
  for (const id of GAME_IDS) active[id] = queryServer(id);
  return active;
}

function initialRoots(): Record<string, string> {
  const roots: Record<string, string> = {};
  for (const server of SERVER_LIST) roots[server.id] = isTauri() ? "" : server.path;
  return roots;
}

/* EN is the bundled sample; JP/KR start uninstalled so the install state is
   visible while reviewing the server switch. */
function initialStateMap(): Record<string, GameState> {
  const initial: Record<string, GameState> = {};
  for (const server of SERVER_LIST) {
    initial[server.id] = isTauri() ? "install" : server.region === "EN" ? "ready" : "install";
  }
  const fromQuery = queryState();
  if (fromQuery) initial[queryServer(queryGame())] = fromQuery;
  return initial;
}

function BootMark() {
  return (
    <span className="boot-mark">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8.4 5.2a1 1 0 0 1 1.52-.86l9.1 6.8a1 1 0 0 1 0 1.72l-9.1 6.8A1 1 0 0 1 8.4 18.8V5.2Z" />
      </svg>
    </span>
  );
}

export default function App() {
  const [gameId, setGameId] = useState<GameId>(queryGame);
  const [activeServers, setActiveServers] = useState<Record<GameId, string>>(initialActiveServers);
  const [serverId, setServerId] = useState<string>(() => queryServer(queryGame()));
  const [states, setStates] = useState<Record<string, GameState>>(initialStateMap);
  const [roots, setRoots] = useState<Record<string, string>>(initialRoots);
  const [live, setLive] = useState<Partial<Record<string, LiveDownload>>>({});
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [lang, setLang] = useState<Lang>(queryLang);
  const [installOpen, setInstallOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [playtimes, setPlaytimes] = useState<Partial<Record<string, PlaytimeEntry>>>({});
  const [news, setNews] = useState<Partial<Record<string, NewsFeed | null>>>({});
  const [social, setSocial] = useState<Partial<Record<string, SocialLink[]>>>({});
  const [backgrounds, setBackgrounds] = useState<Partial<Record<string, string | null>>>({});
  const [customSrc, setCustomSrc] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const customSource = settings.backgroundSource ?? settings.backgroundPath;
  const customFallback = customSource !== null && failedSource === customSource;
  const customActive = customFallback ? settings.backgroundPath : customSource;
  const custom = settings.background === "custom" && customSrc !== null;
  const [versions, setVersions] = useState<Partial<Record<string, GameVersion>>>({});
  const [booted, setBooted] = useState(() => !isTauri());

  const state = states[serverId] ?? "install";

  const setState = (next: GameState) => {
    setStates((current) => ({ ...current, [serverId]: next }));
  };

  // Load settings before the first paint; download state can arrive later.
  useEffect(() => {
    let active = true;

    void (async () => {
      let loaded: Settings;
      try {
        loaded = await loadSettings();
      } catch (error) {
        console.error("[YAYL] cannot load settings", error);
        loaded = defaultSettings();
      }
      if (!active) return;

      setSettings(loaded);
      if (loaded.language === "vi" || loaded.language === "en") {
        setLang(loaded.language);
      }
      setBooted(true);

      if (!isTauri()) {
        const nextRoots: Record<string, string> = {};
        for (const profile of SERVER_LIST) {
          nextRoots[profile.id] = loaded.installRoots[profile.id] || profile.path;
        }
        setRoots(nextRoots);
        return;
      }

      const nextRoots: Record<string, string> = {};
      const nextStates: Partial<Record<string, GameState>> = {};
      const nextLive: Partial<Record<string, LiveDownload>> = {};
      const nextVersions: Partial<Record<string, GameVersion>> = {};

      await Promise.all(
        PROFILE_IDS.map(async (id) => {
          try {
            const root = loaded.installRoots[id] || (await defaultInstallRoot(id));
            nextRoots[id] = root;
            const snapshot = await downloadStatus(id, root);
            if (!snapshot) return;
            const view = liveFromSnapshot(snapshot);
            nextLive[id] = view;
            let nextState = view.state;
            if (nextState === "ready") {
              try {
                const info = await gameVersion(id);
                nextVersions[id] = info;
                if (info.updateAvailable) nextState = "update";
              } catch (error) {
                console.error(`[YAYL] cannot check ${id} version`, error);
              }
            }
            nextStates[id] = nextState;
          } catch (error) {
            // Do not invent a folder when the backend cannot resolve one.
            nextRoots[id] = "";
            console.error(`[YAYL] cannot load ${id} status`, error);
          }
        })
      );

      const nextPlaytimes: Partial<Record<string, PlaytimeEntry>> = {};
      await Promise.all(
        PROFILE_IDS.map(async (id) => {
          try {
            const entry = await fetchPlaytime(id);
            if (entry) nextPlaytimes[id] = entry;
          } catch (error) {
            console.error(`[YAYL] cannot load ${id} playtime`, error);
          }
        })
      );

      if (!active) return;
      setRoots(nextRoots);
      setPlaytimes(nextPlaytimes);
      setLive((current) => ({ ...current, ...nextLive }));
      setVersions(nextVersions);
      setStates((current) => {
        const merged: Record<string, GameState> = {
          ...current,
          ...(nextStates as Record<string, GameState>),
        };
        const forced = queryState();
        if (forced) merged[queryServer(queryGame())] = forced;
        return merged;
      });
    })().catch((error: unknown) => {
      console.error("[YAYL] bootstrap failed", error);
      if (active) setBooted(true);
    });

    return () => {
      active = false;
    };
  }, []);

  // Progress events are the only live download state; the backend caps them at 4 Hz.
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void onDownloadProgress((progress) => {
      const id = progress.game;
      if (!PROFILE_IDS.includes(id)) return;

      const view = liveFromProgress(progress);
      setLive((current) => ({ ...current, [id]: view }));
      setStates((current) => ({ ...current, [id]: view.state }));
      setErrors((current) => {
        if (progress.phase === "failed" && progress.code) {
          return { ...current, [id]: progress.code };
        }
        const next = { ...current };
        delete next[id];
        return next;
      });

      if (progress.phase === "done") {
        void gameVersion(id)
          .then((info) => {
            setVersions((current) => ({ ...current, [id]: info }));
            setStates((current) =>
              current[id] === "ready" && info.updateAvailable
                ? { ...current, [id]: "update" }
                : current
            );
          })
          .catch((error: unknown) => {
            console.error(`[YAYL] cannot check ${id} version`, error);
          });
      }
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  // The backend reports the finished session after the game process exits.
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void onGameExit((event) => {
      const id = event.game;
      if (!PROFILE_IDS.includes(id)) return;
      setPlaytimes((current) => ({
        ...current,
        [id]: { seconds: event.totalSeconds, lastPlayed: event.lastPlayed },
      }));
      setStates((current) => ({ ...current, [id]: "ready" }));
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  // News is fetched per server profile and cached; the lab uses the Vite bridge.
  useEffect(() => {
    if (!booted || news[serverId] !== undefined) return;
    let active = true;
    void fetchNews(serverId)
      .then((feed) => {
        if (active) setNews((current) => ({ ...current, [serverId]: feed }));
      })
      .catch((error: unknown) => {
        console.error(`[YAYL] cannot load ${serverId} news`, error);
        if (active) setNews((current) => ({ ...current, [serverId]: null }));
      });
    return () => {
      active = false;
    };
  }, [serverId, booted, news]);

  // Social channels are cached; a failure hides the cluster.
  useEffect(() => {
    if (!booted || social[serverId] !== undefined) return;
    let active = true;
    void fetchSocial(serverId)
      .then((links) => {
        if (active) setSocial((current) => ({ ...current, [serverId]: links }));
      })
      .catch((error: unknown) => {
        console.error(`[YAYL] cannot load ${serverId} social links`, error);
        if (active) setSocial((current) => ({ ...current, [serverId]: [] }));
      });
    return () => {
      active = false;
    };
  }, [serverId, booted, social]);

  // Background art is verified and cached; `null` keeps the bundled image.
  useEffect(() => {
    if (!booted || backgrounds[serverId] !== undefined) return;
    let active = true;
    void fetchBackground(serverId)
      .then((source) => {
        if (active) setBackgrounds((current) => ({ ...current, [serverId]: source }));
      })
      .catch((error: unknown) => {
        console.error(`[YAYL] cannot load ${serverId} background`, error);
        if (active) setBackgrounds((current) => ({ ...current, [serverId]: null }));
      });
    return () => {
      active = false;
    };
  }, [serverId, booted, backgrounds]);

  // A cached feed paints offline; when the network returns, fetch again.
  useEffect(() => {
    const refresh = () => {
      setNews((current) => ({ ...current, [serverId]: undefined }));
      setSocial((current) => ({ ...current, [serverId]: undefined }));
      setBackgrounds((current) => ({ ...current, [serverId]: undefined }));
    };
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [serverId]);

  // Custom media uses the picked file first; the cache copy is the fallback.
  const customFailed = () => {
    setCustomSrc(null);
    if (settings.backgroundPath && settings.backgroundPath !== customActive) {
      setFailedSource(customSource);
    }
  };

  useEffect(() => {
    if (!customActive) {
      setCustomSrc(null);
      return;
    }
    let active = true;
    void backgroundSrc(customActive)
      .then((src) => {
        if (!active) return;
        if (backgroundIsVideo(customActive)) {
          setCustomSrc(src);
          return;
        }
        // Probe images so a missing source falls back before it paints.
        const probe = new Image();
        probe.onload = () => {
          if (active) setCustomSrc(src);
        };
        probe.onerror = () => {
          if (active) customFailed();
        };
        probe.src = src;
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot load custom background", error);
        if (active) customFailed();
      });
    return () => {
      active = false;
    };
  }, [customActive, customFallback, customSource, settings.backgroundPath]);

  // Layout effect so the root attributes are in place before paint.
  useLayoutEffect(() => {
    document.body.dataset.game = gameId;
    document.body.dataset.state = state;
    document.body.dataset.layout = "rail";
    document.body.dataset.page = view === "settings" ? "settings" : "home";
    document.body.dataset.background = settings.background;
    document.documentElement.lang = lang;
    document.documentElement.dataset.motion = settings.reducedMotion ? "off" : "on";
  }, [gameId, state, lang, view, settings.background, settings.reducedMotion]);

  const t = useMemo(() => {
    const dict = I18N[lang] ?? I18N.vi;
    return (key: string, vars?: Record<string, string | number>) => {
      let value = dict[key] ?? I18N.vi[key] ?? key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.split(`{${name}}`).join(String(replacement));
        }
      }
      return value;
    };
  }, [lang]);

  const applySettings = (next: Settings) => {
    setSettings(next);
    if (next.language === "vi" || next.language === "en") setLang(next.language);
    setRoots((current) => {
      let merged = current;
      for (const profile of SERVER_LIST) {
        const path = next.installRoots[profile.id];
        if (!path || path === current[profile.id]) continue;
        if (merged === current) merged = { ...current };
        merged[profile.id] = path;
      }
      return merged;
    });
  };

  /* The fallback copy is a downscaled JPEG. Rebuild it when it is missing
     (this also replaces the full-size copies older builds wrote), using the
     file the window is already showing. Lab runs skip the whole path. */
  const sourceRef = useRef<string | null>(null);
  sourceRef.current = settings.backgroundSource;
  const cacheBuilt = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauri() || settings.background !== "custom") return;
    const source = settings.backgroundSource;
    if (!source || cacheBuilt.current === source) return;
    cacheBuilt.current = source;
    void (async () => {
      const cached = await backgroundCacheBytes();
      // Mirrors `background::MAX_LIGHT_BYTES`; anything bigger is a legacy copy.
      if (cached > 0 && cached <= 4 * 1024 * 1024) return;
      const { renderLightBackdrop } = await import("./lib/backdrop");
      const bytes = await renderLightBackdrop(source, backgroundIsVideo(source));
      if (!bytes || sourceRef.current !== source) return;
      const next = await saveBackgroundCache(bytes);
      if (sourceRef.current === source) applySettings(next);
    })().catch((error: unknown) => {
      console.error("[YAYL] cannot store the backdrop cache", error);
    });
  }, [settings.background, settings.backgroundSource]);

  const rememberRoot = (id: string, path: string) => {
    setRoots((current) => ({ ...current, [id]: path }));
    setSettings((current) => ({
      ...current,
      installRoots: { ...current.installRoots, [id]: path },
    }));
  };

  const selectGame = (id: GameId) => {
    setGameId(id);
    setServerId(activeServers[id]);
    setView("home");
  };

  const switchServer = (id: string) => {
    const target = serverOf(id);
    if (!target) return;
    setActiveServers((current) => ({ ...current, [target.gameId]: id }));
    setServerId(id);
    setGameId(target.gameId);
    setServerOpen(false);
  };

  const locate = () => {
    void openInstallFolder(serverId, roots[serverId]).catch((error: unknown) => {
      console.error("[YAYL] cannot open install folder", error);
    });
  };

  const play = () => {
    if (!isTauri()) {
      // The lab has no game process; show the running state for a moment.
      setState("running");
      window.setTimeout(() => setState("ready"), 4000);
      return;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next[serverId];
      return next;
    });
    void launchGame(serverId)
      .then((started) => {
        if (started) setState("running");
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot launch game", error);
        setErrors((current) => ({ ...current, [serverId]: errorCode(error) }));
      });
  };

  const check = (repair: boolean) => {
    const id = serverId;
    setState("verifying");
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    const action = repair ? repairGame : verifyGame;
    void action(id, roots[id])
      .then((report) => {
        if (!report) {
          // The lab has no verifier.
          window.setTimeout(() => setStates((current) => ({ ...current, [id]: "ready" })), 1200);
          return;
        }
        if (report.issues.length > 0) {
          setErrors((current) => ({ ...current, [id]: "checksum" }));
          setStates((current) => ({ ...current, [id]: "error" }));
        } else {
          setStates((current) => ({ ...current, [id]: "ready" }));
        }
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot check install", error);
        setErrors((current) => ({ ...current, [id]: errorCode(error) }));
        setStates((current) => ({ ...current, [id]: "error" }));
      });
  };

  const retry = () => {
    // Offline retries the network; "play anyway" launches the installed build.
    if (state === "offline") check(false);
    else play();
  };

  const confirmInstall = async (path: string) => {
    setInstallOpen(false);
    rememberRoot(serverId, path);
    setErrors((current) => {
      const next = { ...current };
      delete next[serverId];
      return next;
    });
    setState("downloading");

    try {
      await saveInstallRoot(serverId, path);
      await startDownload(serverId, path);
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [serverId]: errorCode(error) }));
    }
  };

  const discard = async () => {
    setCancelOpen(false);
    try {
      await discardDownload(serverId, roots[serverId]);
      setLive((current) => {
        const next = { ...current };
        delete next[serverId];
        return next;
      });
      setErrors((current) => {
        const next = { ...current };
        delete next[serverId];
        return next;
      });
      setState("install");
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [serverId]: errorCode(error) }));
    }
  };

  const pause = async () => {
    // Discarding resume state is destructive, so ask before doing it.
    if (state === "paused") {
      setCancelOpen(true);
      return;
    }

    setState("paused");
    try {
      await cancelDownload(serverId);
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [serverId]: errorCode(error) }));
    }
  };

  const resume = async () => {
    setState("downloading");
    try {
      await startDownload(serverId, roots[serverId]);
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [serverId]: errorCode(error) }));
    }
  };

  const artSrc = backgrounds[serverId] || `/art/${gameId}.png`;

  return (
    <div
      className="app"
      style={
        {
          "--bg-blur": custom ? `${settings.backgroundBlur}px` : "0px",
          "--bg-noise": custom ? String(settings.backgroundNoise / 100) : "0",
        } as CSSProperties
      }
    >
      <div className="backdrop">
        {settings.background === "custom" && customSrc ? (
          <div
            className="backdrop-custom"
            style={{ "--bg-opacity": String(settings.backgroundOpacity / 100) } as CSSProperties}
          >
            {backgroundIsVideo(customActive ?? "") ? (
              <video
                className="backdrop-art backdrop-media"
                key={customSrc}
                src={customSrc}
                autoPlay
                muted={settings.backgroundMuted}
                loop={settings.backgroundLoop}
                playsInline
                style={{
                  objectFit: customObjectFit(settings.backgroundFit),
                  objectPosition: "center",
                }}
                onError={customFailed}
              />
            ) : settings.backgroundFit === "tile" ? (
              <div
                className="backdrop-art backdrop-media backdrop-tile"
                key={customSrc}
                style={{ backgroundImage: `url("${customSrc}")` }}
              />
            ) : (
              <img
                className="backdrop-art backdrop-media"
                key={customSrc}
                src={customSrc}
                alt=""
                style={{
                  objectFit: customObjectFit(settings.backgroundFit),
                  objectPosition: "center",
                }}
                onError={customFailed}
              />
            )}
          </div>
        ) : (
          <>
            <div
              className="backdrop-blur"
              aria-hidden="true"
              style={{ backgroundImage: `url("${artSrc}")` }}
            />
            <img
              className="backdrop-art"
              data-active-art
              key={`${serverId}:${backgrounds[serverId] ?? "art"}`}
              src={artSrc}
              alt=""
              onError={(event) => {
                if (backgrounds[serverId]) {
                  // A verified cache file can still disappear; fall back once.
                  setBackgrounds((current) => ({ ...current, [serverId]: null }));
                  return;
                }
                event.currentTarget.classList.add("is-missing");
              }}
            />
          </>
        )}
        <div className="backdrop-scrim" />
        <div className="backdrop-grain" />
      </div>

      <header
        className="titlebar"
        data-tauri-drag-region
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) void windowToggleMaximize();
        }}
      >
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark" data-tauri-drag-region>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8.4 5.2a1 1 0 0 1 1.52-.86l9.1 6.8a1 1 0 0 1 0 1.72l-9.1 6.8A1 1 0 0 1 8.4 18.8V5.2Z" />
            </svg>
          </span>
          <div className="brand-name" data-tauri-drag-region>
            YAYL
          </div>
        </div>
        <div className="window-controls">
          <button className="win-btn" type="button" aria-label={t("window.minimize")} onClick={() => void windowMinimize()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <button className="win-btn" type="button" aria-label={t("window.maximize")} onClick={() => void windowToggleMaximize()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          </button>
          <button className="win-btn is-close" type="button" aria-label={t("window.close")} onClick={() => void windowClose()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>

      {view === "home" && (
        <SocialLinks links={social[serverId] ?? []} t={t} />
      )}

      {!booted ? (
        <div className="boot-screen" aria-busy="true">
          <BootMark />
        </div>
      ) : (
        <div className="shell">
          <Rail
            gameId={gameId}
            view={view}
            activeServers={activeServers}
            states={states}
            progress={Object.fromEntries(
              PROFILE_IDS.map((id) => [id, live[id]?.progress ?? 0])
            )}
            t={t}
            onSelect={selectGame}
            onNavigate={setView}
          />
          <main className="main">
            <div className="main-scroll">
              {view === "settings" ? (
                <Suspense
                  fallback={
                    <div className="boot-screen" aria-busy="true">
                      <BootMark />
                    </div>
                  }
                >
                  <SettingsPage
                    serverId={serverId}
                    gameId={gameId}
                    settings={settings}
                    roots={roots}
                    states={states}
                    t={t}
                    backgroundFallback={customFallback}
                    onSettings={applySettings}
                    onLang={setLang}
                    onRoot={rememberRoot}
                  />
                </Suspense>
              ) : (
                <Home
                  gameId={gameId}
                  serverId={serverId}
                  state={state}
                  lang={lang}
                  t={t}
                  installRoot={roots[serverId]}
                  progress={live[serverId]?.progress ?? null}
                  download={
                    live[serverId]
                      ? {
                          speed: live[serverId].speed,
                          done: live[serverId].bytesDone,
                          total: live[serverId].bytesTotal,
                        }
                      : null
                  }
                  errorCode={errors[serverId] ?? null}
                  playtime={playtimes[serverId]}
                  news={news[serverId]}
                  updateRequired={versions[serverId]?.updateRequired ?? false}
                  onInstall={() => setInstallOpen(true)}
                  onLocate={locate}
                  onResume={() => void resume()}
                  onPause={() => void pause()}
                  onMinimize={() => void windowMinimize()}
                  onPlay={play}
                  onVerify={() => check(false)}
                  onRepair={() => check(true)}
                  onRetry={retry}
                  onSettings={() => setView("settings")}
                  onSwitchServer={() => setServerOpen(true)}
                />
              )}
            </div>
          </main>
        </div>
      )}

      {(import.meta.env.DEV || !isTauri()) && (
        <DevBar
          gameId={gameId}
          state={state}
          lang={lang}
          onGame={selectGame}
          onState={setState}
          onLang={setLang}
        />
      )}

      {installOpen && (
        <InstallDialog
          profileId={serverId}
          game={GAMES[gameId]}
          initialPath={roots[serverId]}
          t={t}
          onClose={() => setInstallOpen(false)}
          onConfirm={(path) => void confirmInstall(path)}
        />
      )}

      {serverOpen && (
        <ServerDialog
          gameId={gameId}
          currentId={serverId}
          states={states}
          t={t}
          onSelect={switchServer}
          onClose={() => setServerOpen(false)}
        />
      )}

      {cancelOpen && (
        <ConfirmDialog
          title={t("home.cancel.title")}
          body={t("home.cancel.body")}
          detail={roots[serverId]}
          confirmLabel={t("home.cancel.confirm")}
          cancelLabel={t("common.back")}
          danger
          onConfirm={() => void discard()}
          onCancel={() => setCancelOpen(false)}
        />
      )}
    </div>
  );
}
