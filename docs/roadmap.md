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
- [ ] Minimal Tauri + React scaffold (blank window) to verify the toolchain.

**Exit:** approved static mockups and a building Tauri shell.

## M1 — Protocol and local state

- [ ] Rust workspace: `yayl-core`, `yayl-cli`.
- [ ] Game profile model for EN/JP/KR.
- [ ] Signed API client with redacted logging.
- [ ] Config/version endpoints.
- [ ] Manifest parsing, `vc` hashing, CRC-64/XZ.
- [ ] Local settings/state persistence.
- [ ] CLI: `probe`, `hash`, `diff`.
- [ ] Tests for auth serialization, CRC vectors, manifest diff, path validation.

**Exit:** CLI can probe both games and diff a local install against the live manifest.

## M2 — Downloader, installer, repair

- [ ] Resumable range downloader with bounded concurrency.
- [ ] Main/backup CDN failover and retry policy.
- [ ] `.tmp` lifecycle and resume metadata.
- [ ] CRC verification before commit.
- [ ] Install/update/verify/repair/uninstall.
- [ ] Disk-space and permission preflight.
- [ ] Cancellation-safe operations.
- [ ] Progress event model (4 Hz).
- [ ] Integration test against a local fixture server.

**Exit:** install and update a real game end-to-end, including pause/resume and repair.

## M3 — React UI port

- [ ] Port approved design tokens and components.
- [ ] App shell, home states, download view, settings, first-run.
- [ ] i18next vi/en, all strings localized.
- [ ] Zustand stores and typed IPC wrappers.
- [x] Tray, window lifecycle, close-to-tray.
- [x] Playtime tracking and last-played.
- [x] Mock mode for UI development without backend.
- [x] Accessibility pass and 1100px/150% DPI checks.

**Exit:** complete launcher UI backed by real commands, no placeholder data.

## M4 — Multi-region and quality of life

- [ ] Enable JP/KR profiles.
- [ ] Proxy modes (system/direct/custom), no-proxy list.
- [ ] Bandwidth limit and concurrency settings.
- [ ] Import existing official launcher installs.
- [ ] Background art cache and offline fallback.
- [ ] News/operations panel.
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
