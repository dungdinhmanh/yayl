import type { CSSProperties } from "react";

export type DownloadBadgeState = "idle" | "downloading" | "paused";

const SVG =
  '<svg class="dl-badge__svg" viewBox="0 0 24 24" aria-hidden="true">' +
  '<g class="dl-badge__arrow" transform="translate(12 12) scale(0.75) translate(-12 -12)">' +
  "<g>" +
  '<animateTransform attributeName="transform" type="translate" values="0 -24;0 0;0 0;0 24;0 24" keyTimes="0;0.16;0.52;0.78;1" dur="1.9s" repeatCount="indefinite"></animateTransform>' +
  '<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.16;0.52;0.78;1" dur="1.9s" repeatCount="indefinite"></animate>' +
  '<path d="M12 5v13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></path>' +
  '<path d="m6.5 13 5.5 5.5L17.5 13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>' +
  "</g>" +
  "</g>" +
  '<g class="dl-badge__pause" transform="translate(12 12) scale(0.75) translate(-12 -12)">' +
  '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"></rect>' +
  '<rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"></rect>' +
  "</g>" +
  "</svg>";

interface Props {
  state: DownloadBadgeState;
  size?: string;
  corner?: boolean;
}

export default function DownloadBadge({ state, size = "20px", corner = true }: Props) {
  return (
    <span
      className={"dl-badge" + (corner ? " dl-badge--corner" : "")}
      data-state={state}
      aria-hidden="true"
      style={{ "--dl-badge-size": size } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: SVG }}
    />
  );
}
