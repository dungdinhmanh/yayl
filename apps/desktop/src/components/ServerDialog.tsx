import { useEffect, useRef, useState } from "react";
import { GAMES, SERVERS, type GameId, type GameState } from "../data";
import { fetchDownloadBytes, formatBytes } from "../lib/ipc";

interface Props {
  gameId: GameId;
  currentId: string;
  states: Record<string, GameState>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const SWAP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>';

const CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>';

function glyph(html: string) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ServerDialog({
  gameId,
  currentId,
  states,
  t,
  onSelect,
  onClose,
}: Props) {
  const servers = SERVERS[gameId];
  const [sizes, setSizes] = useState<Record<string, number | null>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.allSettled(
      servers.map(async (server) => {
        const bytes = await fetchDownloadBytes(server.id);
        if (active) setSizes((current) => ({ ...current, [server.id]: bytes }));
      })
    );
    return () => {
      active = false;
    };
  }, [servers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="install-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="install-dialog server-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="serverDialogTitle"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="install-head">
          <div className="install-head-icon">{glyph(SWAP)}</div>
          <div className="install-head-copy">
            <div className="install-title" id="serverDialogTitle">
              {t("server.choose")}
            </div>
          </div>
          <button className="install-close" type="button" aria-label={t("common.close")} onClick={onClose}>
            {glyph(CLOSE)}
          </button>
        </div>

        <div className="install-body">
          <div className="server-list">
            {servers.map((server) => {
              const current = server.id === currentId;
              const installed = (states[server.id] ?? "install") !== "install";
              const size = sizes[server.id];
              return (
                <button
                  key={server.id}
                  className={"server-row" + (current ? " is-current" : "")}
                  type="button"
                  aria-pressed={current}
                  onClick={() => onSelect(server.id)}
                >
                  <span className="server-region">{server.region}</span>
                  <span className="server-copy">
                    <span className="server-name">
                      {GAMES[gameId].name} {server.region}
                    </span>
                    <span className="server-meta">
                      <span>{installed ? t("server.installed") : t("server.notInstalled")}</span>
                      <span className="server-size">
                        {size === undefined
                          ? t("server.loading")
                          : size === null
                            ? "—"
                            : formatBytes(size)}
                      </span>
                    </span>
                  </span>
                  {current && <span className="server-check">{glyph(CHECK)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
