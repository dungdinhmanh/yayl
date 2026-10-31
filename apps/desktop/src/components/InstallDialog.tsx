import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { GAMES, type GameId } from "../data";
import {
  chooseInstallFolder,
  fetchDiskSpace,
  fetchDownloadBytes,
  fileUrl,
  formatBytes,
  openInstallFolder,
  type DiskSpace,
} from "../lib/ipc";

interface Props {
  gameId: GameId;
  game: (typeof GAMES)[GameId];
  initialPath: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onClose: () => void;
  onConfirm: (path: string) => void;
}

const FOLDER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7.5Z"/></svg>';

const DOWNLOAD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11"/><path d="m7.5 9.5 4.5 4.5 4.5-4.5"/><path d="M4 16.5v2A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-2"/></svg>';

const ALERT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.2 2.8 17.3A1.7 1.7 0 0 0 4.3 20h15.4a1.7 1.7 0 0 0 1.5-2.7L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 16h.01"/></svg>';

const CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

function glyph(html: string) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function percent(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

export default function InstallDialog({ gameId, game, initialPath, t, onClose, onConfirm }: Props) {
  const [path, setPath] = useState<string>(initialPath || game.path);
  const [downloadBytes, setDownloadBytes] = useState<number | null>(null);
  const [disk, setDisk] = useState<DiskSpace | null>(null);
  const [sizeLoading, setSizeLoading] = useState(true);
  const [sizeError, setSizeError] = useState(false);
  const [sizeAttempt, setSizeAttempt] = useState(0);
  const [diskLoading, setDiskLoading] = useState(true);
  const [diskError, setDiskError] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Only the saved/default root is allowed by the backend. Once the user edits
  // the path it is a pending choice, not an install root yet.
  const canLocate = path.trim() === initialPath.trim();

  // Total size is fetched once. The disk query runs in parallel and only
  // re-runs when the path changes.
  useEffect(() => {
    let active = true;
    setSizeLoading(true);
    setSizeError(false);
    fetchDownloadBytes(gameId)
      .then((bytes) => {
        if (active) setDownloadBytes(bytes);
      })
      .catch(() => {
        if (active) {
          setDownloadBytes(null);
          setSizeError(true);
        }
      })
      .finally(() => {
        if (active) setSizeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gameId, sizeAttempt]);

  useEffect(() => {
    let active = true;
    setDiskLoading(true);
    setDiskError(false);
    const timer = window.setTimeout(() => {
      fetchDiskSpace(path)
        .then((space) => {
          if (active) setDisk(space);
        })
        .catch(() => {
          if (active) {
            setDisk(null);
            setDiskError(true);
          }
        })
        .finally(() => {
          if (active) setDiskLoading(false);
        });
    }, 240);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [path]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const requiredBytes = downloadBytes ?? 0;
  const usedBytes = disk ? disk.totalBytes - disk.freeBytes : 0;
  const usedPercent = disk ? (usedBytes / disk.totalBytes) * 100 : 0;
  const gamePercent = disk
    ? Math.min((requiredBytes / disk.totalBytes) * 100, Math.max(0, 100 - usedPercent))
    : 0;
  const freeAfterBytes = disk ? Math.max(0, disk.freeBytes - requiredBytes) : 0;
  const missingBytes = disk ? Math.max(0, requiredBytes - disk.freeBytes) : 0;
  const enoughSpace = disk !== null && missingBytes === 0;
  const ready =
    !sizeLoading &&
    !diskLoading &&
    downloadBytes !== null &&
    disk !== null &&
    !diskError &&
    !sizeError;
  const drive = /^([A-Za-z]):/.exec(path)?.[1]?.toUpperCase() ?? "D";

  const browse = async () => {
    setChoosing(true);
    try {
      const next = await chooseInstallFolder(path);
      setPath(next);
    } finally {
      setChoosing(false);
    }
  };

  return (
    <div
      className="install-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="installTitle"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="install-head">
          <div className="install-head-icon">{glyph(DOWNLOAD)}</div>
          <div className="install-head-copy">
            <div className="install-title" id="installTitle">
              {t("install.title", { game: game.name })}
            </div>
            <div className="install-sub">{t("install.subtitle")}</div>
          </div>
          <button className="install-close" type="button" aria-label={t("common.close")} onClick={onClose}>
            {glyph(CLOSE)}
          </button>
        </div>

        <div className="install-body">
          <section className="install-location">
            <div className="install-label">{t("install.location")}</div>
            <div className="install-path-row">
              <span className="install-path-icon">{glyph(FOLDER)}</span>
              <input
                className="install-path-input"
                value={path}
                spellCheck={false}
                aria-label={t("install.location")}
                onChange={(event) => setPath(event.target.value)}
              />
              <button className="install-change" type="button" onClick={browse} disabled={choosing}>
                {t("install.change")}
              </button>
            </div>
          </section>

          <section className="install-storage">
            <div className="install-storage-head">
              <span>{t("install.storage")}</span>
              <span className="is-total">
                {diskLoading ? (
                  <span className="install-skeleton" />
                ) : disk ? (
                  t("install.drive", { drive, total: formatBytes(disk.totalBytes) })
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="install-storage-body">
              {!diskError && (
                <>
                  {ready ? (
                    <div
                      className={"install-bar" + (!enoughSpace ? " is-short" : "")}
                      role="img"
                      aria-label={t("install.storage")}
                    >
                      <span className="install-bar-used" style={{ width: percent(usedPercent) }} />
                      <span
                        className="install-bar-game"
                        style={
                          {
                            left: percent(usedPercent),
                            width: percent(gamePercent),
                          } as CSSProperties
                        }
                      />
                    </div>
                  ) : (
                    <div className="install-bar-skeleton" aria-hidden="true" />
                  )}

                  <div className="install-legend">
                    <span className="is-used">
                      <i />
                      {t("install.used")}
                      <b>{diskLoading ? <span className="install-skeleton" /> : formatBytes(usedBytes)}</b>
                    </span>
                    <span className="is-game">
                      <i />
                      {t("install.game")}
                      <b>{sizeLoading ? <span className="install-skeleton" /> : formatBytes(requiredBytes)}</b>
                    </span>
                    <span className="is-free">
                      <i />
                      {t("install.freeAfter")}
                      <b>{diskLoading ? <span className="install-skeleton" /> : formatBytes(freeAfterBytes)}</b>
                    </span>
                  </div>
                </>
              )}

              <div className="install-size-row">
                <div>
                  <span>{t("install.download")}</span>
                  <b>{sizeLoading ? <span className="install-skeleton" /> : formatBytes(requiredBytes)}</b>
                </div>
                <div>
                  <span>{t("install.free")}</span>
                  <b>{diskLoading ? <span className="install-skeleton" /> : disk ? formatBytes(disk.freeBytes) : "—"}</b>
                </div>
              </div>
            </div>
          </section>

          {diskError && (
            <div className="install-warning" role="alert">
              {glyph(ALERT)}
              <span>{t("install.spaceError")}</span>
            </div>
          )}
          {sizeError && (
            <div className="install-warning" role="alert">
              {glyph(ALERT)}
              <span>{t("install.sizeError")}</span>
              <button
                className="install-warning-retry"
                type="button"
                onClick={() => setSizeAttempt((attempt) => attempt + 1)}
              >
                {t("install.retry")}
              </button>
            </div>
          )}
          {ready && !enoughSpace && (
            <div className="install-warning" role="alert">
              {glyph(ALERT)}
              <span>
                {t("install.notEnough", { drive })} {t("install.needMore", { size: formatBytes(missingBytes) })}
              </span>
            </div>
          )}
        </div>

        <div className="install-foot">
          {canLocate ? (
            <a
              className="install-locate"
              href={fileUrl(path)}
              onClick={(event) => {
                event.preventDefault();
                void openInstallFolder(gameId, path);
              }}
            >
              {t("home.action.locateGame")}
            </a>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="install-actions">
            <button
              className="install-confirm"
              type="button"
              disabled={!ready || !enoughSpace}
              onClick={() => onConfirm(path)}
            >
              {t("install.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
