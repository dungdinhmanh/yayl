# Architecture

## Goals

YAYL is a thin, native-feeling launcher around the official Yostar game distribution protocol. The architecture optimizes for:

1. Small install and memory footprint.
2. Correct, resumable, verifiable downloads.
3. Clean separation between protocol logic, OS integration, and UI.
4. Multi-game/multi-region support without game-specific branches in shared code.
5. A UI that can be tested without a live backend.

## Process model

```text
┌─────────────────────────────────────────────────────────────┐
│ Tauri desktop app                                           │
│                                                             │
│  React UI (WebView2)                                        │
│    │  typed invoke / events                                 │
│    ▼                                                        │
│  Tauri command layer (Rust)                                 │
│    │                                                        │
│    ├── yayl-core                                            │
│    │     ├── auth + API client                              │
│    │     ├── game profiles / config                         │
│    │     ├── manifest diff + CRC-64/XZ                      │
│    │     ├── downloader (range, retry, CDN fallback)        │
│    │     ├── installer / verifier / repair                  │
│    │     ├── game process + playtime                        │
│    │     ├── proxy / network settings                       │
│    │     └── cache + local state                            │
│    │                                                        │
│    └── OS integration                                       │
│          ├── tray                                           │
│          ├── notifications (later)                          │
│          ├── autostart                                      │
│          └── single-instance guard                          │
└─────────────────────────────────────────────────────────────┘
```

The UI never performs game API calls or filesystem writes directly. It calls typed commands and subscribes to progress/state events.

## Crates and packages

### `crates/yayl-core`

Library crate with no Tauri dependency. It owns:

- Game profile definitions (EN/JP/KR, future games).
- API authentication and endpoint calls.
- Manifest parsing and diffing.
- CRC-64/XZ verification.
- Download scheduler and resume metadata.
- Install/verify/repair/uninstall operations.
- Process launch and playtime tracking.
- Settings persistence and proxy resolution.

This crate must be usable from `yayl-cli` and tests without a GUI.

### `crates/yayl-cli`

Headless diagnostic binary. Useful for:

- Probing API responses and versions.
- Hashing a file with CRC-64/XZ.
- Inspecting a manifest diff.
- Running a download/verify against a test directory.
- Producing support bundles without the UI.

### `apps/desktop`

Tauri 2 application:

- `src-tauri/` — commands, state wiring, tray, window lifecycle, plugins.
- `src/` — React app, stores, i18n, components.
- `src/lib/ipc.ts` — the only place that calls `invoke`.
- `src/styles/tokens.css` — mirror of the design tokens.

### `design/`

Static HTML/CSS/JS lab. No build step. It is the visual source of truth until the React port is approved. Tokens live in `design/assets/css/tokens.css`.

## Key flows

### First launch

1. UI calls `bootstrap()`; backend loads settings and cached game state.
2. If no settings exist, UI shows onboarding.
3. User selects language, game(s), and install root.
4. Backend validates the path, checks free space, and detects existing installs by reading `game-launcher-config.json`.
5. UI persists settings and returns home.

### Check for updates

1. Backend loads the local official manifest/config.
2. Calls the game config endpoint for the current version and manifest URL.
3. If the remote version differs, fetches the remote manifest and computes a diff.
4. Returns a typed `GameStatus`:
   - `NotInstalled`
   - `Ready { version }`
   - `UpdateAvailable { current, latest, download_size, can_play }`
   - `RepairRequired { reason }`
   - `Downloading { ... }`
   - `Running`
   - `Error { code }`
5. UI renders the matching home state.

### Download

1. Build a file plan from the manifest diff.
2. Allocate N concurrent workers (default 10–16, configurable).
3. For each file: try main CDN, then backup; write to `.tmp`; use HTTP Range to resume.
4. Emit throttled progress events (4 Hz) with bytes, speed, ETA, current file, file counts, and phase.
5. Verify each completed file with CRC-64/XZ before renaming `.tmp` to its final path.
6. After all files, write the official manifest/config and mark ready.
7. Cancellation leaves resumable `.tmp` files by default; explicit "delete partial files" removes them.

### Launch

1. Validate the install and executable.
2. Ensure no other instance of the game is running (or focus it).
3. Apply proxy/launch environment.
4. Spawn the game with the official working directory.
5. Record start time; on exit, update playtime and last-played.
6. Optionally minimize the launcher to the tray while the game runs.

### Repair

- Quick verify: hash files present in the manifest; mark mismatches.
- Full repair: re-download missing/corrupt files; optionally rewrite manifest/config.
- Never delete unknown user files outside the managed file list.

## Data locations

Use Tauri's app data directory, not the install directory, for launcher state:

```text
%APPDATA%\yayl\
  settings.json
  state.json
  cache\
    art\
    news\
  logs\
  downloads\
    <game>\resume.json
```

Game install directories contain only the official game files plus the official manifest/config.

## Protocol notes

The full reference is in [launcher-reference.md](launcher-reference.md). Summary:

- Base API: `https://api-launcher-en.yo-star.com`
- Auth: signed JSON envelope with `head` + `sign`.
- Manifest hashes: CRC-64/XZ as decimal `u64`.
- Version checks and CDN selection come from the game config endpoints.
- Official `vc` value: MD5 of `Object.values(obj).join(";")`, base64-encoded.

## Error model

Backend returns stable codes, e.g.:

```rust
pub struct AppError {
    pub code: ErrorCode,
    pub context: Option<String>, // diagnostics only
}
```

Codes include `network`, `auth`, `manifest`, `disk_space`, `permission`, `crc_mismatch`, `game_running`, `path_invalid`, `cdn_unavailable`, `cancelled`, `unknown`. UI maps codes to localized copy; raw context is only shown in a diagnostics view.

## Performance budgets

| Metric | Target |
|---|---|
| Installer | ≤ 15 MB |
| Installed app | ≤ 40 MB |
| Idle RAM | ≤ 120 MB |
| Cold start to interactive | ≤ 1.5 s |
| Initial JS | ≤ 200 KB gzip |
| Progress event rate | 4 Hz |
| Download concurrency | 10 default, 4–32 configurable |

## Security

- Validate every manifest path is relative and stays inside the install root.
- Reject symlinks/reparse points in managed paths where practical.
- Verify CRC before committing a file.
- Do not execute downloaded content.
- Do not log secrets.
- Auto-update remains disabled until release signing is defined.
