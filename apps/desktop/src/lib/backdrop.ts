/* Re-encode a picked backdrop into the small fallback copy.
 *
 * The asset protocol answers with the window origin in `Access-Control-Allow-
 * Origin`, so `crossOrigin` keeps the canvas readable and `toBlob` usable.
 * JPEG on purpose: canvas WebP encoding is not available in every webview.
 */
import { backgroundSrc } from "./ipc";

const MAX_EDGE = 1920;
const QUALITY = 0.8;
const TIMEOUT_MS = 15000;

/** JPEG bytes for `source`, or `null` when the media cannot be read. */
export async function renderLightBackdrop(
  source: string,
  video: boolean
): Promise<Uint8Array | null> {
  const url = await backgroundSrc(source);
  const media = video ? await loadVideo(url) : await loadImage(url);
  if (!media) return null;

  const width =
    media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const height =
    media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (width <= 0 || height <= 0) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(media, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", QUALITY);
  });
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = url;
  });
}

/* First frame, so an animated image and a video behave the same way. */
function loadVideo(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const finish = (value: HTMLVideoElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);
    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      const seconds = Number.isFinite(video.duration)
        ? Math.min(0.1, video.duration / 10)
        : 0.1;
      if (seconds <= 0) {
        finish(video);
        return;
      }
      video.onseeked = () => finish(video);
      video.currentTime = seconds;
    };
    video.src = url;
  });
}
