# Animation libraries

Research notes for the download-button effects and future launcher motion.

## Candidates

| Library | Size | License | Fit |
|---|---|---|---|
| **anime.js v3** | ~17 KB min | MIT | Chosen for the static UI lab. Small, simple API, animates DOM/SVG/CSS, works from `file://` as a classic script. |
| Motion One / `motion` | ~2.5–15 KB | MIT | Excellent for the React app; WAAPI-based, tiny, tree-shakeable. Prefer this over anime.js once the React app owns the UI. |
| **GSAP** | ~70 KB min (~28 KB gzip) | GSAP standard "no charge" license, not MIT | Very powerful (timelines, ScrollTrigger). Adds license review and size for a small launcher; not used. |
| animate.css | ~50 KB CSS | MIT | Preset CSS animations for micro-interactions; not suited to progress/liquid effects. |
| Framer Motion | ~30–50 KB | MIT | React-only; good if the React app wants declarative variants, but not usable in the static lab. |

## Decision

- The static design lab uses **anime.js v3**, vendored at `design/assets/vendor/anime.min.js` (MIT).
- The lab never loads a CDN at runtime; vendored files are committed.
- There is a **CSS fallback** for each effect, so the page still animates if the vendor script is missing.
- For the Tauri/React app, prefer **Motion One** or the **Web Animations API** to stay inside the MIT license and the size budget. GSAP is intentionally avoided.

## Effects implemented

`design/assets/js/button-effects.js` enhances the four proposals on `download-animations.html`:

1. **Water drops** — anime.js staggers droplets falling inside the button.
2. **Liquid fill** — a wave element sweeps while the fill breathes.
3. **Running wave** — a blurred band travels across the button.
4. **Running particles** — dots travel along the bottom with a stagger.

CSS keyframes in `app.css` remain as the fallback.

## Guidelines

- One-off, small effects: CSS keyframes.
- Multi-element orchestration: anime.js in the lab, Motion One/WAAPI in the app.
- Always respect `prefers-reduced-motion`; the lab tokens set motion durations to 0 when reduced motion is on.
- Do not add GSAP without an explicit license decision.
