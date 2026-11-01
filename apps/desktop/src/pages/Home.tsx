import { useEffect, useRef, useState } from "react";
import { GAMES, STATE_META, type GameId, type GameState } from "../data";
import NewsWidget from "../components/NewsWidget";
import BubbleProgress from "../components/BubbleProgress";
import DownloadBadge from "../components/DownloadBadge";
import { fileUrl, type PlaytimeEntry } from "../lib/ipc";
import type { Lang } from "../App";

interface Props {
  gameId: GameId;
  state: GameState;
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  installRoot: string;
  progress?: number | null;
  errorCode?: string | null;
  playtime?: PlaytimeEntry | null;
  onInstall: () => void;
  onLocate: () => void;
  onResume: () => void;
  onPause: () => void;
  onMinimize: () => void;
  onPlay: () => void;
  onVerify: () => void;
  onRepair: () => void;
  onSettings: () => void;
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

type SecondaryAction = {
  key: string;
  action: "locate" | "pause" | "minimize" | "verify" | "none";
};

function secondaryAction(state: GameState): SecondaryAction | null {
  if (state === "update") return { key: "home.action.playAnyway", action: "none" };
  if (state === "install") return { key: "home.action.locateGame", action: "locate" };
  if (state === "offline") return { key: "home.action.retry", action: "none" };
  if (state === "running") return { key: "home.action.minimize", action: "minimize" };
  if (state === "downloading") return { key: "home.action.pause", action: "pause" };
  if (state === "paused") return { key: "home.action.cancel", action: "pause" };
  if (state === "ready") return { key: "home.action.verify", action: "verify" };
  return null;
}

const DOWNLOAD_STATES: GameState[] = ["downloading", "paused", "verifying"];
type MenuAction = "verify" | "repair" | "settings";
const MENU_ITEMS: { key: string; action: MenuAction }[] = [
  { key: "home.menu.verify", action: "verify" },
  { key: "home.menu.repair", action: "repair" },
  { key: "home.menu.settings", action: "settings" },
];
const CHECK_STATES: GameState[] = ["ready", "error", "update"];

function formatPlaytime(seconds: number, t: Props["t"]): string {
  if (seconds <= 0) return t("stats.never");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return t("stats.hoursMinutes", { hours, minutes });
  return t("stats.minutes", { minutes });
}

function formatLastPlayed(unixSeconds: number, lang: Lang): string {
  return new Date(unixSeconds * 1000).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function Home({
  gameId,
  state,
  lang,
  t,
  installRoot,
  progress,
  errorCode,
  playtime,
  onInstall,
  onLocate,
  onResume,
  onPause,
  onMinimize,
  onPlay,
  onVerify,
  onRepair,
  onSettings,
}: Props) {
  const game = GAMES[gameId];
  const meta = STATE_META[state];
  const secondary = secondaryAction(state);
  const percent = Math.round(progress ?? meta.progress ?? 0);
  const canCheck = CHECK_STATES.includes(state);
  const playtimeText = playtime
    ? formatPlaytime(playtime.seconds, t)
    : game.playtime[lang];
  const lastPlayedText =
    playtime?.lastPlayed != null
      ? formatLastPlayed(playtime.lastPlayed, lang)
      : game.lastPlayed[lang];
  const vars = {
    game: game.name,
    percent,
    size: game.updateSize,
    required: game.required,
    drive: game.drive,
    free: game.free,
    code: errorCode ?? "",
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="page home-page">
      <NewsWidget lang={lang} t={t} />

      {state !== "install" && (
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label">{t("stats.playtime")}</div>
            <div className="hero-stat-value">{playtimeText}</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">{t("stats.lastPlayed")}</div>
            <div className="hero-stat-value">{lastPlayedText}</div>
          </div>
        </div>
      )}

      <div className="home-actions">
        <div className="home-action-group">
          <button
            className={"home-play is-" + state}
            type="button"
            disabled={Boolean((meta as { disabled?: boolean }).disabled) || state === "downloading"}
            onClick={() => {
              if (state === "install" || state === "update") onInstall();
              else if (state === "paused") onResume();
              else if (state === "ready") onPlay();
              else if (state === "error") onRepair();
            }}
          >
            {DOWNLOAD_STATES.includes(state) && (
              <BubbleProgress progress={Math.min(1, Math.max(0, percent / 100))} />
            )}
            <span className="home-play-icon">
              {state === "install" ? (
                <DownloadBadge state="downloading" corner={false} size="30px" />
              ) : (
                icon(meta.primaryIcon)
              )}
            </span>
            <span className="home-play-label">{t(meta.primary, vars)}</span>
          </button>

          <div className="home-menu" ref={menuRef}>
            <button
              className="home-menu-btn"
              type="button"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label={t("home.menu.label")}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 7h14M5 12h14M5 17h14" />
              </svg>
            </button>
            {menuOpen && (
              <div className="home-menu-pop" role="menu">
                {MENU_ITEMS.map((item) => {
                  const disabled = item.action !== "settings" && !canCheck;
                  return (
                    <button
                      key={item.key}
                      className="home-menu-item"
                      type="button"
                      role="menuitem"
                      disabled={disabled}
                      onClick={() => {
                        setMenuOpen(false);
                        if (item.action === "verify") onVerify();
                        else if (item.action === "repair") onRepair();
                        else onSettings();
                      }}
                    >
                      {t(item.key)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {secondary && (
          <a
            className="home-action-link"
            href={secondary.action === "locate" ? fileUrl(installRoot) : "#"}
            onClick={(event) => {
              event.preventDefault();
              if (secondary.action === "locate") onLocate();
              else if (secondary.action === "pause") onPause();
              else if (secondary.action === "minimize") onMinimize();
              else if (secondary.action === "verify") onVerify();
            }}
          >
            {t(secondary.key, vars)}
          </a>
        )}
        {state === "ready" && errorCode && (
          <div className="home-error" role="alert">
            {t("home.launch.error")}
          </div>
        )}
      </div>
    </div>
  );
}
