import { GAMES, type GameId, type GameState } from "../data";
import DownloadBadge from "./DownloadBadge";
import type { DownloadBadgeState } from "./DownloadBadge";

interface Props {
  gameId: GameId;
  state: GameState;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onSelect: (id: GameId) => void;
}

function badgeState(gameId: GameId, activeId: GameId, state: GameState): DownloadBadgeState {
  if (gameId !== activeId) return "idle";
  if (state === "paused") return "paused";
  if (state === "downloading" || state === "verifying") return "downloading";
  return "idle";
}

export default function Rail({ gameId, state, t, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <div className="game-list">
          {(Object.keys(GAMES) as GameId[]).map((id) => (
            <button
              key={id}
              className={"game-card" + (id === gameId ? " is-active" : "")}
              type="button"
              title={GAMES[id].name}
              onClick={() => onSelect(id)}
              data-game-id={id}
              data-status={badgeState(id, gameId, state)}
            >
              <span className="game-thumb-wrap">
                <img
                  className="game-thumb"
                  src={`/art/${id}.png`}
                  alt={GAMES[id].name}
                  onError={(event) => event.currentTarget.classList.add("is-missing")}
                />
                <DownloadBadge state={badgeState(id, gameId, state)} />
              </span>
              <span className="game-info">
                <span className="game-name">{GAMES[id].name}</span>
              </span>
            </button>
          ))}
        </div>

        <nav className="nav">
          <a className="nav-item is-active" href="#" title={t("nav.home")} aria-label={t("nav.home")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-6h5v6" /></svg>
          </a>
          <a className="nav-item" href="#" title={t("nav.downloads")} aria-label={t("nav.downloads")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          </a>
          <a className="nav-item" href="#" title={t("nav.settings")} aria-label={t("nav.settings")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.4.45.74.85.92H21v4h-.08a1.7 1.7 0 0 0-1.52 1.08Z" /></svg>
          </a>
        </nav>
      </div>
    </aside>
  );
}
