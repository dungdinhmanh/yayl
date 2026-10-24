import { GAMES, STATE_META, type GameId, type GameState } from "../data";
import NewsWidget from "../components/NewsWidget";
import type { Lang } from "../App";

interface Props {
  gameId: GameId;
  state: GameState;
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const ICONS: Record<string, string> = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.4 5.2a1 1 0 0 1 1.52-.86l9.1 6.8a1 1 0 0 1 0 1.72l-9.1 6.8A1 1 0 0 1 8.4 18.8V5.2Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6.5a4.5 4.5 0 0 0-6 6L4 17l3 3 4.5-4.5a4.5 4.5 0 0 0 6-6l-3 3-3-3 3-3Z"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.2 2.8 17.3A1.7 1.7 0 0 0 4.3 20h15.4a1.7 1.7 0 0 0 1.5-2.7L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 16h.01"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.1"/><path d="M20 4v7h-7"/></svg>',
  gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 3.9 4.9l-1 4.1a2.4 2.4 0 0 1-4.2 1.2L14 16h-4l-1.7 2.2a2.4 2.4 0 0 1-4.2-1.2l-1-4.1A4 4 0 0 1 7 8Z"/><path d="M8 12h2M9 11v2"/></svg>',
  minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.4.45.74.85.92H21v4h-.08a1.7 1.7 0 0 0-1.52 1.08Z"/></svg>'
};

function icon(name: string) {
  return <span dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }} />;
}

function subText(game: (typeof GAMES)[GameId], state: GameState, t: Props["t"]) {
  if (state === "install") return `${game.size} · ${t("home.meta.required")}`;
  if (state === "update") return `${t("home.current")} ${game.version} → ${game.latest}`;
  if (state === "downloading") return `12.4 MB/s · ${t("download.eta")} 08:12`;
  if (state === "paused") return t("download.etaPaused");
  if (state === "verifying") return t("download.etaVerifying");
  if (state === "error") return t("home.error.code");
  if (state === "offline") return t("common.offline");
  if (state === "running") return t("common.running");
  return t("common.ready");
}

function secondaryKey(state: GameState) {
  if (state === "update") return "home.action.playAnyway";
  if (state === "install") return "home.action.useExisting";
  if (state === "downloading") return "home.action.pause";
  if (state === "paused") return "home.action.resume";
  if (state === "error") return "home.action.errorDetails";
  if (state === "offline") return "home.action.retry";
  if (state === "running") return "home.action.minimize";
  return null;
}

export default function Home({ gameId, state, lang, t }: Props) {
  const game = GAMES[gameId];
  const meta = STATE_META[state];
  const secondary = secondaryKey(state);
  const showCard = ["install", "downloading", "paused", "verifying", "error"].includes(state);

  return (
    <div className="page home-page">
      <NewsWidget lang={lang} />

      {state !== "install" && (
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label">{t("stats.playtime")}</div>
            <div className="hero-stat-value">{game.playtime[lang]}</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">{t("stats.lastPlayed")}</div>
            <div className="hero-stat-value">{game.lastPlayed[lang]}</div>
          </div>
        </div>
      )}

      {showCard && (
        <div className="game-info-card">
          <img className="game-info-thumb" src={`/art/${gameId}.png`} alt="" />
          <div>
            <div className="game-info-name">{game.name}</div>
            <div className="game-info-meta">
              <span className="mono">v{game.version}</span>
              <span>{subText(game, state, t)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="home-actions">
        {secondary && (
          <button className="home-action-link" type="button">
            {t(secondary)}
          </button>
        )}
        <button className="home-icon-btn" type="button" aria-label={t("nav.settings")}>
          {icon("gear")}
        </button>
        <button className={"home-play is-" + state} type="button" disabled={Boolean((meta as { disabled?: boolean }).disabled)}>
          {icon(meta.primaryIcon)}
          <span className="home-play-copy">
            <span className="home-play-label">{t(meta.primary)}</span>
            <span className="home-play-sub">{subText(game, state, t)}</span>
          </span>
        </button>
      </div>

      <div className="home-version">v{game.version}</div>
    </div>
  );
}
