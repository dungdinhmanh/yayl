import { useLayoutEffect, useMemo, useState } from "react";
import { GAMES, HOME_STATES, type GameState } from "./data";
import { I18N } from "./i18n";
import Rail from "./components/Rail";
import Home from "./pages/Home";
import DevBar from "./components/DevBar";

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

export default function App() {
  const [gameId, setGameId] = useState<GameId>(queryGame);
  const [states, setStates] = useState<Record<GameId, GameState>>(() => {
    const initial = {} as Record<GameId, GameState>;
    for (const id of GAME_IDS) initial[id] = "ready";
    const fromQuery = queryState();
    if (fromQuery) initial[queryGame()] = fromQuery;
    return initial;
  });
  const [lang, setLang] = useState<Lang>(queryLang);

  const state = states[gameId];

  const setState = (next: GameState) => {
    setStates((current) => ({ ...current, [gameId]: next }));
  };

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

      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8.4 5.2a1 1 0 0 1 1.52-.86l9.1 6.8a1 1 0 0 1 0 1.72l-9.1 6.8A1 1 0 0 1 8.4 18.8V5.2Z" />
            </svg>
          </span>
          <div className="brand-name">YAYL</div>
        </div>
        <div className="window-controls">
          <button className="win-btn" type="button" aria-label="Minimize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <button className="win-btn" type="button" aria-label="Maximize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
          </button>
          <button className="win-btn is-close" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>

      <div className="shell">
        <Rail gameId={gameId} states={states} t={t} onSelect={setGameId} />
        <main className="main">
          <div className="main-scroll">
            <Home gameId={gameId} state={state} lang={lang} t={t} />
          </div>
        </main>
      </div>

      <DevBar
        gameId={gameId}
        state={state}
        lang={lang}
        onGame={setGameId}
        onState={setState}
        onLang={setLang}
      />
    </div>
  );
}
