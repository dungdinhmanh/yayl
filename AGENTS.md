# AGENTS.md

Instructions for coding agents working in this repository.

## What this project is

YAYL is a lightweight replacement launcher for the official Yostar launchers for **Arknights EN** and **Stella Sora EN**. It preserves the official game protocol and file formats, but replaces the Electron shell with Tauri 2 and a Rust core.

The repository is in early development. UI work is validated as static HTML in `design/` before it is ported to React.

## Non-negotiable product constraints

- **Lightweight:** installer target ≤ 15 MB, installed app target ≤ 40 MB, idle RAM target ≤ 120 MB, cold start target ≤ 1.5 s. Do not add heavy runtimes or UI libraries without measuring.
- **No telemetry:** no analytics, no log uploads, no background phone-home.
- **Official compatibility:** preserve `manifest.json` and `game-launcher-config.json` semantics. Do not invent a competing on-disk format for game files.
- **No game assets in git:** official art is fetched at runtime and cached locally. The files in `design/assets/img/` are gitignored local copies for review only.
- **i18n from day one:** every user-visible string goes through the i18n layer. Vietnamese is the default; English is the fallback. No hard-coded UI copy in React components.
- **Multi-game by design:** do not special-case Arknights in shared code. Game behavior belongs in profile/config data.

## Stack

- Tauri 2
- React 19 + TypeScript + Vite
- Tailwind CSS 4 + CSS custom properties
- Zustand for UI state
- i18next + react-i18next
- Rust workspace: `crates/yayl-core`, `crates/yayl-cli`
- Bun 1.4.2 for JS package management and scripts; commit `bun.lock`
- Windows first, with a path to Linux support where practical

Do not introduce pnpm, npm, or Yarn lockfiles.

## Repository layout

```text
design/              Static HTML/CSS/JS UI lab (no build step)
  assets/css/        Design tokens and shared styles
  assets/js/         Mock data, i18n, state switcher
  assets/img/        Local-only art copies (gitignored)
docs/                Architecture, reference notes, roadmap, UI decisions
scripts/             Local development helpers
crates/yayl-core/    Protocol, manifest, downloader, installer, process logic
crates/yayl-cli/     Headless diagnostics and integration testing
apps/desktop/        Tauri + React desktop app
```

## Design workflow

1. **Design in `design/` first.** Any change to layout, visual language, or interaction patterns must be prototyped in the static UI lab before it is implemented in React.
2. The lab must work by opening the HTML file directly (`file://`). Do not use ES modules, local `fetch()` of JSON, or external CDNs in `design/`.
3. `design/assets/css/tokens.css` is the source of truth for colors, spacing, typography, radii, and motion. When the React app exists, its token file must mirror these values.
4. Test at **1280×720** and **1100×650**, at 100% and 150% zoom, in both Vietnamese and English.
5. Cover all states, not just the happy path: not installed, update, downloading, paused, verifying, repairing, ready, running, corrupted, offline, auth error, disk full.
6. Prefer progressive disclosure. The home screen should expose one primary action and a small number of secondary actions.

## UI rules

- Dark, full-bleed game art with restrained glass surfaces.
- Per-game accent tokens; never hard-code a game accent in a component.
- Body font: system UI stack. Version/path text: monospace.
- Motion: 150–250 ms, transform/opacity first; respect `prefers-reduced-motion`.
- Do not use `backdrop-filter` on large full-screen areas; reserve blur for the sidebar, modals, and small overlays.
- Minimum window size: 1100×650. Default: 1280×720. The layout must not break at 125%/150% DPI.
- Buttons need visible focus states, disabled states, and loading states.
- Destructive actions require confirmation and show the affected path.
- Do not display raw backend error messages. Map stable error codes to localized copy and keep details behind a diagnostics action.

## Backend / protocol rules

- API base: `https://api-launcher-en.yo-star.com` (EN). JP/KR hosts are supported by profile config.
- Auth header: `{ head: { game_tag, time, version }, sign }`; `sign = MD5(JSON.stringify(head) + data + salt)`.
- Manifest hashes use **CRC-64/XZ**, stored as decimal `u64`.
- Downloads: resumable HTTP Range, `.tmp` files, main/backup CDN fallback, verify before committing.
- Never log auth signatures, tokens, or full headers.
- Keep the API/client layer testable without launching a game.
- Any behavior copied from the official launcher should be documented in `docs/launcher-reference.md` with the observed source.

## Rust conventions

- Format with `cargo fmt`, lint with `cargo clippy -- -D warnings`.
- Prefer typed errors with stable codes over stringly errors.
- Async I/O uses Tokio; do not block the UI thread.
- Filesystem operations must be cancellation-safe and resumable.
- Write tests for manifest diffing, CRC verification, range parsing, and path validation.

## TypeScript conventions

- Strict TypeScript. No `any` in public interfaces.
- Tauri commands are wrapped in `src/lib/ipc.ts`; components do not call `invoke` directly.
- UI state in Zustand stores, split by concern (app, games, downloads, ui).
- Use discriminated unions for game/download states.
- No router unless a real navigation need appears; use explicit view state.
- Lazy-load settings, logs, and other non-home views.

## Verification gates

Before considering a change complete:

```powershell
# Static UI lab
bun run design:check
# Open design/index.html and check the changed screens at 1280×720 and 1100×650.

# Once the app exists:
bun run typecheck
bun run lint
bun run test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Do not claim a command passed unless it was actually run.

## Security and privacy

- Treat all network responses, manifests, file paths, and game metadata as untrusted input.
- Validate paths before deleting or moving files; never allow a manifest path to escape the install root.
- Do not execute downloaded files.
- Do not add auto-update endpoints until the release signing strategy is defined.
- Do not commit secrets, tokens, local logs, or machine-specific paths.

## Commit style

Use Conventional Commits, e.g.:

```text
feat(design): add sidebar home mockup
fix(core): reject manifest paths outside install root
docs: record CRC-64 verification findings
```
