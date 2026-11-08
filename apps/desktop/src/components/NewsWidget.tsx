import { useEffect, useMemo, useState } from "react";
import { NEWS } from "../data";
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

function asset(path: string) {
  return "/news/" + path.split("/").pop();
}

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

function mockBanners(lang: Lang): BannerView[] {
  return NEWS.banners.map((item) => ({
    id: item.id,
    image: asset(item.image),
    kicker: item.kicker[lang],
    title: item.title[lang],
    url: "",
  }));
}

function mockTabs(lang: Lang): TabView[] {
  return NEWS.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label[lang],
    items: tab.items.map((item) => ({
      title: item.title[lang],
      date: item.date,
      url: "",
    })),
  }));
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

  const data = useMemo(() => {
    if (!live || !news) {
      return { banners: mockBanners(lang), tabs: mockTabs(lang) };
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
  }, [live, news, lang, t]);

  const [banner, setBanner] = useState(0);
  const [tabId, setTabId] = useState(() => data.tabs[0]?.id ?? "");

  // A new feed starts from the first banner and first tab.
  useEffect(() => {
    setBanner(0);
    setTabId(data.tabs[0]?.id ?? "");
  }, [live, news, data.tabs]);

  // A timeout keyed on the current slide: manual navigation restarts autoplay.
  useEffect(() => {
    if (data.banners.length < 2) return;
    const timer = window.setTimeout(() => {
      setBanner((current) => (current + 1) % data.banners.length);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [banner, data.banners.length]);

  const step = (delta: number) => {
    if (data.banners.length === 0) return;
    setBanner(
      (current) => (current + delta + data.banners.length) % data.banners.length
    );
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
      ) : (
        <div className="banner-card">
          {data.banners.map((item, index) => (
            <div
              key={item.id}
              className={"banner-slide" + (index === banner ? " is-active" : "")}
              aria-hidden={index !== banner}
            >
              <img
                src={item.image}
                alt=""
                onError={(event) => event.currentTarget.classList.add("is-missing")}
              />
              {(item.kicker || item.title) && (
                <div className="banner-copy">
                  {item.kicker && <div className="banner-kicker">{item.kicker}</div>}
                  {item.title && <div className="banner-title">{item.title}</div>}
                </div>
              )}
            </div>
          ))}
          {data.banners.length > 1 && (
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
                {data.banners.map((item, index) => (
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
      )}

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
          ) : unavailable ? (
            <div className="news-placeholder-row" />
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
    </section>
  );
}
