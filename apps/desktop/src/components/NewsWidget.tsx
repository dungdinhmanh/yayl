import { useEffect, useMemo, useState } from "react";
import { isTauri, openExternal, type NewsFeed } from "../lib/ipc";
import type { Lang } from "../App";

interface Props {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  news?: NewsFeed | null;
}

type BannerView = {
  id: string;
  image: string;
  kicker: string;
  title: string;
  url: string;
};

type TabView = {
  id: string;
  label: string;
  items: { title: string; date: string; url: string }[];
};

/* The feed is untrusted input: only parsed https URLs are used. */
function safeHttps(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

const safeImage = safeHttps;
const safeLink = safeHttps;

/* The API sends English section ids (`LATEST`, `event`, `contest`). Translate
   the known ones and keep unknown labels untouched. */
const SECTION_KEYS: Record<string, string> = {
  latest: "news.section.latest",
  news: "news.section.news",
  event: "news.section.event",
  events: "news.section.event",
  contest: "news.section.contest",
  notice: "news.section.notice",
  notices: "news.section.notice",
  update: "news.section.update",
  updates: "news.section.update",
};

function sectionLabel(label: string, t: Props["t"]): string {
  const key = SECTION_KEYS[label.trim().toLowerCase()];
  return key ? t(key) : label;
}

export default function NewsWidget({ lang, t, news }: Props) {
  /* The browser lab shows a live feed when the dev bridge returns one and
     falls back to the static feed when it does not. */
  const live = isTauri() || Boolean(news);
  const loading = live && news === undefined;
  const unavailable =
    live &&
    (news === null ||
      (news !== undefined && news.banners.length === 0 && news.sections.length === 0));
  const [mock, setMock] = useState<{ banners: BannerView[]; tabs: TabView[] } | null>(null);

  /* Fixtures are a separate chunk: browser mode only. */
  useEffect(() => {
    if (live) return;
    let active = true;
    void import("../fixtures").then(({ NEWS }) => {
      if (!active) return;
      setMock({
        banners: NEWS.banners.map((item) => ({
          id: item.id,
          image: "",
          kicker: item.kicker[lang],
          title: item.title[lang],
          url: "",
        })),
        tabs: NEWS.tabs.map((tab) => ({
          id: tab.id,
          label: tab.label[lang],
          items: tab.items.map((item) => ({
            title: item.title[lang],
            date: item.date,
            url: "",
          })),
        })),
      });
    });
    return () => {
      active = false;
    };
  }, [live, lang]);

  const data = useMemo(() => {
    /* Mock copy is a lab fallback only: in the app a failed fetch must not
       turn into fake tabs under the "no news" notice. */
    if (!live) {
      return mock ?? { banners: [] as BannerView[], tabs: [] as TabView[] };
    }
    if (!news) {
      return { banners: [] as BannerView[], tabs: [] as TabView[] };
    }
    return {
      banners: news.banners.map((item, index) => ({
        id: `banner-${index}`,
        image: safeImage(item.image),
        /* `remark` is internal CMS metadata, not localized copy: the EN API
           still returns Chinese notes while the banner art is in English. */
        kicker: "",
        title: "",
        url: safeLink(item.url),
      })),
      tabs: news.sections.map((section, index) => ({
        id: `section-${index}`,
        label: section.label ? sectionLabel(section.label, t) : t("news.updates"),
        items: section.items.map((item) => ({
          title: item.title,
          date: item.date,
          url: safeLink(item.url),
        })),
      })),
    };
  }, [live, news, lang, t, mock]);

  const [banner, setBanner] = useState(0);
  const [tabId, setTabId] = useState(() => data.tabs[0]?.id ?? "");
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());

  /* A slide is worth showing when it has art or copy. Live banners carry no
     copy, so one whose image fails (an offline start) is dropped rather than
     left as an empty frame. */
  const slides = useMemo(
    () =>
      data.banners.filter((item) =>
        item.image === "" ? Boolean(item.kicker || item.title) : !broken.has(item.id)
      ),
    [data.banners, broken]
  );

  // A new feed starts from the first banner and first tab.
  useEffect(() => {
    setBanner(0);
    setTabId(data.tabs[0]?.id ?? "");
    setBroken(new Set());
  }, [live, news, data.tabs]);

  useEffect(() => {
    if (banner >= slides.length) setBanner(0);
  }, [banner, slides.length]);

  // A timeout keyed on the current slide: manual navigation restarts autoplay.
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setTimeout(() => {
      setBanner((current) => (current + 1) % slides.length);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [banner, slides.length]);

  const step = (delta: number) => {
    if (slides.length === 0) return;
    setBanner((current) => (current + delta + slides.length) % slides.length);
  };

  const tab = data.tabs.find((item) => item.id === tabId) ?? data.tabs[0];

  const open = (url: string) => {
    void openExternal(url).catch((error: unknown) => {
      console.error("[YAYL] cannot open news link", error);
    });
  };

  return (
    <section className="home-news">
      {loading ? (
        <div className="banner-card news-placeholder" aria-busy="true" />
      ) : unavailable ? (
        <div className="banner-card news-placeholder">
          <span>{t("news.unavailable")}</span>
        </div>
      ) : slides.length > 0 ? (
        <div className="banner-card">
          {slides.map((item, index) => (
            <div
              key={item.id}
              className={"banner-slide" + (index === banner ? " is-active" : "")}
              aria-hidden={index !== banner}
            >
              {item.image !== "" && (
                <img
                  src={item.image}
                  alt=""
                  onError={() =>
                    setBroken((current) => new Set(current).add(item.id))
                  }
                />
              )}
              {(item.kicker || item.title) && (
                <div className="banner-copy">
                  {item.kicker && <div className="banner-kicker">{item.kicker}</div>}
                  {item.title && <div className="banner-title">{item.title}</div>}
                </div>
              )}
            </div>
          ))}
          {slides.length > 1 && (
            <>
              <button
                className="banner-nav banner-nav-prev"
                type="button"
                aria-label={t("news.prev")}
                onClick={() => step(-1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </button>
              <button
                className="banner-nav banner-nav-next"
                type="button"
                aria-label={t("news.next")}
                onClick={() => step(1)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
              <div className="banner-dots">
                {slides.map((item, index) => (
                  <button
                    key={item.id}
                    className={"banner-dot" + (index === banner ? " is-active" : "")}
                    type="button"
                    aria-label={t("news.slide", { n: index + 1 })}
                    aria-current={index === banner}
                    onClick={() => setBanner(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      {(loading || data.tabs.length > 0) && (
        <div className="news-panel">
          <div className="news-tabs" role="tablist" aria-label={t("news.title")}>
            {data.tabs.map((item) => (
              <button
                key={item.id}
                className={"news-tab" + (item.id === tabId ? " is-active" : "")}
                type="button"
                role="tab"
                aria-selected={item.id === tabId}
                onClick={() => setTabId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="news-list">
            {loading ? (
              <div className="news-placeholder-row" aria-busy="true" />
            ) : (
              (tab?.items ?? []).map((item) => {
                const body = (
                  <>
                    <span className="news-title">{item.title}</span>
                    <span className="news-date">{item.date}</span>
                  </>
                );
                if (!item.url) {
                  return (
                    <span key={item.title + item.date} className="news-item">
                      {body}
                    </span>
                  );
                }
                return (
                  <a
                    key={item.title + item.date}
                    className="news-item"
                    href={item.url}
                    rel="noreferrer"
                    onClick={(event) => {
                      event.preventDefault();
                      open(item.url);
                    }}
                  >
                    {body}
                  </a>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
