import { useEffect, useRef, useState } from "react";
import { GAMES, type GameId } from "../data";
import type { Lang } from "../App";
import {
  chooseInstallFolder,
  completeOnboarding,
  driveOf,
  fetchDiskSpace,
  fetchDownloadBytes,
  formatBytes,
  gameProfiles,
  saveFirstRun,
  type DiskSpace,
  type GameProfiles,
  type Settings as SettingsData,
} from "../lib/ipc";

interface Props {
  settings: SettingsData;
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onLang: (lang: Lang) => void;
  onSettings: (settings: SettingsData) => void;
  onDone: () => void;
}

type Step = 1 | 2 | 3;

function joinPath(base: string, folder: string): string {
  const separator = base.includes("\\") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${separator}${folder}`;
}

function parentOf(root: string, folder: string): string | null {
  const separator = root.includes("\\") ? "\\" : "/";
  const suffix = `${separator}${folder}`;
  if (root.toLowerCase().endsWith(suffix.toLowerCase())) {
    return root.slice(0, -suffix.length);
  }
  return null;
}

function absolutePath(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("/");
}

export default function FirstRun({
  settings,
  lang,
  t,
  onLang,
  onSettings,
  onDone,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [profiles, setProfiles] = useState<GameProfiles | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [base, setBase] = useState("");
  const [disk, setDisk] = useState<DiskSpace | null>(null);
  const [required, setRequired] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    let active = true;
    void gameProfiles()
      .then((value) => {
        if (active) setProfiles(value);
      })
      .catch((reason: unknown) => {
        console.error("[YAYL] cannot load game profiles", reason);
        if (active) setError(t("firstRun.saveError"));
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (!profiles || initialized.current) return;
    initialized.current = true;

    const saved = profiles.games.filter((profile) => settings.installRoots[profile.id]);
    setSelected(
      new Set(
        saved.length > 0
          ? saved.map((profile) => profile.id)
          : profiles.games.map((profile) => profile.id)
      )
    );

    const first = saved[0];
    const parent = first ? parentOf(settings.installRoots[first.id], first.installDir) : null;
    setBase(parent ?? profiles.base);
  }, [profiles, settings.installRoots]);

  const selectedProfiles = profiles?.games.filter((profile) => selected.has(profile.id)) ?? [];
  // Swapping games without changing the count must still refresh the size.
  const selectedKey = selectedProfiles.map((profile) => profile.id).join(",");

  useEffect(() => {
    const chosen = selectedKey ? selectedKey.split(",") : [];
    if (!base.trim() || !absolutePath(base) || chosen.length === 0) {
      setDisk(null);
      setRequired(null);
      return;
    }
    let active = true;
    setDisk(null);
    setRequired(null);
    void Promise.all([
      fetchDiskSpace(base),
      Promise.all(chosen.map((id) => fetchDownloadBytes(id as GameId))).then((sizes) =>
        sizes.reduce((total, size) => total + size, 0)
      ),
    ])
      .then(([space, bytes]) => {
        if (!active) return;
        setDisk(space);
        setRequired(bytes);
      })
      .catch((reason: unknown) => {
        console.error("[YAYL] cannot read disk space", reason);
      });
    return () => {
      active = false;
    };
  }, [base, selectedKey]);

  const enoughSpace = disk !== null && required !== null && disk.freeBytes >= required;
  const pathValid = absolutePath(base);

  const toggleGame = (id: string) => {
    setError(null);
    setSelected((current) => {
      if (current.has(id) && current.size === 1) {
        setError(t("firstRun.toast.minOne"));
        return current;
      }
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chooseBase = async () => {
    try {
      const next = await chooseInstallFolder(base);
      setBase(next);
      setError(null);
    } catch (reason) {
      console.error("[YAYL] cannot choose install folder", reason);
      setError(t("firstRun.saveError"));
    }
  };

  const start = async () => {
    if (!profiles || selectedProfiles.length === 0) return;
    if (!pathValid) {
      setError(t("firstRun.path.invalid"));
      return;
    }
    if (!enoughSpace) {
      setError(t("firstRun.path.space"));
      return;
    }

    const roots: Record<string, string> = {};
    for (const profile of selectedProfiles) {
      roots[profile.id] = joinPath(base, profile.installDir);
    }

    setSaving(true);
    setError(null);
    try {
      const next = await saveFirstRun(lang, roots);
      onSettings(next);
      setStep(3);
    } catch (reason) {
      console.error("[YAYL] cannot save first-run choices", reason);
      setError(t("firstRun.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await completeOnboarding();
      onSettings(next);
      onDone();
    } catch (reason) {
      console.error("[YAYL] cannot finish onboarding", reason);
      setError(t("firstRun.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const visualGame = selectedProfiles[0]?.id ?? "arknights";
  const baseDrive = driveOf(base);

  return (
    <div className="onboarding">
      <div className="onboarding-panel">
        <div className="onboarding-steps">
          {[1, 2, 3].map((number) => (
            <div
              key={number}
              className={
                "onboarding-step" +
                (step === number ? " is-active" : "") +
                (step > number ? " is-done" : "")
              }
              aria-current={step === number ? "step" : undefined}
            >
              <span className="step-num">{String(number).padStart(2, "0")}</span>
              <span>{t(`firstRun.step${number}`)}</span>
            </div>
          ))}
        </div>

        <div className="onboarding-body">
          {step === 1 && (
            <section className="step-panel">
              <div className="onboarding-eyebrow">{t("firstRun.welcome.eyebrow")}</div>
              <h1 className="onboarding-title">{t("firstRun.welcome.title")}</h1>
              <p className="onboarding-desc">{t("firstRun.welcome.desc")}</p>

              <div className="onboarding-form">
                <div className="onboarding-path-label">
                  <span>{t("firstRun.language")}</span>
                </div>
                <div className="language-options">
                  <button
                    className={"language-option" + (lang === "vi" ? " is-active" : "")}
                    type="button"
                    aria-pressed={lang === "vi"}
                    onClick={() => onLang("vi")}
                  >
                    <span className="language-flag">VI</span>
                    <span>
                      <span className="language-name">{t("firstRun.vi")}</span>
                      <span className="language-sub">{t("firstRun.viSub")}</span>
                    </span>
                  </button>
                  <button
                    className={"language-option" + (lang === "en" ? " is-active" : "")}
                    type="button"
                    aria-pressed={lang === "en"}
                    onClick={() => onLang("en")}
                  >
                    <span className="language-flag">EN</span>
                    <span>
                      <span className="language-name">{t("firstRun.en")}</span>
                      <span className="language-sub">{t("firstRun.enSub")}</span>
                    </span>
                  </button>
                </div>
              </div>

              <div className="onboarding-actions">
                <button className="btn btn-primary" type="button" onClick={() => setStep(2)}>
                  {t("firstRun.continue")}
                </button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="step-panel">
              <div className="onboarding-eyebrow">{t("firstRun.games.eyebrow")}</div>
              <h1 className="onboarding-title">{t("firstRun.games.title")}</h1>
              <p className="onboarding-desc">{t("firstRun.games.desc")}</p>

              <div className="onboarding-form">
                <div className="game-select-list">
                  {profiles?.games.map((profile) => {
                    const id = profile.id as GameId;
                    const active = selected.has(profile.id);
                    return (
                      <button
                        key={profile.id}
                        className={"game-select" + (active ? " is-active" : "")}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleGame(profile.id)}
                      >
                        <img
                          className="game-select-thumb"
                          src={`/art/${profile.id}.png`}
                          alt=""
                          onError={(event) => event.currentTarget.classList.add("is-missing")}
                        />
                        <span className="game-select-copy">
                          <span className="game-select-name">{GAMES[id].name}</span>
                          <span className="game-select-meta">
                            <span>
                              {settings.installRoots[profile.id]
                                ? t("firstRun.detected")
                                : t("firstRun.notDetected")}
                            </span>
                            {" · "}
                            {GAMES[id].required}
                          </span>
                        </span>
                        <span className="check-box">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m5 12 4.5 4.5L19 7" />
                          </svg>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="onboarding-path">
                  <div className="onboarding-path-label">
                    <span>{t("firstRun.path.label")}</span>
                    <span>
                      {disk
                        ? t("firstRun.path.freeValue", {
                            drive: baseDrive,
                            free: formatBytes(disk.freeBytes),
                          })
                        : "—"}
                    </span>
                  </div>
                  <div className="path-field">
                    <input
                      className="input"
                      type="text"
                      aria-label={t("firstRun.path.label")}
                      value={base}
                      onChange={(event) => {
                        setBase(event.target.value);
                        setError(null);
                      }}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={() => void chooseBase()}
                    >
                      {t("common.browse")}
                    </button>
                  </div>
                  <div className="disk-note">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
                    </svg>
                    <span>
                      {required !== null
                        ? t("firstRun.path.requiredValue", {
                            size: formatBytes(required),
                          })
                        : "—"}
                    </span>
                    {disk && (
                      <>
                        {" · "}
                        <strong>
                          {t("firstRun.path.freeValue", {
                            drive: baseDrive,
                            free: formatBytes(disk.freeBytes),
                          })}
                        </strong>
                      </>
                    )}
                  </div>
                  {disk && required !== null && !enoughSpace && (
                    <div className="onboarding-error" role="alert">
                      {t("firstRun.path.space")}
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="onboarding-error" role="alert">
                  {error}
                </div>
              )}

              <div className="onboarding-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
                  {t("firstRun.back")}
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={saving || !pathValid || !enoughSpace || selectedProfiles.length === 0}
                  onClick={() => void start()}
                >
                  {saving ? t("firstRun.saving") : t("firstRun.start")}
                </button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="step-panel">
              <div className="success-mark">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 12 4.5 4.5L19 7" />
                </svg>
              </div>
              <div className="onboarding-eyebrow">{t("firstRun.done.eyebrow")}</div>
              <h1 className="onboarding-title">{t("firstRun.done.title")}</h1>
              <p className="onboarding-desc">{t("firstRun.done.desc")}</p>

              <div className="summary-list">
                <div className="summary-row">
                  <span>{t("firstRun.summary.games")}</span>
                  <strong>{selectedProfiles.map((profile) => GAMES[profile.id as GameId].name).join(" · ")}</strong>
                </div>
                <div className="summary-row">
                  <span>{t("firstRun.summary.path")}</span>
                  <strong className="mono">{base}</strong>
                </div>
                <div className="summary-row">
                  <span>{t("firstRun.summary.language")}</span>
                  <strong>{t(lang === "vi" ? "common.vi" : "common.en")}</strong>
                </div>
              </div>

              {error && (
                <div className="onboarding-error" role="alert">
                  {error}
                </div>
              )}

              <div className="onboarding-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={saving}
                  onClick={() => void finish()}
                >
                  {saving ? t("firstRun.saving") : t("firstRun.finish")}
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="onboarding-foot">
          <span>{t("firstRun.footer")}</span>
          <span>v0.1.0 · {t("app.launcher")}</span>
        </div>
      </div>

      <div className="onboarding-visual">
        <img
          className="backdrop-art"
          data-active-art
          src={`/art/${visualGame}.png`}
          alt=""
          onError={(event) => event.currentTarget.classList.add("is-missing")}
        />
        <div className="onboarding-visual-scrim" />

        <div className="onboarding-features">
          <span className="onboarding-feature">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
            </svg>
            <span>{t("firstRun.feature.light")}</span>
          </span>
          <span className="onboarding-feature">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v12" />
              <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <span>{t("firstRun.feature.fast")}</span>
          </span>
          <span className="onboarding-feature">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>{t("firstRun.feature.private")}</span>
          </span>
        </div>

        <div className="onboarding-quote">
          <div className="onboarding-quote-mark">“</div>
          <p>{t("firstRun.quote")}</p>
          <small>{t("firstRun.quoteBy")}</small>
        </div>
      </div>
    </div>
  );
}
