# UI design

## Direction

- Dark, immersive, full-bleed game art.
- Restrained glass surfaces; no generic dashboard cards everywhere.
- One primary action per state.
- Per-game accent: Arknights amber/orange, Stella Sora violet/cyan.
- Motion is subtle and short (150–250 ms); reduce-motion is respected.
- Vietnamese first; English must fit without layout changes.
- Text contrast is tuned for readability over bright key art; see [ui-references.md](ui-references.md).

## Home layouts

### A — Icon rail + news (recommended)

- 76 px icon rail: game avatars, Home/Downloads/Settings icons. No labels, no server status, no version text.
- Full-bleed key art is the identity; the art already contains the game logo.
- Left side: official-style **banner carousel + news list** from `/api/launcher/operations/resource`.
- Top-right: compact **playtime / last played** pill.
- Bottom-right: one state-driven primary action + settings gear; a text link appears only when useful.
- Bottom-right corner: small version label.
- Bottom-left: compact game card only for install/download/repair states.

### B — Top avatars + news

- Top bar: small YAYL mark, game avatars (names in tooltips), downloads/settings icons, window controls.
- Same lean home content as A: banner + news, stats pill, single primary action.
- Kept as a comparison variant in `design/home-topbar.html`.

## Home states

| State | Primary | Secondary link | Sub-label |
|---|---|---|---|
| Not installed | Cài đặt | Dùng bản đã cài | install size |
| Update available | Cập nhật | Chơi bản hiện tại | current → latest |
| Ready | Chơi | — | Sẵn sàng |
| Running | Đang chạy (disabled) | Thu nhỏ | Đang chơi |
| Downloading | Đang tải · 42% | Tạm dừng | speed · ETA |
| Paused | Tiếp tục tải | — | Đã tạm dừng |
| Verifying | Đang xác minh… | — | CRC-64/XZ |
| Repair required | Sửa nhanh | Xem lỗi | YAYL-CRC-03 |
| Offline | Chơi | Thử lại | Offline |

## Download state

There is no separate Downloads page or tab.

- While downloading, the selected game's avatar border stays the normal selected border; the badge shows the download state, and the primary action button shows progress.
- A game that is downloading but not selected shows the progress border on its avatar.
- The primary button shows the chosen download effect: **rising bubbles** (see below). Proposals live in `design/effects-gallery.html`; the avatar animations live in `design/download-animations.html`.
- Paused switches the badge to a pause icon and the button to a resume state.

### Chosen download effect: rising bubbles

- The horizontal fill grows left to right. Bubbles are born at the start of progress, rise to the surface, and pop at the current front. Upright, this reads as bubbles rising inside the tube.
- Implementation: `design/assets/css/components/bubble-progress.css` + `design/assets/js/bubble-progress.js` (`YAYL_BUBBLES.create(host, { progress })`). Animation via anime.js; the fill still works without it.
- React mirror: `apps/desktop/src/components/BubbleProgress.tsx` + `apps/desktop/src/styles/components/bubble-progress.css` (anime.js as a dependency).
- Applied to the Home primary action button while downloading / paused / verifying. Those states use a dark glass base so the liquid reads; paused tints the fill amber.
- Demo: `design/bubble-progress.html`.
- **Avatar progress ring stays pure CSS**: one SVG path with `pathLength="100"`, `stroke-dashoffset` driven by progress, `transition` for smoothing. No library.

## Settings

- General: language, autostart, close behavior, minimize-on-play, motion, background mode.
- Game: game hero, install path, size, open folder, quick verify, full repair, import, uninstall.
- Network: proxy mode/URL, concurrency, bandwidth limit, CDN preference, timeout.
- Advanced: log level, log folder, clear cache, diagnostics export, reset.
- About: version, build, license, GitHub, disclaimer, update check (later).
- Changes auto-save; show a short “Đã lưu” confirmation. Destructive actions confirm with the affected path.
- No "switch game" section; game switching happens on Home.

## First run

1. Language.
2. Game selection + install root + existing-install detection + disk space.
3. Done, with a summary.

Do not force a theme step; dark is the only v1 theme.

## Window chrome

- Frameless, 40 px custom title bar, draggable region.
- Minimize, maximize/restore, close.
- Close behavior configurable (tray vs exit).
- Default 1280×720; minimum 1100×650.
- Rounded window corners where the OS supports them; fall back cleanly.

## Spacing and type

- Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 (`--space-1` … `--space-10`).
- Content padding: `clamp(22px, 2.8vw, 40px)` instead of a fixed 40px.
- Minimum readable font sizes: 10px uppercase labels, 11px meta/date, 12px body/controls.
- Small screens are not supported. The launcher locks to **1100×650** minimum; the lab shows a full-screen guard below 960×600.
- Test every change at both 1280×720 and 1100×650, and at 125%/150% DPI.

## Locked decisions

- **Home:** rail variant A (76px icon rail + news) is the primary layout. Top-avatar variant B is kept as an alternate.
- **Avatar progress:** rounded-square avatar with a border progress ring that starts at top center and runs clockwise. No second ring. Pure CSS (SVG path + `stroke-dashoffset` + `transition`), no library.
- **Download progress effect:** rising bubbles, standalone component (`design/assets/css/components/bubble-progress.css` + `design/assets/js/bubble-progress.js`). Bubbles spawn at the start of progress and travel to the front. Progress bars use CSS widths, not a library (progressbar.js ~18 KB gzip and NProgress is indeterminate, so both were rejected for the size budget).
- **Download badge:** standalone component (`design/assets/css/components/download-badge.css` + `design/assets/js/download-badge.js`). 20px dark circle, arrow-only glyph, slides in from the top, holds ~0.68s, exits the bottom, loops. Paused switches to a pause icon. Scale with `--dl-badge-size`. Applied to the rail game avatars and the top-avatar tabs.
- **News:** official-style banner carousel + tabbed news list using the `/api/launcher/operations/resource` data shape.
- **Text contrast:** the brighter tokens (`--muted #b8c2d1`, `--muted-2 #919cad`, `--muted-3 #707b8d`).
- **Minimum readable sizes:** 10px uppercase labels, 11px meta/date, 12px body/controls.
- **Minimum window:** 1100×650, with the lab size guard below 960×600.
- **Server switch:** still a concept in `design/server-switch.html`; not locked.

## Design tokens

Defined in `design/assets/css/tokens.css`.

| Token | Value |
|---|---|
| `--bg-0` | `#06080d` |
| `--bg-1` | `#0b0f17` |
| `--bg-2` | `#111826` |
| `--text` | `#f4f7fb` |
| `--muted` | `#98a2b3` |
| `--border` | `rgba(255,255,255,.08)` |
| `--border-strong` | `rgba(255,255,255,.16)` |
| Arknights accent | `#f2b544` |
| Arknights accent 2 | `#ff7a45` |
| Stella accent | `#8b7cff` |
| Stella accent 2 | `#5cc8ff` |
| Success | `#45d6a0` |
| Warning | `#f5b544` |
| Danger | `#ff5d7a` |
| Radius sm/md/lg | 8 / 12 / 18 px |
| Motion fast/base | 150 / 220 ms |

Typography:

- UI: `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`.
- Numeric/version/path: `"Cascadia Mono", "Consolas", monospace`.
- Display: same UI family, weight 700, uppercase, letter-spacing 0.02em.

## UI lab rules

- Open `design/index.html` directly; no build step.
- Use classic `<script>` only; no ES modules, no local `fetch`.
- No external fonts, icons, or CDNs.
- Local art lives in `design/assets/img/` and is gitignored.
- The mock toolbar switches game, state, language, and reduced motion. Use `?ui=0` to hide it.
- Query parameters:
  - `?game=arknights|stella`
  - `?state=ready|update|install|downloading|paused|verifying|error|offline|running`
  - `?lang=vi|en`
  - `?ui=0`
  - `?step=1|2|3` on `first-run.html`
  - `?tab=general|game|network|advanced|about` on `settings.html`

## Review checklist

- All strings fit in Vietnamese and English.
- Long install paths truncate in the middle without hiding the drive.
- 1280×720 and 1100×650 both look intentional.
- 150% zoom does not clip the primary action.
- Keyboard focus is visible on all controls.
- Disabled states are distinguishable from enabled states.
- Offline/error states still allow navigation and access to logs.
- No destructive action is a single click.
