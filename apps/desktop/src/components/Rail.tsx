import { GAMES, STATE_META, type GameId, type GameState } from "../data";
import DownloadBadge from "./DownloadBadge";
import type { DownloadBadgeState } from "./DownloadBadge";

export type RailView = "home" | "settings";

interface Props {
  gameId: GameId;
  view: RailView;
  states: Record<GameId, GameState>;
  progress: Record<GameId, number>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onSelect: (id: GameId) => void;
  onNavigate: (view: RailView) => void;
}

const RAIL_PATH =
  "M28 3 H39 A14 14 0 0 1 53 17 V39 A14 14 0 0 1 39 53 H17 A14 14 0 0 1 3 39 V17 A14 14 0 0 1 17 3 H28";

const DOWNLOAD_STATES: GameState[] = ["downloading", "paused", "verifying"];

export default function Rail({ gameId, view, states, progress, t, onSelect, onNavigate }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <div className="game-list">
          {(Object.keys(GAMES) as GameId[]).map((id) => {
            const gameState = states[id];
            const downloadActive = DOWNLOAD_STATES.includes(gameState);
            const badge: DownloadBadgeState = !downloadActive
              ? "idle"
              : gameState === "paused"
                ? "paused"
                : "downloading";
            const selected = id === gameId;
            // The progress ring belongs to a downloading game that is not selected.
            const showRing = downloadActive && !selected;
            // Selected rings are full: the ring doubles as the selection indicator.
            const percent = progress[id] ?? STATE_META[gameState].progress;
            const endOffset = selected ? 0 : showRing ? 100 - percent : 100;

            return (
              <button
                key={id}
                className={
                  "game-card" +
                  (selected ? " is-active is-ring-selected" : "") +
                  (showRing ? " is-downloading" : "")
                }
                type="button"
                title={GAMES[id].name}
                onClick={() => onSelect(id)}
                data-game-id={id}
              >
                <span className="game-thumb-wrap">
                  <svg className="rail-progress" viewBox="0 0 56 56" aria-hidden="true">
                    <path className="rail-progress-bg" pathLength={100} d={RAIL_PATH} />
                    <path
                      className="rail-progress-fill"
                      pathLength={100}
                      d={RAIL_PATH}
                      style={{ strokeDashoffset: `${endOffset}px` }}
                    />
                  </svg>
                  <img
                    className="game-thumb"
                    src={`/icons/${id}.ico`}
                    alt={GAMES[id].name}
                    onError={(event) => event.currentTarget.classList.add("is-missing")}
                  />
                  <DownloadBadge state={badge} size="16px" />
                </span>
                <span className="game-info">
                  <span className="game-name">{GAMES[id].name}</span>
                </span>
              </button>
            );
          })}
        </div>

        <nav className="nav">
          <button
            className={"nav-item" + (view === "home" ? " is-active" : "")}
            type="button"
            title={t("nav.home")}
            aria-label={t("nav.home")}
            aria-current={view === "home" ? "page" : undefined}
            onClick={() => onNavigate("home")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-6h5v6" /></svg>
          </button>
          <button
            className={"nav-item" + (view === "settings" ? " is-active" : "")}
            type="button"
            title={t("nav.settings")}
            aria-label={t("nav.settings")}
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => onNavigate("settings")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.4.45.74.85.92H21v4h-.08a1.7 1.7 0 0 0-1.52 1.08Z" /></svg>
          </button>
        </nav>
      </div>
    </aside>
  );
}
