# YAYL

A lightweight, community-made launcher for **Arknights EN** and **Stella Sora EN**, built to replace the stock Electron launcher with a faster, smaller, and more capable desktop app.

> **Status:** early development. The repository currently contains the UI design lab and project documentation. The launcher runtime is being built next.

## Why

The official launcher works, but it carries a full Electron/Chromium runtime, a large install footprint, and limited quality-of-life features. YAYL keeps the official game protocol and file formats, then rebuilds the shell around a native Rust core and a small React UI.

UI direction is informed by Starward, Twintail Launcher, and HoYoPlay; see [docs/ui-references.md](docs/ui-references.md).

## Planned stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 19 + TypeScript + Vite + Tailwind CSS 4 |
| Core | Rust (`crates/yayl-core`) |
| CLI / diagnostics | Rust (`crates/yayl-cli`) |
| Package manager | Bun 1.4.2 |
| i18n | i18next + react-i18next |
| License | MIT |

## Scope for v1

- Install, update, repair, verify, and launch Arknights EN and Stella Sora EN.
- Official manifest and `game-launcher-config.json` compatibility.
- Multi-game profiles with JP/KR ready to enable later.
- Concurrent resumable downloads with CRC-64/XZ verification and CDN fallback.
- System/custom proxy support.
- Tray behavior, playtime tracking, and a small settings surface.
- Vietnamese UI by default, English fallback, all strings localized.

No telemetry. No log uploads. No bundled game assets.

## UI design lab

The visual language is being validated as static HTML before it is ported to React. Open the lab directly in Edge/Chrome — no server or build step:

```text
design/index.html
```

Start with `design/home-sidebar.html` (icon rail + news) and `design/home-topbar.html` (top avatars + news) to compare the two home layouts.

To copy the extracted official backgrounds into the lab for realistic review:

```powershell
bun run design:art
```

Those images are ignored by git and are never distributed with the launcher.

## Repository layout

```text
design/              Static UI prototypes and design tokens
docs/                Architecture, launcher reference, roadmap, UI notes
scripts/             Local development helpers
crates/              Rust core and CLI (planned)
apps/                Tauri desktop app (planned)
```

## Development

```powershell
git clone <repo>
cd yayl
bun install
bun run design:open
```

The React prototype lives in `apps/desktop`:

```powershell
cd apps/desktop
bun run dev
# http://localhost:5173
```

Rust and Tauri setup will be documented once the desktop scaffold lands.

## Legal

YAYL is an unofficial community project. It is not affiliated with Yostar, Hypergryph, or Studio Muscat. Game names, artwork, and trademarks belong to their respective owners. The launcher does not include or redistribute game files.

## License

MIT — see [LICENSE](LICENSE).
