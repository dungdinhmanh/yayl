# UI references

Notes from launchers the user asked us to compare against. This is inspiration, not a copy list. Layouts, assets, and brands belong to their owners.

## Starward

Source: `Scighost/Starward` (GitHub), screenshot reviewed locally.

Patterns worth borrowing:

- **Left icon rail** instead of a wide sidebar. Maximum space for key art.
- **Top game switcher** as a row of portrait avatars. Very fast to scan when there are many games.
- **Full-bleed key art** with a dark left-to-right gradient. Text stays readable over busy art.
- **Bottom-left info card** that switches between Events / Notices / Info tabs.
- **Bottom-right primary action** (`Start Game`) with a playtime chip and a settings gear.
- **Very little copy.** Status is shown with icon + short label.
- **Transparency built in**: the app expects Windows transparency/animation effects to be on.

Take: icon rail + top game avatars + bottom-right primary action + top-right stats.

## Twintail Launcher (TTL)

Source: `TwintailTeam/TwintailLauncher` (GitHub), screenshots reviewed locally.

Patterns worth borrowing:

- **Top game avatars** with a selected ring. The selected game drives the whole background.
- **Top-right stats pill**: Playtime and Last played, in a compact glass card.
- **Bottom-left game card**: game name, version, update badge, installed size.
- **Bottom-right actions**: primary button (Install / Update / Queued) with a settings gear next to it.
- **Download Manager**: art background, dark overlay, and a dense stats block:
  - Network, Peak, Disk speeds.
  - Separate progress rows for Downloading and Installing.
  - Per-row bytes, percentage, ETA.
  - A queue list with reorder/start-now/cancel.
- **Settings**: modal-like panel over art, left sub-nav (General, Launch Options, Manage, Uninstall), right cards with toggles/inputs.
- **Custom dialog system** instead of system prompts.
- **Offline / weak-network mode** with auto-pause and limited UI.
- **Playtime, last played, Discord RPC, Prevent Idle** are treated as first-class features.

Take: top-right stats, separate download/install progress, queue, settings sub-nav over art.

## HoYoPlay (installed on this machine)

Findings:

- Installed at `C:\Program Files\HoYoPlay\launcher.exe`.
- Current version directory: `C:\Program Files\HoYoPlay\1.18.0.380\`.
- Architecture: **Qt + CEF** (`libcef.dll`, `QCefView.dll`, `Qt5*.dll`, `HY*.dll`).
- The UI is a CEF web app packed in `resources/feapp.dat`.
- `feapp.dat` is a ZIP archive with encrypted entries; `.NET` and Python `zipfile` can list file names but cannot extract without the password. We did **not** attempt to bypass encryption.
- Visible asset names inside the archive confirm the UI structure:
  - `index.html`, `main_*.css`, `vendors_*.css`, `main_*.js`
  - `images/<game>/hub_background`, `hub_card`, `launcher_background`, `logo`, `icon`
- This confirms HoYoPlay uses a **hub + game card + per-game background** model, but the exact layout cannot be inspected without running it or extracting its encrypted bundle.

Practical consequence for YAYL: we should verify our hub/game-switcher pattern against a live HoYoPlay window before locking M3. If the user wants, we can launch it and capture its window, but that is a side-effecting step and should be approved first.

## Changes applied to YAYL

- Increased text contrast tokens:
  - `--text` → `#f7f9fc`
  - `--text-soft` → `#e3e9f3`
  - `--muted` → `#b8c2d1`
  - `--muted-2` → `#919cad`
  - `--muted-3` → `#707b8d`
  - Borders raised for better separation.
- Brightened small uppercase labels (`meta-label`, `download-stat-label`) and phase copy.
- Legal/help text no longer uses the darkest muted token.

## Source analysis (cloned locally)

Clones are kept outside the repo at `D:\yayl\refs\Starward` and `D:\yayl\refs\TwintailLauncher`. They are reference material only.

### Twintail Launcher (Tauri + React)

Key files reviewed:

- `src/styles/tokens.ts` — design tokens.
- `src/components/layout/ActionBar.tsx` — bottom-right primary action group.
- `src/components/layout/PlayStatsOverlay.tsx` — top-right playtime/last-played pill.
- `src/components/layout/GameInfoOverlay.tsx` — bottom-left game card with version and update badge.
- `src/components/GameButton.tsx` — state-driven primary button (install/update/pause/resume/queued/launch).
- `src/components/pages/DownloadsPage.tsx` — network/peak/disk stats, split download/install bars, speed graph, queue, pause/resume.
- `src/components/sidebar/SidebarDownloads.tsx` — download icon with progress ring and queue badge.
- `src/components/layout/BackgroundLayer.tsx` — preload and crossfade key art, dim overlay when a page/popup is open.

Design facts worth copying:

- Surfaces: `#09090b`, `#0c0c0c`, `#0f0f11`; border `rgba(255,255,255,.05/.1/.2)`.
- Text: white at 90% / 70% / 50% / 30%.
- Radius: 6 / 8 / 12 / 16 px, plus pill.
- Sidebar: 64px icon rail. Action bar `bottom: 2rem; right: 4rem`. Game info `bottom: 2rem; left: 6rem`.
- Primary button is a pill, 224–256px wide, 48px tall, icon + label; color changes by state (purple launch, blue install, green update, amber resume, yellow pause, gray queued).
- Download page shows Network / Peak / Disk, a 60-slot speed graph, two progress bars (download + install), ETA, current file, and a queue with start-now/cancel/reorder.
- Settings is an overlay with a left sub-nav and cards; custom dialogs replace system prompts.

### Starward (WinUI 3)

Key files reviewed:

- `src/Starward/Features/GameSelector/GameSelector.xaml` — game switcher, 40px game icon, 192×108 cards, auto-search installed games.
- `src/Starward/Features/PlayTime/PlayTimeButton.xaml` — 44px acrylic pill with a clock icon and total playtime; opens the stats dialog.
- `src/Starward/Features/GameLauncher/GameLauncherPage.xaml`.
- `src/Starward/Features/GameLauncher/GameNoticeWindow.xaml` — WebView2 host for official announcements.
- `src/Starward.Core/GameNotice/GameNoticeClient.cs` — official announcement URLs and `getAlertAnn` API; supports a "new notice" alert state.
- `src/Starward/Features/Setting/*` — General/Download/File/Gamepad/Screenshot/Advanced/About pages.

Design facts worth copying:

- Transparent header; window controls in a 24px dark pill (`rgba(0,0,0,.46)`).
- No brand or status text in the header.
- Game selector uses 40px icons and 192×108 cards, not a giant wordmark.
- Playtime is a single small pill, not a stat block.
- Official announcements are surfaced, not invented.

### Official launcher (Arknights EN, extracted)

Key files reviewed:

- `out/renderer/assets/main-367052a6.js` — `BannerAndNews` component and `requestBannerAndNews()`.
- `out/renderer/assets/index-1bfaee97.css` — banner/news/social/header/game-control styles.
- `out/renderer/assets/GameControl-537c4a49.css` — bottom action bar.

Facts:

- Data sources: `/api/launcher/operations/resource` for `operations_banner_list` and `news_list`/`notice_list`; `/api/launcher/social/media/resource` for social links.
- Banner: `460×220`, positioned `left: 44px; top: 150px`.
- News panel: `460×144`, tabs + title/date list.
- Header: 56px transparent; only window controls, in a `24px` high `rgba(0,0,0,.46)` pill.
- Bottom control: 165px gradient; primary button `min-width: 200px; min-height: 68px; font-size: 24px`; game version in the bottom-right at `14px`, `opacity: .5`.
- Social media icons at `right: 40px; top: 62px`.
- The key art already contains the game logo. The official launcher does **not** render a second HTML title.

## Applied in this pass

The mockups were rebuilt around the reference facts above.

Home (both variants):

- Removed the header status text, the "Sẵn sàng" status pill, the hero note, the server state block, the meta cards, the folder button, and the hero version/size chips.
- The key art logo is now the only identity on screen; no duplicate HTML title.
- Added the official-style **banner + news** widget (`460×220` banner, tabs + dated news list) using `/api/launcher/operations/resource` data shape.
- Added a TTL-style **playtime / last played** pill at the top-right.
- Added a bottom action bar with a settings gear and one state-driven primary button; a text link appears only when a secondary action is useful (play current version, use existing install, pause/resume, error details, retry, minimize).
- Added a compact bottom-left game card for install/download/repair states only.
- Version is a small bottom-right label (official style).
- Variant A is now a 76px **icon rail** (game avatars + Home/Downloads/Settings), matching TTL/Starward.
- Variant B uses **top game avatars** only (names moved to tooltips).

Settings:

- Removed the "Chuyển game" section.
- Removed the header status pill.
- Game tab now opens with a game hero (art + icon + name + version + update badge + install size), then a single "Bản cài" section with path and tools.
- The active game comes from Home; the rail game avatars still allow switching.

Download:

- Removed the header status note.
- Added a **queue** panel with a queued item and priority/cancel actions.
- Kept the ring, speed chart, phase list, and CRC footer.

## Still open

1. **Download page**: add Network / Peak / Disk stats and split Download vs Install progress rows, like TTL.
2. **Notice alert**: show a small dot on the news tab when Starward-style `getAlertAnn` reports unseen notices.
3. **Social links**: top-right icons from `/api/launcher/social/media/resource`.
4. **Windows transparency**: add a solid fallback when `backdrop-filter` is unavailable.
5. **Game switcher**: show an update badge on the avatar itself.
6. **Settings overlay**: keep the current sub-nav but move it to the custom dialog style used by TTL.

## Skill note

The requested skill `design-ui-ux-promax` is **not installed** in this environment, so it could not be loaded. If you want, we can search the skills ecosystem (`npx skills find "ui ux"`) and install a reputable design skill before the next UI pass.
