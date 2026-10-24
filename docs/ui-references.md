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

## Recommended next UI pass (not applied yet)

These need a layout decision before porting to React:

1. **Top-right stats pill** on Home: Playtime + Last played, glass style, always visible.
2. **Bottom-right primary action** on Home: primary button + settings gear + folder icon; move the meta cards to a bottom-left game card.
3. **Left icon rail** as a third Home variant (`home-immersive.html`) inspired by Starward/TTL:
   - 76px rail, top game avatars, full-bleed art, bottom-left game card, bottom-right actions.
   - Keep sidebar and top-tabs variants for comparison.
4. **Download page**: add Network / Peak / Disk stats and split Download vs Install progress rows.
5. **Download queue**: a list with reorder / start-now / cancel. Future milestone, but design the slot now.
6. **Settings overlay**: keep left sub-nav; add a custom dialog style consistent with the app.
7. **Game switcher**: portrait avatars with a selected ring; show update badge on the avatar.
8. **Art treatment**: dark gradient must always cover the text side; add a contrast setting for bright art.
9. **Windows transparency**: design assumes `backdrop-filter` works; add a solid fallback for Windows 10 without transparency effects.

## Skill note

The requested skill `design-ui-ux-promax` is **not installed** in this environment, so it could not be loaded. If you want, we can search the skills ecosystem (`npx skills find "ui ux"`) and install a reputable design skill before the next UI pass.
