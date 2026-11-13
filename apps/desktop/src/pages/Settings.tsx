import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GAMES, type GameId, type GameState } from "../data";
import type { Lang } from "../App";
import Select from "../components/Select";
import {
  appInfo,
  backgroundDisplayPath,
  backgroundIsVideo,
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
  type BackgroundFit,
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

/* The track fill follows the thumb instead of a fixed gradient stop. */
function rangeFill(value: number, min: number, max: number): CSSProperties {
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return { "--range-fill": `${percent}%` } as CSSProperties;
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
  const [opacity, setOpacity] = useState(settings.backgroundOpacity);
  const [fit, setFit] = useState<BackgroundFit>(settings.backgroundFit);
  const savedTimer = useRef<number | null>(null);

  const game = GAMES[gameId];
  const root = roots[gameId];
  const busy = BUSY_STATES.includes(states[gameId]);
  const pathChanged = pathDraft.trim() !== root.trim();
  const customPath = settings.backgroundSource ?? settings.backgroundPath;
  const isVideo = customPath ? backgroundIsVideo(customPath) : false;
  const customPathLabel = customPath
    ? backgroundDisplayPath(customPath)
    : t("settings.background.path.empty");

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
    setOpacity(settings.backgroundOpacity);
    setFit(settings.backgroundFit);
  }, [
    settings.proxy.mode,
    settings.proxy.url,
    settings.proxy.noProxy,
    settings.downloadOrder,
    settings.concurrency,
    settings.backgroundBlur,
    settings.backgroundNoise,
    settings.backgroundOpacity,
    settings.backgroundFit,
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

  const saveBackground = (overrides?: {
    mode?: BackgroundMode;
    blur?: number;
    noise?: number;
    opacity?: number;
    fit?: BackgroundFit;
    muted?: boolean;
    loop?: boolean;
  }) => {
    void commit(() =>
      saveAppearance(
        settings.reducedMotion,
        overrides?.mode ?? settings.background,
        overrides?.blur ?? blur,
        overrides?.noise ?? noise,
        overrides?.opacity ?? opacity,
        overrides?.fit ?? fit,
        overrides?.muted ?? settings.backgroundMuted,
        overrides?.loop ?? settings.backgroundLoop
      )
    );
  };

  const changeMotion = (enabled: boolean) => {
    void commit(() =>
      saveAppearance(
        !enabled,
        settings.background,
        settings.backgroundBlur,
        settings.backgroundNoise,
        settings.backgroundOpacity,
        settings.backgroundFit,
        settings.backgroundMuted,
        settings.backgroundLoop
      )
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
    saveBackground({ mode: value });
  };

  const removeCustom = () => {
    void commit(() => clearCustomBackground());
  };

  const commitBlur = (value: number) => {
    setBlur(value);
    saveBackground({ blur: value });
  };

  const commitNoise = (value: number) => {
    setNoise(value);
    saveBackground({ noise: value });
  };

  const commitOpacity = (value: number) => {
    setOpacity(value);
    saveBackground({ opacity: value });
  };

  const changeFit = (value: BackgroundFit) => {
    setFit(value);
    saveBackground({ fit: value });
  };

  const changeMuted = (muted: boolean) => {
    saveBackground({ muted });
  };

  const changeLoop = (loop: boolean) => {
    saveBackground({ loop });
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
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.language")}</div>
                  </div>
                  <div className="setting-control is-medium">
                    <Select
                      id="settings-language"
                      label={t("settings.language")}
                      value={settings.language === "en" ? "en" : "vi"}
                      options={[
                        { value: "vi", label: t("common.vi") },
                        { value: "en", label: t("common.en") },
                      ]}
                      onChange={(value) => changeLanguage(value === "en" ? "en" : "vi")}
                    />
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.motion")}</div>
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
                  </div>
                  <div className="setting-control is-medium">
                    <Select
                      label={t("settings.background")}
                      value={settings.background}
                      options={[
                        { value: "art", label: t("settings.background.art") },
                        { value: "custom", label: t("settings.background.custom") },
                        { value: "solid", label: t("settings.background.solid") },
                      ]}
                      onChange={(value) => changeBackground(value)}
                    />
                  </div>
                </div>

                {settings.background === "custom" && (
                  <>
                    <div className="setting-row">
                      <div className="setting-copy">
                        <div className="setting-label">{t("settings.background.path")}</div>
                      </div>
                      <div className="setting-control is-wide">
                        <div className="setting-actions">
                          <button
                            className="background-path"
                            type="button"
                            title={customPathLabel}
                            onClick={pickCustom}
                          >
                            <span className="background-path-text">{customPathLabel}</span>
                          </button>
                          {customPath && (
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
                        <div className="setting-label">{t("settings.background.opacity")}</div>
                      </div>
                      <div className="setting-control">
                        <div className="range-wrap">
                          <input
                            className="range"
                            type="range"
                            min={20}
                            max={100}
                            step={1}
                            aria-label={t("settings.background.opacity")}
                            value={opacity}
                            style={rangeFill(opacity, 20, 100)}
                            onChange={(event) => setOpacity(Number(event.target.value))}
                            onPointerUp={(event) =>
                              commitOpacity(Number(event.currentTarget.value))
                            }
                            onKeyUp={(event) => commitOpacity(Number(event.currentTarget.value))}
                          />
                          <span className="range-value">{opacity}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="setting-row">
                      <div className="setting-copy">
                        <div className="setting-label">{t("settings.background.blur")}</div>
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
                            style={rangeFill(blur, 0, 40)}
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
                            style={rangeFill(noise, 0, 100)}
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

                    <div className="setting-row">
                      <div className="setting-copy">
                        <div className="setting-label">{t("settings.background.fit")}</div>
                      </div>
                      <div className="setting-control is-medium">
                        <Select
                          label={t("settings.background.fit")}
                          value={fit}
                          options={[
                            { value: "cover", label: t("settings.background.fit.cover") },
                            { value: "contain", label: t("settings.background.fit.contain") },
                            { value: "center", label: t("settings.background.fit.center") },
                            ...(isVideo
                              ? []
                              : [
                                  {
                                    value: "tile" as BackgroundFit,
                                    label: t("settings.background.fit.tile"),
                                  },
                                ]),
                          ]}
                          onChange={(value) => changeFit(value)}
                        />
                      </div>
                    </div>

                    {isVideo && (
                      <>
                        <div className="setting-row">
                          <div className="setting-copy">
                            <div className="setting-label">{t("settings.background.muted")}</div>
                          </div>
                          <div className="setting-control">
                            <label className="toggle">
                              <input
                                type="checkbox"
                                aria-label={t("settings.background.muted")}
                                checked={settings.backgroundMuted}
                                onChange={(event) => changeMuted(event.target.checked)}
                              />
                              <span className="toggle-track" />
                            </label>
                          </div>
                        </div>

                        <div className="setting-row">
                          <div className="setting-copy">
                            <div className="setting-label">{t("settings.background.loop")}</div>
                          </div>
                          <div className="setting-control">
                            <label className="toggle">
                              <input
                                type="checkbox"
                                aria-label={t("settings.background.loop")}
                                checked={settings.backgroundLoop}
                                onChange={(event) => changeLoop(event.target.checked)}
                              />
                              <span className="toggle-track" />
                            </label>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.closeBehavior")}</div>
                  </div>
                  <div className="setting-control is-medium">
                    <Select
                      label={t("settings.closeBehavior")}
                      value={settings.closeToTray ? "tray" : "exit"}
                      options={[
                        { value: "tray", label: t("settings.closeTray") },
                        { value: "exit", label: t("settings.closeExit") },
                      ]}
                      onChange={(value) => changeTray(value === "tray")}
                    />
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
                      <span className="mono">v{versionInfo.local}</span>
                    ) : (
                      <span>{t("common.notInstalled")}</span>
                    )}
                    {versionInfo?.local &&
                      versionInfo.latest &&
                      versionInfo.latest !== versionInfo.local && (
                        <span className="game-hero-badge">
                          {t("settings.game.newVersion", { version: versionInfo.latest })}
                        </span>
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
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.game.path")}</div>
                    {busy && (
                      <div className="setting-desc">{t("settings.game.path.locked")}</div>
                    )}
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
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.network.proxy")}</div>
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
                  </div>
                  <div className="setting-control is-medium">
                    <Select
                      label={t("settings.network.order")}
                      value={order}
                      options={[
                        { value: "smallest_first", label: t("settings.network.order.smallest") },
                        { value: "largest_first", label: t("settings.network.order.largest") },
                        { value: "manifest", label: t("settings.network.order.manifest") },
                      ]}
                      onChange={(value) => {
                        setOrder(value);
                        saveNetwork({ order: value });
                      }}
                    />
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.network.concurrency")}</div>
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
                        style={rangeFill(concurrency, 1, 32)}
                        onChange={(event) => setConcurrency(Number(event.target.value))}
                        onPointerUp={(event) =>
                          saveNetwork({ concurrency: Number(event.currentTarget.value) })
                        }
                        onKeyUp={(event) =>
                          saveNetwork({ concurrency: Number(event.currentTarget.value) })
                        }
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
              </div>
              <div className="settings-rows">
                <div className="setting-row">
                  <div className="setting-copy">
                    <div className="setting-label">{t("settings.advanced.reset")}</div>
                    {resetArmed && (
                      <div className="setting-desc">{t("settings.reset.text")}</div>
                    )}
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
                    v{info?.version ?? "0.1.0"}, {info?.debug ? "debug" : "release"}, MIT
                  </div>
                  <div className="about-links">
                    {Object.values(GAMES).map((entry) => (
                      <span className="chip" key={entry.id}>
                        {entry.name} {entry.region}
                      </span>
                    ))}
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
