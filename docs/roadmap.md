# Roadmap

The order is deliberate: validate the UI as static HTML, then port it to React, then wire the backend. This avoids discovering layout failures after the Rust/Tauri plumbing is in place.

## M0 — Foundation and UI lab

- [x] Create repository, MIT license, editor config, AGENTS.md.
- [x] Document architecture, protocol reference, and roadmap.
- [x] Build `design/` static UI lab:
  - [x] Design tokens and shared components.
  - [x] Home variant A: rail + news.
  - [x] Home variant B: top avatars + news.
  - [x] Download, settings, first-run, UI kit.
  - [x] Vietnamese/English toggle and state switcher.
  - [x] Download badge component, animation options, server-switch concept.
  - [x] Review at 1280×720, 1100×650, 150% zoom.
- [x] Choose home layout and lock design tokens (rail primary, top avatars alternate).
- [x] Minimal Tauri + React scaffold (blank window) to verify the toolchain.

**Exit:** approved static mockups and a building Tauri shell.

## M1 — Protocol and local state

- [x] Rust workspace: `yayl-core`, `yayl-cli`.
- [x] Game profile model for EN/JP/KR.
- [x] Signed API client with redacted logging.
- [x] Config/version endpoints.
- [x] Manifest parsing, `vc` hashing, CRC-64/XZ.
- [x] Local settings/state persistence.
- [x] CLI: `probe`, `hash`, `diff`.
- [x] Tests for auth serialization, CRC vectors, manifest diff, path validation.

**Exit:** CLI can probe both games and diff a local install against the live manifest.

## M2 — Downloader, installer, repair

- [x] Resumable range downloader with bounded concurrency.
- [x] Main/backup CDN failover and retry policy.
- [x] Temporary part-file (`.yayl-part`) lifecycle and resume metadata.
- [x] CRC verification before commit.
- [ ] Install/update/verify/repair/uninstall.
- [ ] Disk-space and permission preflight.
- [x] Cancellation-safe operations.
- [x] Progress event model (4 Hz).
- [ ] Integration test against a local fixture server.

**Exit:** install and update a real game end-to-end, including pause/resume and repair.

## M3 — React UI port

- [x] Port approved design tokens and components (plain CSS + custom properties, no Tailwind).
- [ ] App shell, home states, download view, settings, first-run.
- [x] Hand-written `src/i18n.ts` for vi/en (no i18next); UI copy goes through `t()`.
- [x] React state/hooks and typed IPC wrappers (`src/lib/ipc.ts`); no Zustand store layer.
- [x] Tray, window lifecycle, close-to-tray.
- [x] Playtime tracking and last-played.
- [x] Mock mode for UI development without backend.
- [x] Accessibility pass and 1100px/150% DPI checks.

**Exit:** complete launcher UI backed by real commands, no placeholder data.

## M4 — Multi-region and quality of life

- [x] Enable JP/KR profiles.
- [x] Proxy modes (system/direct/custom), no-proxy list.
- [ ] Bandwidth limit and concurrency settings.
- [ ] Import existing official launcher installs.
- [x] Background art cache and offline fallback.
- [x] News/operations panel.
- [ ] Diagnostics export and log viewer.
- [ ] Optional notifications for download completion.

**Exit:** feature-complete v1 candidate.

## M5 — Release

- [ ] Auto-update design and signing.
- [ ] GitHub Releases pipeline.
- [ ] Portable build option.
- [ ] Crash/error reporting opt-in only.
- [ ] Size/RAM/startup budget verification.
- [ ] Documentation and support page.

**Exit:** signed public release.

## Deferred

- Linux/macOS builds.
- Additional Yostar games.
- Account integration.
- Game mod management.
- Cloud sync.
- Light theme.
- Command palette.
- Plugin system.
