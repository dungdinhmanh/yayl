import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import anime from "animejs";

interface Props {
  /** Progress from 0 to 1. */
  progress: number;
}

/**
 * Chosen download effect: bubbles are born at the start of progress and rise
 * to the surface (the progress front), then pop. Laid flat, "rising" reads as
 * travelling left to right. Renders only the effect; the caller keeps the
 * label above it.
 */
export default function BubbleProgress({ progress }: Props) {
  const layerRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const spawn = () => {
      const host = layer.parentElement;
      if (!host) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;

      const front = w * progressRef.current;
      const size = 4 + Math.random() * 11;
      if (front < size + 14) return;

      const startX = 4 + Math.random() * 8;
      const targetX = Math.max(startX + 12, front - size * 0.6);
      const y = size / 2 + 4 + Math.random() * Math.max(1, h - size - 8);
      const wobble = 3 + Math.random() * 6;

      const bubble = document.createElement("span");
      bubble.className = "bp__bubble";
      bubble.style.left = `${startX}px`;
      bubble.style.top = `${y - size / 2}px`;
      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      layer.appendChild(bubble);

      anime({
        targets: bubble,
        translateX: [0, targetX - startX],
        translateY: [0, -wobble, 0, wobble, 0],
        scale: [0.7, 1.05, 1.18, 1.3],
        opacity: [0, 1, 1, 0],
        duration: 900 + Math.random() * 800,
        easing: "easeInOutSine",
        complete: () => {
          bubble.remove();
        },
      });
    };

    const timer = window.setInterval(spawn, 200);
    spawn();
    return () => {
      window.clearInterval(timer);
      anime.remove(Array.from(layer.querySelectorAll(".bp__bubble")));
      layer.replaceChildren();
    };
  }, []);

  return (
    <div className="bp" style={{ "--bp-p": String(progress) } as CSSProperties} aria-hidden="true">
      <div className="bp__fill" />
      <span className="bp__layer" ref={layerRef} />
    </div>
  );
}
