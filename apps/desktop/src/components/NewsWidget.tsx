import { useEffect, useMemo, useState } from "react";
import { NEWS } from "../data";
import type { Lang } from "../App";

interface Props {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function asset(path: string) {
  return "/news/" + path.split("/").pop();
}

export default function NewsWidget({ lang, t }: Props) {
  const [banner, setBanner] = useState(0);
  const [tabId, setTabId] = useState(NEWS.tabs[0].id as string);

  // A timeout keyed on the current slide: manual navigation restarts autoplay.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBanner((current) => (current + 1) % NEWS.banners.length);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const step = (delta: number) => {
    setBanner((current) => (current + delta + NEWS.banners.length) % NEWS.banners.length);
  };

  const tab = useMemo(
    () => NEWS.tabs.find((item) => item.id === tabId) ?? NEWS.tabs[0],
    [tabId]
  );

  return (
    <section className="home-news">
      <div className="banner-card">
        {NEWS.banners.map((item, index) => (
          <div key={item.id} className={"banner-slide" + (index === banner ? " is-active" : "")}>
            <img src={asset(item.image)} alt="" />
            <div className="banner-copy">
              <div className="banner-kicker">{item.kicker[lang]}</div>
              <div className="banner-title">{item.title[lang]}</div>
            </div>
          </div>
        ))}
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
          {NEWS.banners.map((item, index) => (
            <button
              key={item.id}
              className={"banner-dot" + (index === banner ? " is-active" : "")}
              type="button"
              aria-label={t("news.slide", { n: index + 1 })}
              onClick={() => setBanner(index)}
            />
          ))}
        </div>
      </div>

      <div className="news-panel">
        <div className="news-tabs">
          {NEWS.tabs.map((item) => (
            <button
              key={item.id}
              className={"news-tab" + (item.id === tabId ? " is-active" : "")}
              type="button"
              onClick={() => setTabId(item.id)}
            >
              {item.label[lang]}
            </button>
          ))}
        </div>
        <div className="news-list">
          {tab.items.map((item) => (
            <a key={item.link + item.date} className="news-item" href={item.link}>
              <span className="news-title">{item.title[lang]}</span>
              <span className="news-date">{item.date}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
