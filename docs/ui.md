# UI design

## Direction

- Dark, immersive, full-bleed game art.
- Restrained glass surfaces; no generic dashboard cards everywhere.
- One primary action per state.
- Per-game accent: Arknights amber/orange, Stella Sora violet/cyan.
- Motion is subtle and short (150–250 ms); reduce-motion is respected.
- Vietnamese first; English must fit without layout changes.

## Home layouts

### A — Sidebar + hero (recommended)

- 232 px sidebar: game switcher, Home/Downloads/Settings, connection status, version.
- Full-bleed hero art behind the main area.
- Game wordmark, region, version, status pill, primary CTA, secondary actions.
- Three meta cards at the bottom: playtime, install path, last played.
- Scales to more games/regions and future pages.

### B — Top tabs + hero

- Top bar: logo, game tabs, settings icon, window controls.
- Full-bleed hero with a bottom action/stat strip.
- Closer to the official launcher; less room for future navigation.
- Kept as a comparison variant in `design/home-topbar.html`.

## Home states

| State | Primary | Secondary | Notes |
|---|---|---|---|
| Not installed | Cài đặt | Chọn thư mục | Show required size and free space |
| Update available | Cập nhật | Chơi ngay (if ≥ minimum) | Show current → latest and download size |
| Ready | Chơi | Kiểm tra | Standard state |
| Running | Đang chạy | Thu nhỏ | Pulsing indicator; launch disabled |
| Downloading | Đang tải · 42% | Tạm dừng | Progress dock links to download view |
| Paused | Tiếp tục tải | Hủy | Preserve partial files |
| Verifying | Đang xác minh… | — | Indeterminate or per-file progress |
| Repair required | Sửa nhanh | Xem lỗi | Error banner explains the cause |
| Offline | Chơi | Thử lại | Cached state; update/repair disabled |
| API/auth error | Thử lại | Xem chi tiết | Stable error code, no raw message |

## Download view

- Circular progress + percentage, speed, ETA, downloaded/total.
- Phase stepper: Chuẩn bị → Tải xuống → Xác minh → Cài đặt → Hoàn tất.
- Current file, file count, CDN, connection count.
- Actions: pause/resume, cancel (confirm), minimize.
- Error card: code, file, retry, switch CDN, open log.
- Full file list lives behind a details action; do not render thousands of rows by default.

## Settings

- General: language, autostart, close behavior, minimize-on-play, motion, background mode.
- Game: per-game path, detect, open folder, quick verify, full repair, uninstall, import.
- Network: proxy mode/URL, concurrency, bandwidth limit, CDN preference, timeout.
- Advanced: log level, log folder, clear cache, diagnostics export, reset.
- About: version, build, license, GitHub, disclaimer, update check (later).
- Changes auto-save; show a short “Đã lưu” confirmation. Destructive actions confirm with the affected path.

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
