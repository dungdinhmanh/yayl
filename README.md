# YAYL

A lightweight, community-made launcher for **Arknights EN** and **Stella Sora EN**, built to replace the stock Electron launcher with a faster, smaller, and more capable desktop app.

> **Status:** in development. The Tauri 2 + React desktop app and Rust workspace are in place. The multi-game launcher covers Arknights EN and Stella Sora EN with install, download, verify, and repair flows, plus settings, custom backgrounds, and an offline cache of news and social links.

## Why

The official launcher works, but it carries a full Electron/Chromium runtime, a large install footprint, and limited quality-of-life features. YAYL keeps the official game protocol and file formats, then rebuilds the shell around a native Rust core and a small React UI.

UI direction is informed by Starward, Twintail Launcher, and HoYoPlay; see [docs/ui-references.md](docs/ui-references.md).

## Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 19 + TypeScript + Vite |
| Styling | Plain CSS + custom properties (`apps/desktop/src/styles/`) |
| UI state | React state and hooks |
| Core | Rust (`crates/yayl-core`) |
| CLI / diagnostics | Rust (`crates/yayl-cli`) |
| Tauri backend | Rust (`apps/desktop/src-tauri`) |
| Package manager | Bun 1.4.2 |
| i18n | Hand-written module (`apps/desktop/src/i18n.ts`) |
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

The visual language is validated as static HTML in the lab before changes are ported to React. Open the lab directly in Edge/Chrome — no server or build step:

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
crates/              Rust core and CLI
apps/                Tauri desktop app
```

## Development

```powershell
git clone <repo>
cd yayl
bun install
bun run design:open
```

The desktop app lives in `apps/desktop`. Its Vite dev server runs the UI in a browser:

```powershell
cd apps/desktop
bun run dev
# http://localhost:5173
```

Open a specific prototype state with query parameters, for example:

```text
http://localhost:5173/?state=downloading&game=arknights&lang=en
```

`state` accepts any home state (`ready`, `update`, `install`, `downloading`, `paused`, `verifying`,
`running`, `error`, `offline`), `game` is `arknights` or `stella`, and `lang` is `vi` or `en`.

To run the Tauri shell instead of the browser prototype, use `bun run tauri dev` from `apps/desktop`; build a bundle with `bun run tauri build`. Run Rust tests from the repository root with `cargo test --workspace`.

## Logs

The desktop app writes a local log in Tauri's app log directory, `%LOCALAPPDATA%\app.yayl.launcher\logs` on Windows. Only the local file target is enabled; nothing is uploaded. Download, verify, and repair failures are recorded there with their stable error code.

## Legal

YAYL is an unofficial community project. It is not affiliated with Yostar, Hypergryph, or Studio Muscat. Game names, artwork, and trademarks belong to their respective owners. The launcher does not include or redistribute game files.

## License

MIT — see [LICENSE](LICENSE).
