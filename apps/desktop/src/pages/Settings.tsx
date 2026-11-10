import { useEffect, useRef, useState } from "react";
import { GAMES, type GameId, type GameState } from "../data";
import type { Lang } from "../App";
import {
  appInfo,
  chooseCustomBackground,
  chooseInstallFolder,
  clearCustomBackground,
  driveOf,
  fetchDiskSpace,
  fetchDownloadBytes,
  formatBytes,
  gameVersion,
  openInstallFolder,
  resetSettings,
  saveAppearance,
  saveInstallRoot,
  saveNetworkSettings,
  saveWindowBehavior,
  setLanguage,
  type AppInfo,
  type BackgroundMode,
  type DiskSpace,
  type DownloadOrder,
  type GameVersion,
  type ProxyMode,
  type Settings as SettingsData,
} from "../lib/ipc";

type Tab = "general" | "game" | "network" | "advanced" | "about";
type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  gameId: GameId;
  settings: SettingsData;
  roots: Record<GameId, string>;
  states: Record<GameId, GameState>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onSettings: (settings: SettingsData) => void;
  onLang: (lang: Lang) => void;
  onRoot: (gameId: GameId, path: string) => void;
}

const TABS: Tab[] = ["general", "game", "network", "advanced", "about"];

const ICONS: Record<Tab, string> = {
  general:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>',
  game:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 3.9 4.9l-1 4.1a2.4 2.4 0 0 1-4.2 1.2L14 16h-4l-1.7 2.2a2.4 2.4 0 0 1-4.2-1.2l-1-4.1A4 4 0 0 1 7 8Z"/><path d="M8 12h2M9 11v2"/></svg>',
  network:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><path d="M12 19h.01"/></svg>',
  advanced:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  about:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>',
};

const BUSY_STATES: GameState[] = ["downloading", "paused", "verifying", "running"];

function icon(name: Tab) {
  return <span dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

export default function Settings({
  gameId,
  settings,
  roots,
  states,
  t,
  onSettings,
  onLang,
  onRoot,
}: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [save, setSave] = useState<SaveState>("idle");
  const [pathDraft, setPathDraft] = useState(roots[gameId]);
  const [pathState, setPathState] = useState<SaveState>("idle");
  const [resetArmed, setResetArmed] = useState(false);
  const [disk, setDisk] = useState<DiskSpace | null>(null);
  const [downloadBytes, setDownloadBytes] = useState<number | null>(null);
  const [versionInfo, setVersionInfo] = useState<GameVersion | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);

  const [proxyMode, setProxyMode] = useState<ProxyMode>(settings.proxy.mode);
  const [proxyUrl, setProxyUrl] = useState(settings.proxy.url ?? "");
  const [proxyNoProxy, setProxyNoProxy] = useState(settings.proxy.noProxy ?? "");
  const [order, setOrder] = useState<DownloadOrder>(settings.downloadOrder);
  const [concurrency, setConcurrency] = useState(settings.concurrency);
  const [blur, setBlur] = useState(settings.backgroundBlur);
  const [noise, setNoise] = useState(settings.backgroundNoise);
  const savedTimer = useRef<number | null>(null);

  const game = GAMES[gameId];
  const root = roots[gameId];
  const busy = BUSY_STATES.includes(states[gameId]);
  const pathChanged = pathDraft.trim() !== root.trim();
  const customName = settings.backgroundPath
    ? settings.backgroundPath.startsWith("blob:")
      ? t("settings.background.custom.chosen")
      : settings.backgroundPath.split(/[\\/]/).pop() || t("settings.background.custom.chosen")
    : null;

  // Keep the draft in sync with the saved root, but do not clear the "saved"
  // status when the root changes because of our own save.
  useEffect(() => {
    setPathDraft(root);
  }, [gameId, root]);

  useEffect(() => {
    setPathState("idle");
  }, [gameId]);

  useEffect(() => {
    setProxyMode(settings.proxy.mode);
    setProxyUrl(settings.proxy.url ?? "");
    setProxyNoProxy(settings.proxy.noProxy ?? "");
    setOrder(settings.downloadOrder);
    setConcurrency(settings.concurrency);
    setBlur(settings.backgroundBlur);
    setNoise(settings.backgroundNoise);
  }, [
    settings.proxy.mode,
    settings.proxy.url,
    settings.proxy.noProxy,
    settings.downloadOrder,
    settings.concurrency,
    settings.backgroundBlur,
    settings.backgroundNoise,
  ]);

  useEffect(() => {
    let active = true;
    setDisk(null);
    setDownloadBytes(null);
    void Promise.all([fetchDiskSpace(root), fetchDownloadBytes(gameId)])
      .then(([space, bytes]) => {
        if (!active) return;
        setDisk(space);
        setDownloadBytes(bytes);
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot load game size", error);
      });
    return () => {
      active = false;
    };
  }, [gameId, root]);

  useEffect(() => {
    if (tab !== "about" || info) return;
    let active = true;
    void appInfo()
      .then((value) => {
        if (active) setInfo(value);
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot load app info", error);
      });
    return () => {
      active = false;
    };
  }, [tab, info]);

  useEffect(() => {
    let active = true;
    setVersionInfo(null);
    void gameVersion(gameId)
      .then((value) => {
        if (active) setVersionInfo(value);
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot load game version", error);
      });
    return () => {
      active = false;
    };
  }, [gameId, root]);

  const clearSavedTimer = () => {
    if (savedTimer.current !== null) {
      window.clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
  };

  // The saved note is a short confirmation, not a permanent hint.
  const flashSaved = () => {
    setSave("saved");
    clearSavedTimer();
    savedTimer.current = window.setTimeout(() => {
      savedTimer.current = null;
      setSave("idle");
    }, 1800);
  };

  useEffect(() => clearSavedTimer, []);

  const commit = async (action: () => Promise<SettingsData>) => {
    clearSavedTimer();
    setSave("saving");
    try {
      const next = await action();
      onSettings(next);
      flashSaved();
    } catch (error) {
      console.error("[YAYL] cannot save settings", error);
      setSave("error");
    }
  };

  const changeLanguage = (value: Lang) => {
    onLang(value);
    void commit(() => setLanguage(value));
  };

  const saveBackground = (
    mode: BackgroundMode,
    nextBlur: number = blur,
    nextNoise: number = noise
  ) => {
    void commit(() => saveAppearance(settings.reducedMotion, mode, nextBlur, nextNoise));
  };

  const changeMotion = (enabled: boolean) => {
    void commit(() =>
      saveAppearance(!enabled, settings.background, settings.backgroundBlur, settings.backgroundNoise)
    );
  };

  const pickCustom = () => {
    clearSavedTimer();
    setSave("saving");
    void chooseCustomBackground()
      .then((next) => {
        if (!next) {
          setSave("idle");
          return;
        }
        onSettings(next);
        flashSaved();
      })
      .catch((error: unknown) => {
        console.error("[YAYL] cannot pick a custom background", error);
        setSave("error");
      });
  };

  const changeBackground = (value: BackgroundMode) => {
    if (value === "custom") {
      pickCustom();
      return;
    }
    saveBackground(value);
  };

  const removeCustom = () => {
    void commit(() => clearCustomBackground());
  };

  const commitBlur = (value: number) => {
    setBlur(value);
    saveBackground(settings.background, value, noise);
  };

  const commitNoise = (value: number) => {
    setNoise(value);
    saveBackground(settings.background, blur, value);
  };

  const changeTray = (enabled: boolean) => {
    void commit(() => saveWindowBehavior(enabled));
  };

  const saveNetwork = (overrides?: {
    mode?: ProxyMode;
    order?: DownloadOrder;
    concurrency?: number;
  }) => {
    const mode = overrides?.mode ?? proxyMode;
    void commit(() =>
      saveNetworkSettings({
        mode,
        url: mode === "manual" ? proxyUrl.trim() || null : null,
        noProxy: mode === "manual" ? proxyNoProxy.trim() || null : null,
        downloadOrder: overrides?.order ?? order,
        concurrency: overrides?.concurrency ?? concurrency,
      })
    );
  };

  const changeProxyMode = (mode: ProxyMode) => {
    setProxyMode(mode);
    if (mode !== "manual") saveNetwork({ mode });
  };

  const choosePath = async () => {
    try {
      const next = await chooseInstallFolder(pathDraft || root);
      setPathDraft(next);
      setPathState("idle");
    } catch (error) {
      console.error("[YAYL] cannot choose install folder", error);
      setPathState("error");
    }
  };

  const commitPath = async () => {
    if (!pathChanged || busy) return;
    setPathState("saving");
    try {
      const next = pathDraft.trim();
      await saveInstallRoot(gameId, next);
      onRoot(gameId, next);
      setPathState("saved");
    } catch (error) {
      console.error("[YAYL] cannot save install folder", error);
      setPathState("error");
    }
  };

  const doReset = async () => {
    clearSavedTimer();
    setSave("saving");
    try {
      const next = await resetSettings();
      onSettings(next);
      if (next.language === "vi" || next.language === "en") onLang(next.language);
      else onLang("vi");
      setResetArmed(false);
      flashSaved();
    } catch (error) {
      console.error("[YAYL] cannot reset settings", error);
      setSave("error");
    }
  };

  const footer =
    save === "saving"
      ? t("settings.saving")
      : save === "saved"
        ? t("settings.saved")
        : t("settings.saveError");

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <p className="page-subtitle">{t("settings.subtitle")}</p>
        </div>
      </div>

      <div className="settings-shell">
        <nav
          className="settings-nav"
          role="tablist"
          aria-orientation="vertical"
          aria-label={t("settings.title")}
        >
          {TABS.map((id) => (
            <button
              key={id}
              className={"settings-nav-item" + (tab === id ? " is-active" : "")}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`settings-panel-${id}`}
              onClick={() => setTab(id)}
            >
              {icon(id)}
              <span>{t(`settings.nav.${id}`)}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <section
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-general"
            aria-labelledby="settings-tab-general"
            hidden={tab !== "general"}
          >
            <div className="settings-section">
              <div className="settings-section-header">
                <div className="settings-section-title">{t("settings.general.title")}</div>
                <div className="settings-section-desc">{t("settings.general.desc")}</div>
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.language")}</div>
                    <div className="setting-desc">{t("settings.language.desc")}</div>
                  </div>
                  <div className="setting-control is-medium">
                    <select
                      className="select"
                      id="settings-language"
                      aria-label={t("settings.language")}
                      value={settings.language === "en" ? "en" : "vi"}
                      onChange={(event) => changeLanguage(event.target.value === "en" ? "en" : "vi")}
                    >
                      <option value="vi">{t("common.vi")}</option>
                      <option value="en">{t("common.en")}</option>
                    </select>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.motion")}</div>
                    <div className="setting-desc">{t("settings.motion.desc")}</div>
                  </div>
                  <div className="setting-control">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        aria-label={t("settings.motion")}
                        checked={!settings.reducedMotion}
                        onChange={(event) => changeMotion(event.target.checked)}
                      />
                      <span className="toggle-track" />
                    </label>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.background")}</div>
                    <div className="setting-desc">{t("settings.background.desc")}</div>
                  </div>
                  <div className="setting-control is-medium">
                    <select
                      className="select"
                      aria-label={t("settings.background")}
                      value={settings.background}
                      onChange={(event) =>
                        changeBackground(event.target.value as BackgroundMode)
                      }
                    >
                      <option value="art">{t("settings.background.art")}</option>
                      <option value="custom">{t("settings.background.custom")}</option>
                      <option value="solid">{t("settings.background.solid")}</option>
                    </select>
                  </div>
                </div>

                {settings.background === "custom" && (
                  <>
                    <div className="setting-row">
                      <div className="setting-copy">
                        <div className="setting-label">{t("settings.background.file")}</div>
                        <div className="setting-desc">
                          {customName ?? t("settings.background.file.desc")}
                        </div>
                      </div>
                      <div className="setting-control">
                        <div className="setting-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={pickCustom}
                          >
                            {t("settings.background.choose")}
                          </button>
                          {settings.backgroundPath && (
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={removeCustom}
                            >
                              {t("settings.background.remove")}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-copy">
                        <div className="setting-label">{t("settings.background.blur")}</div>
                        <div className="setting-desc">{t("settings.background.blur.desc")}</div>
                      </div>
                      <div className="setting-control">
                        <div className="range-wrap">
                          <input
                            className="range"
                            type="range"
                            min={0}
                            max={40}
                            step={1}
                            aria-label={t("settings.background.blur")}
                            value={blur}
                            onChange={(event) => setBlur(Number(event.target.value))}
                            onPointerUp={(event) =>
                              commitBlur(Number(event.currentTarget.value))
                            }
                            onKeyUp={(event) => commitBlur(Number(event.currentTarget.value))}
                          />
                          <span className="range-value">{blur}px</span>
                        </div>
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-copy">
                        <div className="setting-label">{t("settings.background.noise")}</div>
                        <div className="setting-desc">{t("settings.background.noise.desc")}</div>
                      </div>
                      <div className="setting-control">
                        <div className="range-wrap">
                          <input
                            className="range"
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            aria-label={t("settings.background.noise")}
                            value={noise}
                            onChange={(event) => setNoise(Number(event.target.value))}
                            onPointerUp={(event) =>
                              commitNoise(Number(event.currentTarget.value))
                            }
                            onKeyUp={(event) => commitNoise(Number(event.currentTarget.value))}
                          />
                          <span className="range-value">{noise}%</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.closeBehavior")}</div>
                    <div className="setting-desc">{t("settings.closeBehavior.desc")}</div>
                  </div>
                  <div className="setting-control is-medium">
                    <select
                      className="select"
                      aria-label={t("settings.closeBehavior")}
                      value={settings.closeToTray ? "tray" : "exit"}
                      onChange={(event) => changeTray(event.target.value === "tray")}
                    >
                      <option value="tray">{t("settings.closeTray")}</option>
                      <option value="exit">{t("settings.closeExit")}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-game"
            aria-labelledby="settings-tab-game"
            hidden={tab !== "game"}
          >
            <div className="game-hero">
              <img
                className="game-hero-art"
                src={`/art/${gameId}.png`}
                alt=""
                onError={(event) => event.currentTarget.classList.add("is-missing")}
              />
              <div className="game-hero-scrim" />
              <div className="game-hero-body">
                <img
                  className="game-hero-icon"
                  src={`/art/${gameId}.png`}
                  alt=""
                  onError={(event) => event.currentTarget.classList.add("is-missing")}
                />
                <div className="game-hero-info">
                  <div className="game-hero-name">{game.name}</div>
                  <div className="game-hero-meta">
                    {versionInfo?.local ? (
                      <span className="mono">
                        v{versionInfo.local}
                        {versionInfo.latest && versionInfo.latest !== versionInfo.local
                          ? ` → v${versionInfo.latest}`
                          : ""}
                      </span>
                    ) : (
                      <span>{t("common.notInstalled")}</span>
                    )}
                    <span>
                      {disk && downloadBytes !== null
                        ? t("settings.game.diskValue", {
                            drive: driveOf(root),
                            free: formatBytes(disk.freeBytes),
                            required: formatBytes(downloadBytes),
                          })
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-header">
                <div className="settings-section-title">{t("settings.game.installTitle")}</div>
                <div className="settings-section-desc">{t("settings.game.installDesc")}</div>
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.game.path")}</div>
                    <div className="setting-desc">
                      {busy ? t("settings.game.path.locked") : t("settings.game.path.desc")}
                    </div>
                  </div>
                  <div className="setting-control is-wide">
                    <div className="path-field">
                      <input
                        className="input"
                        type="text"
                        aria-label={t("settings.game.path")}
                        title={pathDraft}
                        value={pathDraft}
                        disabled={busy}
                        onChange={(event) => {
                          setPathDraft(event.target.value);
                          setPathState("idle");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void commitPath();
                        }}
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void choosePath()}
                      >
                        {t("common.browse")}
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={busy || !pathChanged || pathState === "saving"}
                        onClick={() => void commitPath()}
                      >
                        {t("common.save")}
                      </button>
                    </div>
                    {pathState === "saved" && (
                      <div className="settings-status is-saved" role="status">
                        {t("settings.saved")}
                      </div>
                    )}
                    {pathState === "error" && (
                      <div className="settings-status is-error" role="alert">
                        {t("settings.saveError")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.game.tools")}</div>
                    <div className="setting-desc">{t("settings.game.tools.desc")}</div>
                  </div>
                  <div className="setting-control">
                    <div className="settings-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() =>
                          void openInstallFolder(gameId, root).catch((error: unknown) => {
                            console.error("[YAYL] cannot open install folder", error);
                          })
                        }
                      >
                        {t("settings.game.openFolder")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-network"
            aria-labelledby="settings-tab-network"
            hidden={tab !== "network"}
          >
            <div className="settings-section">
              <div className="settings-section-header">
                <div className="settings-section-title">{t("settings.network.title")}</div>
                <div className="settings-section-desc">{t("settings.network.desc")}</div>
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.network.proxy")}</div>
                    <div className="setting-desc">{t("settings.network.proxy.desc")}</div>
                  </div>
                  <div className="setting-control">
                    <div className="segmented" role="group" aria-label={t("settings.network.proxy")}>
                      {(["system", "direct", "manual"] as ProxyMode[]).map((mode) => (
                        <button
                          key={mode}
                          className={proxyMode === mode ? "is-active" : ""}
                          type="button"
                          aria-pressed={proxyMode === mode}
                          onClick={() => changeProxyMode(mode)}
                        >
                          {t(`settings.network.${mode === "manual" ? "custom" : mode}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {proxyMode === "manual" && (
                  <div className="setting-row">
                    <div className="setting-copy">
                      <div className="setting-label">{t("settings.network.url")}</div>
                      <div className="setting-desc">{t("settings.network.url.desc")}</div>
                    </div>
                    <div className="setting-control is-medium">
                      <input
                        className="input"
                        type="text"
                        aria-label={t("settings.network.url")}
                        placeholder={t("settings.network.url.placeholder")}
                        value={proxyUrl}
                        onChange={(event) => setProxyUrl(event.target.value)}
                        onBlur={() => saveNetwork()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveNetwork();
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.network.order")}</div>
                    <div className="setting-desc">{t("settings.network.order.desc")}</div>
                  </div>
                  <div className="setting-control is-medium">
                    <select
                      className="select"
                      aria-label={t("settings.network.order")}
                      value={order}
                      onChange={(event) => {
                        const value = event.target.value as DownloadOrder;
                        setOrder(value);
                        saveNetwork({ order: value });
                      }}
                    >
                      <option value="smallest_first">{t("settings.network.order.smallest")}</option>
                      <option value="largest_first">{t("settings.network.order.largest")}</option>
                      <option value="manifest">{t("settings.network.order.manifest")}</option>
                    </select>
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.network.concurrency")}</div>
                    <div className="setting-desc">{t("settings.network.concurrency.desc")}</div>
                  </div>
                  <div className="setting-control">
                    <div className="range-wrap">
                      <input
                        className="range"
                        type="range"
                        min="1"
                        max="32"
                        step="1"
                        aria-label={t("settings.network.concurrency")}
                        value={concurrency}
                        onChange={(event) => setConcurrency(Number(event.target.value))}
                        onPointerUp={() => saveNetwork({ concurrency })}
                        onKeyUp={() => saveNetwork({ concurrency })}
                        onBlur={() => saveNetwork({ concurrency })}
                      />
                      <span className="range-value">{concurrency}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-advanced"
            aria-labelledby="settings-tab-advanced"
            hidden={tab !== "advanced"}
          >
            <div className="settings-section">
              <div className="settings-section-header">
                <div className="settings-section-title">{t("settings.advanced.title")}</div>
                <div className="settings-section-desc">{t("settings.advanced.desc")}</div>
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.advanced.reset")}</div>
                    <div className="setting-desc">
                      {resetArmed ? t("settings.reset.text") : t("settings.advanced.reset.desc")}
                    </div>
                  </div>
                  <div className="setting-control">
                    {resetArmed ? (
                      <div className="settings-actions">
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => void doReset()}
                        >
                          {t("settings.reset.confirm")}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => setResetArmed(false)}
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-danger btn-sm"
                        type="button"
                        onClick={() => setResetArmed(true)}
                      >
                        {t("settings.advanced.resetAction")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="settings-panel"
            role="tabpanel"
            id="settings-panel-about"
            aria-labelledby="settings-tab-about"
            hidden={tab !== "about"}
          >
            <div className="settings-section">
              <div className="settings-section-header">
                <div className="settings-section-title">{t("settings.about.title")}</div>
                <div className="settings-section-desc">{t("settings.about.desc")}</div>
              </div>
              <div className="about-card">
                <div className="about-mark">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8.4 5.2a1 1 0 0 1 1.52-.86l9.1 6.8a1 1 0 0 1 0 1.72l-9.1 6.8A1 1 0 0 1 8.4 18.8V5.2Z" />
                  </svg>
                </div>
                <div>
                  <div className="about-name">YAYL</div>
                  <div className="about-version">
                    v{info?.version ?? "0.1.0"} · {info?.debug ? "debug" : "release"} · MIT
                  </div>
                  <p className="about-desc">{t("settings.about.desc")}</p>
                  <div className="about-links">
                    <span className="chip">Arknights EN</span>
                    <span className="chip">Stella Sora EN</span>
                    <span className="chip is-accent">Tauri 2</span>
                    <span className="chip">React 19</span>
                  </div>
                </div>
              </div>
              <div className="legal-note">{t("settings.about.legal")}</div>
            </div>
          </section>

          {save !== "idle" && (
            <div className={"settings-footer" + (save === "error" ? " is-error" : "")}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {save === "error" ? (
                  <>
                    <path d="M10.3 4.2 2.8 17.3A1.7 1.7 0 0 0 4.3 20h15.4a1.7 1.7 0 0 0 1.5-2.7L13.7 4.2a2 2 0 0 0-3.4 0Z" />
                    <path d="M12 9v4M12 16h.01" />
                  </>
                ) : (
                  <path d="m5 12 4.5 4.5L19 7" />
                )}
              </svg>
              <span role={save === "error" ? "alert" : "status"}>{footer}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
