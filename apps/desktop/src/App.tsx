import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { GAMES, HOME_STATES, type GameState } from "./data";
import { I18N } from "./i18n";
import Rail from "./components/Rail";
import Home from "./pages/Home";
import DevBar from "./components/DevBar";
import ConfirmDialog from "./components/ConfirmDialog";
import InstallDialog from "./components/InstallDialog";
import {
  cancelDownload,
  defaultInstallRoot,
  defaultSettings,
  discardDownload,
  downloadStatus,
  fetchNews,
  fetchPlaytime,
  isTauri,
  launchGame,
  loadSettings,
  onDownloadProgress,
  onGameExit,
  openInstallFolder,
  repairGame,
  saveInstallRoot,
  startDownload,
  verifyGame,
  windowClose,
  windowMinimize,
  windowToggleMaximize,
  type DownloadProgress,
  type DownloadSnapshot,
  type NewsFeed,
  type PlaytimeEntry,
  type Settings,
} from "./lib/ipc";

const SettingsPage = lazy(() => import("./pages/Settings"));
const FirstRunPage = lazy(() => import("./pages/FirstRun"));

type View = "home" | "settings";

export type GameId = keyof typeof GAMES;
export type Lang = "vi" | "en";

const GAME_IDS = Object.keys(GAMES) as GameId[];
const QUERY = new URLSearchParams(window.location.search);

function queryGame(): GameId {
  const value = QUERY.get("game") as GameId | null;
  return value && GAME_IDS.includes(value) ? value : "arknights";
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

function initialRoots(): Record<GameId, string> {
  const roots = {} as Record<GameId, string>;
  for (const id of GAME_IDS) roots[id] = isTauri() ? "" : GAMES[id].path;
  return roots;
}

function initialStateMap(): Record<GameId, GameState> {
  const initial = {} as Record<GameId, GameState>;
  const fallback: GameState = isTauri() ? "install" : "ready";
  for (const id of GAME_IDS) initial[id] = fallback;
  const fromQuery = queryState();
  if (fromQuery) initial[queryGame()] = fromQuery;
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
  const [states, setStates] = useState<Record<GameId, GameState>>(initialStateMap);
  const [roots, setRoots] = useState<Record<GameId, string>>(initialRoots);
  const [live, setLive] = useState<Partial<Record<GameId, LiveDownload>>>({});
  const [errors, setErrors] = useState<Partial<Record<GameId, string>>>({});
  const [lang, setLang] = useState<Lang>(queryLang);
  const [installOpen, setInstallOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [playtimes, setPlaytimes] = useState<Partial<Record<GameId, PlaytimeEntry>>>({});
  const [news, setNews] = useState<Partial<Record<GameId, NewsFeed | null>>>({});
  const [booted, setBooted] = useState(() => !isTauri());
  const [onboarding, setOnboarding] = useState(
    () => !isTauri() && QUERY.get("onboarding") === "1"
  );

  const state = states[gameId];

  const setState = (next: GameState) => {
    setStates((current) => ({ ...current, [gameId]: next }));
  };

  // Settings load first: language and onboarding must be correct before the
  // first paint. Download state can arrive afterwards.
  useEffect(() => {
    let active = true;

    void (async () => {
      let loaded: Settings;
      try {
        loaded = await loadSettings();
      } catch (error) {
        console.error("[YAYL] cannot load settings", error);
        loaded = defaultSettings();
        if (!isTauri()) loaded.onboardingComplete = true;
      }
      if (!active) return;

      setSettings(loaded);
      if (loaded.language === "vi" || loaded.language === "en") {
        setLang(loaded.language);
      }
      // The lab can replay onboarding with ?onboarding=1.
      const forcedOnboarding = !isTauri() && QUERY.get("onboarding") === "1";
      setOnboarding(forcedOnboarding || !loaded.onboardingComplete);
      setBooted(true);

      if (!isTauri()) {
        const nextRoots = {} as Record<GameId, string>;
        for (const id of GAME_IDS) {
          nextRoots[id] = loaded.installRoots[id] || GAMES[id].path;
        }
        setRoots(nextRoots);
        return;
      }

      const nextRoots = {} as Record<GameId, string>;
      const nextStates: Partial<Record<GameId, GameState>> = {};
      const nextLive: Partial<Record<GameId, LiveDownload>> = {};

      await Promise.all(
        GAME_IDS.map(async (id) => {
          try {
            const root = loaded.installRoots[id] || (await defaultInstallRoot(id));
            nextRoots[id] = root;
            const snapshot = await downloadStatus(id, root);
            if (!snapshot) return;
            const view = liveFromSnapshot(snapshot);
            nextLive[id] = view;
            nextStates[id] = view.state;
          } catch (error) {
            // Do not invent a folder when the backend cannot resolve one.
            nextRoots[id] = "";
            console.error(`[YAYL] cannot load ${id} status`, error);
          }
        })
      );

      const nextPlaytimes: Partial<Record<GameId, PlaytimeEntry>> = {};
      await Promise.all(
        GAME_IDS.map(async (id) => {
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
      setStates((current) => {
        const merged = { ...current, ...nextStates };
        const forced = queryState();
        if (forced) merged[queryGame()] = forced;
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

  // Progress events are the only source of live download state. The backend
  // throttles them to 4 Hz.
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void onDownloadProgress((progress) => {
      const id = progress.game as GameId;
      if (!GAME_IDS.includes(id)) return;

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
      const id = event.game as GameId;
      if (!GAME_IDS.includes(id)) return;
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

  // News is fetched per game and cached for the session. In the browser lab the
  // Vite dev bridge returns real API data; if it fails the widget falls back to
  // the static feed.
  useEffect(() => {
    if (!booted || news[gameId] !== undefined) return;
    let active = true;
    void fetchNews(gameId)
      .then((feed) => {
        if (active) setNews((current) => ({ ...current, [gameId]: feed }));
      })
      .catch((error: unknown) => {
        console.error(`[YAYL] cannot load ${gameId} news`, error);
        if (active) setNews((current) => ({ ...current, [gameId]: null }));
      });
    return () => {
      active = false;
    };
  }, [gameId, booted, news]);

  // Layout effect so the root attributes are in place before paint.
  useLayoutEffect(() => {
    document.body.dataset.game = gameId;
    document.body.dataset.state = state;
    document.body.dataset.layout = onboarding ? "onboarding" : "rail";
    document.body.dataset.page = onboarding
      ? "first-run"
      : view === "settings"
        ? "settings"
        : "home";
    document.body.dataset.background = settings.background;
    document.documentElement.lang = lang;
    document.documentElement.dataset.motion = settings.reducedMotion ? "off" : "on";
  }, [gameId, state, lang, view, onboarding, settings.background, settings.reducedMotion]);

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
      for (const id of GAME_IDS) {
        const path = next.installRoots[id];
        if (!path || path === current[id]) continue;
        if (merged === current) merged = { ...current };
        merged[id] = path;
      }
      return merged;
    });
  };

  const rememberRoot = (id: GameId, path: string) => {
    setRoots((current) => ({ ...current, [id]: path }));
    setSettings((current) => ({
      ...current,
      installRoots: { ...current.installRoots, [id]: path },
    }));
  };

  const locate = () => {
    void openInstallFolder(gameId, roots[gameId]).catch((error: unknown) => {
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
      delete next[gameId];
      return next;
    });
    void launchGame(gameId)
      .then((started) => {
        if (started) setState("running");
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot launch game", error);
        setErrors((current) => ({ ...current, [gameId]: errorCode(error) }));
      });
  };

  const check = (repair: boolean) => {
    const id = gameId;
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
    // Offline is a network failure, so re-checking is the honest retry. An
    // update with "play anyway" just launches the installed build.
    if (state === "offline") check(false);
    else play();
  };

  const confirmInstall = async (path: string) => {
    setInstallOpen(false);
    rememberRoot(gameId, path);
    setErrors((current) => {
      const next = { ...current };
      delete next[gameId];
      return next;
    });
    setState("downloading");

    try {
      await saveInstallRoot(gameId, path);
      await startDownload(gameId, path);
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [gameId]: errorCode(error) }));
    }
  };

  const discard = async () => {
    setCancelOpen(false);
    try {
      await discardDownload(gameId, roots[gameId]);
      setLive((current) => {
        const next = { ...current };
        delete next[gameId];
        return next;
      });
      setErrors((current) => {
        const next = { ...current };
        delete next[gameId];
        return next;
      });
      setState("install");
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [gameId]: errorCode(error) }));
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
      await cancelDownload(gameId);
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [gameId]: errorCode(error) }));
    }
  };

  const resume = async () => {
    setState("downloading");
    try {
      await startDownload(gameId, roots[gameId]);
    } catch (error) {
      setState("error");
      setErrors((current) => ({ ...current, [gameId]: errorCode(error) }));
    }
  };

  return (
    <div className="app">
      <div className="backdrop">
        <img
          className="backdrop-art"
          data-active-art
          src={`/art/${gameId}.png`}
          alt=""
          onError={(event) => event.currentTarget.classList.add("is-missing")}
        />
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
          <div>
            <div className="brand-name" data-tauri-drag-region>
              YAYL
            </div>
            {(onboarding || view === "settings") && (
              <div className="brand-sub" data-tauri-drag-region>
                {t("app.launcher")}
              </div>
            )}
          </div>
        </div>
        {onboarding && (
          <div className="titlebar-center">
            <span className="titlebar-note">{t("firstRun.setup")}</span>
          </div>
        )}
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

      {!booted ? (
        <div className="boot-screen" aria-busy="true">
          <BootMark />
        </div>
      ) : onboarding ? (
        <Suspense
          fallback={
            <div className="boot-screen" aria-busy="true">
              <BootMark />
            </div>
          }
        >
          <FirstRunPage
            settings={settings}
            lang={lang}
            t={t}
            onLang={setLang}
            onSettings={applySettings}
            onDone={() => {
              setOnboarding(false);
              setView("home");
            }}
          />
        </Suspense>
      ) : (
        <div className="shell">
          <Rail
            gameId={gameId}
            view={view}
            states={states}
            progress={
              Object.fromEntries(
                GAME_IDS.map((id) => [id, live[id]?.progress ?? 0])
              ) as Record<GameId, number>
            }
            t={t}
            onSelect={(id) => {
              setGameId(id);
              setView("home");
            }}
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
                    gameId={gameId}
                    settings={settings}
                    roots={roots}
                    states={states}
                    t={t}
                    onSettings={applySettings}
                    onLang={setLang}
                    onRoot={rememberRoot}
                  />
                </Suspense>
              ) : (
                <Home
                  gameId={gameId}
                  state={state}
                  lang={lang}
                  t={t}
                  installRoot={roots[gameId]}
                  progress={live[gameId]?.progress ?? null}
                  errorCode={errors[gameId] ?? null}
                  playtime={playtimes[gameId]}
                  news={news[gameId]}
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
                />
              )}
            </div>
          </main>
        </div>
      )}

      {!onboarding && (import.meta.env.DEV || !isTauri()) && (
        <DevBar
          gameId={gameId}
          state={state}
          lang={lang}
          onGame={setGameId}
          onState={setState}
          onLang={setLang}
        />
      )}

      {installOpen && (
        <InstallDialog
          gameId={gameId}
          game={GAMES[gameId]}
          initialPath={roots[gameId]}
          t={t}
          onClose={() => setInstallOpen(false)}
          onConfirm={(path) => void confirmInstall(path)}
        />
      )}

      {cancelOpen && (
        <ConfirmDialog
          title={t("home.cancel.title")}
          body={t("home.cancel.body")}
          detail={roots[gameId]}
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
