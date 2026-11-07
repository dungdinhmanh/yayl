import type { ReactNode } from "react";
import { openExternal, type SocialLink } from "../lib/ipc";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/* Map known API channel names to icons and localized labels; unknown channels
   get a globe and the API label. */
function iconKey(channel: string): string {
  const value = channel.trim().toLowerCase();
  if (value === "官网" || value === "website" || value === "home") return "website";
  if (value === "x" || value === "twitter") return "x";
  if (value === "facebook" || value === "fb") return "facebook";
  if (value === "discord") return "discord";
  if (value === "youtube") return "youtube";
  return "unknown";
}

const LABEL_KEYS: Record<string, string> = {
  website: "social.website",
  x: "social.x",
  facebook: "social.facebook",
  discord: "social.discord",
  youtube: "social.youtube",
};

const ICONS: Record<string, ReactNode> = {
  website: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M3.8 12h16.4M12 3.8c2.3 2.3 3.4 5 3.4 8.2s-1.1 5.9-3.4 8.2c-2.3-2.3-3.4-5-3.4-8.2S9.7 6.1 12 3.8Z" />
    </>
  ),
  x: (
    <path
      d="M17.5 4h2.9l-6.3 7.2L21.5 20h-5.8l-4.5-5.9L5.9 20H3l6.8-7.8L2.8 4h5.9l4.1 5.4L17.5 4Zm-1 14.3h1.6L7.6 5.6H5.9l10.6 12.7Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  facebook: (
    <path
      d="M13.5 20v-6.3h2.1l.4-2.5h-2.5V9.6c0-.7.2-1.2 1.2-1.2H16V6.2c-.3 0-1.1-.1-2-.1-2 0-3.3 1.2-3.3 3.4v1.7H8.6v2.5h2.1V20h2.8Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  discord: (
    <>
      <path d="M7.4 7.2h9.2a4 4 0 0 1 3.8 5.2l-.9 2.9a3 3 0 0 1-4.6 1.6l-.8-.7h-4.2l-.8.7a3 3 0 0 1-4.6-1.6l-.9-2.9a4 4 0 0 1 3.8-5.2Z" />
      <path d="M9.3 12.3h.01M14.7 12.3h.01" />
    </>
  ),
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3.4" />
      <path d="m10.4 9.6 4.4 2.4-4.4 2.4V9.6Z" fill="currentColor" stroke="none" />
    </>
  ),
};

type SocialLinksProps = {
  links: SocialLink[];
  t: Translate;
};

export default function SocialLinks({ links, t }: SocialLinksProps) {
  if (links.length === 0) return null;

  return (
    <nav className="social-rail" aria-label={t("social.label")}>
      {links.map((link) => {
        const key = iconKey(link.channel);
        const labelKey = LABEL_KEYS[key];
        const label = !link.channel.trim()
          ? t("social.website")
          : labelKey
            ? t(labelKey)
            : t("social.openChannel", { channel: link.channel });
        return (
          <a
            key={`${link.channel}:${link.url}`}
            className="social-link"
            href={link.url}
            title={label}
            aria-label={label}
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault();
              void openExternal(link.url);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[key] ?? ICONS.website}
            </svg>
          </a>
        );
      })}
    </nav>
  );
}
