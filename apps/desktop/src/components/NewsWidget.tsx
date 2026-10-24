import { useEffect, useMemo, useState } from "react";
import { NEWS } from "../data";
import type { Lang } from "../App";

interface Props {
  lang: Lang;
}

function asset(path: string) {
  return "/news/" + path.split("/").pop();
}

export default function NewsWidget({ lang }: Props) {
  const [banner, setBanner] = useState(0);
  const [tabId, setTabId] = useState(NEWS.tabs[0].id as string);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBanner((current) => (current + 1) % NEWS.banners.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

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
        <div className="banner-dots">
          {NEWS.banners.map((item, index) => (
            <button
              key={item.id}
              className={"banner-dot" + (index === banner ? " is-active" : "")}
              type="button"
              aria-label={`Slide ${index + 1}`}
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
