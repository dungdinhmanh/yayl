import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { GAMES, HOME_STATES, type GameState } from "./data";
import { I18N } from "./i18n";
import Rail from "./components/Rail";
import Home from "./pages/Home";
import DevBar from "./components/DevBar";
import InstallDialog from "./components/InstallDialog";
import {
  cancelDownload,
  defaultInstallRoot,
  discardDownload,
  downloadStatus,
  isTauri,
  loadSettings,
  onDownloadProgress,
  openInstallFolder,
  saveInstallRoot,
  startDownload,
  windowClose,
  windowMinimize,
  windowToggleMaximize,
  type DownloadProgress,
  type DownloadSnapshot,
  type Settings,
} from "./lib/ipc";

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
  for (const id of GAME_IDS) roots[id] = GAMES[id].path;
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

export default function App() {
  const [gameId, setGameId] = useState<GameId>(queryGame);
  const [states, setStates] = useState<Record<GameId, GameState>>(initialStateMap);
  const [roots, setRoots] = useState<Record<GameId, string>>(initialRoots);
  const [live, setLive] = useState<Partial<Record<GameId, LiveDownload>>>({});
  const [errors, setErrors] = useState<Partial<Record<GameId, string>>>({});
  const [lang, setLang] = useState<Lang>(queryLang);
  const [installOpen, setInstallOpen] = useState(false);

  const state = states[gameId];

  const setState = (next: GameState) => {
    setStates((current) => ({ ...current, [gameId]: next }));
  };

  // Restore saved install folders and any paused download before the first
  // paint of a live state.
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;

    void (async () => {
      const settings = await loadSettings().catch((error: unknown): Settings => {
        console.error("[YAYL] cannot load settings", error);
        return { installRoots: {}, language: null };
      });
      const nextRoots = {} as Record<GameId, string>;
      const nextStates: Partial<Record<GameId, GameState>> = {};
      const nextLive: Partial<Record<GameId, LiveDownload>> = {};

      await Promise.all(
        GAME_IDS.map(async (id) => {
          try {
            const root = settings.installRoots[id] || (await defaultInstallRoot(id));
            nextRoots[id] = root;
            const snapshot = await downloadStatus(id, root);
            if (!snapshot) return;
            const view = liveFromSnapshot(snapshot);
            nextLive[id] = view;
            nextStates[id] = view.state;
          } catch (error) {
            nextRoots[id] = GAMES[id].path;
            console.error(`[YAYL] cannot load ${id} status`, error);
          }
        })
      );

      if (!active) return;
      setRoots(nextRoots);
      setLive((current) => ({ ...current, ...nextLive }));
      setStates((current) => {
        const merged = { ...current, ...nextStates };
        const forced = queryState();
        if (forced) merged[queryGame()] = forced;
        return merged;
      });
    })().catch((error: unknown) => {
      console.error("[YAYL] bootstrap failed", error);
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

  // Layout effect so the root attributes are in place before paint.
  useLayoutEffect(() => {
    document.body.dataset.game = gameId;
    document.body.dataset.state = state;
    document.body.dataset.layout = "rail";
    document.documentElement.lang = lang;
  }, [gameId, state, lang]);

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

  const locate = () => {
    void openInstallFolder(gameId, roots[gameId]).catch((error: unknown) => {
      console.error("[YAYL] cannot open install folder", error);
    });
  };

  const confirmInstall = async (path: string) => {
    setInstallOpen(false);
    setRoots((current) => ({ ...current, [gameId]: path }));
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

  const pause = async () => {
    if (state === "paused") {
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
          <div className="brand-name" data-tauri-drag-region>
            YAYL
          </div>
        </div>
        <div className="window-controls">
          <button className="win-btn" type="button" aria-label="Minimize" onClick={() => void windowMinimize()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <button className="win-btn" type="button" aria-label="Maximize" onClick={() => void windowToggleMaximize()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          </button>
          <button className="win-btn is-close" type="button" aria-label="Close" onClick={() => void windowClose()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>

      <div className="shell">
        <Rail gameId={gameId} states={states} t={t} onSelect={setGameId} />
        <main className="main">
          <div className="main-scroll">
            <Home
              gameId={gameId}
              state={state}
              lang={lang}
              t={t}
              installRoot={roots[gameId]}
              progress={live[gameId]?.progress ?? null}
              errorCode={errors[gameId] ?? null}
              onInstall={() => setInstallOpen(true)}
              onLocate={locate}
              onResume={() => void resume()}
              onPause={() => void pause()}
              onMinimize={() => void windowMinimize()}
            />
          </div>
        </main>
      </div>

      {(import.meta.env.DEV || !isTauri()) && (
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
    </div>
  );
}
