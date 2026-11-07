# Launcher reference

Notes from the extracted official launchers. This is a behavioral reference, not copied source.

## Extracted targets

| Target | Path |
|---|---|
| Arknights EN launcher | `game-extracted/A9_extracted` |
| Stella Sora EN launcher | `game-extracted/SS_extracted` |

Useful files:

- `A9_extracted/out/main/index.js` — main process, IPC, API calls, launch/uninstall.
- `A9_extracted/out/main/index-8b10f6cc.js` — downloader worker, manifest diff, CRC verification.
- `A9_extracted/out/renderer/assets/main-367052a6.js` — renderer calls and UI flow.
- `A9_extracted/out/preload/index.js` — IPC channel contract.
- `A9_extracted/node_modules/@launcher/utils/src` — auth, manifest hashing, proxy, process, file helpers.
- `SS_extracted/out/main/index.js` — Stella Sora differences and uninstall registry key.
- `SS_extracted/manifest.json` — real manifest sample.
- `SS_extracted/test-crc64.js` — CRC-64 usage reference.

## API

### Hosts

- EN: `https://api-launcher-en.yo-star.com`
- JP: `https://api-launcher-jp.yo-star.com`
- KR: `https://api-launcher-kr.yo-star.com`

The host is selected by game profile/region.

### Auth envelope

Requests carry a signed envelope:

```json
{
  "head": {
    "game_tag": "Arknights_EN",
    "time": 1710000000,
    "version": "1.0.0"
  },
  "sign": "..."
}
```

`sign = MD5(JSON.stringify(head) + data + salt)`, where the salt observed in the extracted launcher is:

```text
DE7108E9B2842FD460F4777702727869
```

`data` is the serialized request payload used for the signature. Keep the exact serialization order stable.

Source: `A9_extracted/node_modules/@launcher/utils/src/crypto.ts:16-29`. The EN launchers sign `game_tag` as the store id (`Arknights_EN`, `StellaSora_EN`), not the short game name; see `A9_extracted/out/main/index.js:887-892` and `SS_extracted/out/main/index.js:890-892`.

### Endpoints observed

| Endpoint | Purpose |
|---|---|
| `/api/launcher/game/config` | Game version/config |
| `/api/launcher/base/config` | Base launcher config, background art, notices |
| `/api/launcher/operations/resource` | Operations/news resource |
| `/api/launcher/social/media/resource` | Social media resource |
| `/api/launcher/advanced/game/download/cdn` | CDN selection |
| `/api/launcher/game/config/json` | JSON game config |
| `/api/launcher/installation/config` | Installer background and protocol text |
| `/api/launcher/advanced/config` | Advanced config (`log_upload`) |
| `/api/open/api/config` | Open API config |

The live contract was probed successfully. Arknights EN and Stella Sora EN responded with the expected shapes.

### Live versions observed

| Game | Region | Version |
|---|---|---|
| Arknights | EN | `042.0.0` |
| Arknights | JP | `37.7.41` |
| Arknights | KR | `42.0.0` |
| Stella Sora | EN | `2.0.0` |
| Stella Sora | JP | `2.0.0` |
| Stella Sora | KR | `2.0.0` |

Versions are examples and will change. Never hard-code them.

## Manifest and hashing

- Manifest entries contain relative paths, sizes, and CRC-64/XZ hashes.
- The hash is stored as a decimal `u64`.
- CRC-64/XZ was verified against a real CDN file: expected `5943362273480959350`.
- The official launcher's `vc` value is `MD5(Object.values(obj).join(";"))`, encoded as base64.
- Preserve the official `manifest.json` and `game-launcher-config.json` formats; third-party tools and the game itself may read them.

### Local metadata shape

Observed in `A9_extracted/out/main/index-8b10f6cc.js:18902-18918`:

```json
{
  "name": "Arknights_EN",
  "version": "042.0.0",
  "basis": "prod/ZIP_TEMP/Arknights_EN_TEMP/Arknights_EN-042.0.0-game.zip",
  "vc": "...",
  "files": [
    { "path": "/Arknights.exe", "hash": "1726476550168236827", "size": "675304", "vc": "..." }
  ]
}
```

`game-launcher-config.json` uses camelCase:

```json
{
  "tag": "Arknights_EN",
  "name": "Arknights",
  "params": [],
  "version": "042.0.0",
  "gameUninstallScript": "",
  "vc": "..."
}
```

`basis` is the API's `game_latest_file_path`, not the manifest `source`. The `vc` field order is part of the format; do not reorder fields.

The Stella Sora EN 1.6.0 launcher writes a compact config with only `tag`, `name`, and `version` (`out/main/index-5140da1c.js:18874-18883`). Older launchers and YAYL also write `params` and `gameUninstallScript`. Both shapes are self-consistent because `vc` hashes every value in the file, so readers must accept either set of fields. YAYL's reader picks the hash that matches the fields present, so adding `params` to a compact config invalidates it.

## Launch behavior (Stella Sora EN 1.6.0)

Observed in `out/main/index.js:19616-19681`:

- Before spawning, `LocalGameStartCheck` compares every manifest file size against disk (`checkStat`, line 19505). If any file is missing or has the wrong size, the launcher emits `start-game-damage` and refuses to start. The renderer then offers repair.
- The executable base name comes from the local `game-launcher-config.json` (`handle-check-game`, line 19682), not directly from `game/config`. The launcher appends `.exe` and calls `shell.openPath("<root>/<name>.exe")`.
- `game_start_params` is not passed by the 1.6 launcher: `handle-game-start` only receives `{ path, name }`. Current API responses return an empty array for both games.
- The launcher minimizes itself after a successful spawn and does not track the game PID.
- `clickCode` is installer attribution. At startup the launcher reads a `clickCode` file next to its own executable, extracts the installer code, and stores it in Electron `userData`. Opening the game folder copies that code into `<root>/clickCode` (`out/main/index.js:340-407`). It is optional and does not affect whether the game starts.
- `AntiCheatExpert` (ACE) ships as ordinary manifest files. The launcher does not install, elevate, or start it; the game handles ACE itself.

YAYL mapping:

- `process::resolve` reads `name` and `params` from `game-launcher-config.json`, appends `.exe` when needed, and falls back to the profile executable.
- `process::damaged_files` performs the size-only pre-launch check against the local manifest. A missing manifest skips the check so an imported install can launch; a corrupt manifest is rejected.
- YAYL spawns and tracks the game PID to record playtime; the official launcher does not.
- YAYL does not write `clickCode`, does not upload logs (`advanced/config` `log_upload`), and does not use the installer background endpoint.

## Download behavior

Observed behavior worth preserving:

- 10 concurrent connections.
- Files are written to `.tmp` paths.
- HTTP Range requests resume partial downloads.
- Main CDN first, then a backup CDN (`-bk` host pattern).
- CRC verification after download; only then commit the final file.
- Manifest/config written after the file set is complete.
- Cancellation preserves partial files for resume unless the user explicitly clears them.

Download URL composition (`A9_extracted/out/main/index-8b10f6cc.js:18669-18683`):

```text
<cdn-host>/<manifest.source>/<manifest file path>
```

`manifest.source` and file paths both start with `/`; join them without duplicating slashes. The CDN serves individual files, not zip parts. `game_latest_file_path` is only the basis passed to the manifest endpoint.

YAYL-specific resume state (not read by the game):

- `<file>.yayl-part` — partial bytes.
- `<file>.yayl-part.ckpt` — last synced length; used to discard a tail that may not have reached disk before a power loss.

CDN hosts observed:

- `launcher-pkg-ark-en.yo-star.com`
- `launcher-pkg-ss-en.yo-star.com`
- backup variants use `-bk` hosts

## Proxy behavior

Observed in `A9_extracted/node_modules/@launcher/utils/src/proxy.ts` and the `ProxyManager` class in `A9_extracted/out/main/index.js:788-840`.

The official launcher exposes two user-facing modes:

| Mode | Behavior |
|---|---|
| `direct` | Default. No proxy. Clears proxy environment variables. |
| `system` | Reads the operating-system proxy settings. |

The renderer stores the selection as `proxy-config` in local storage and defaults to `direct` (`main-367052a6.js:2471-2492`).

Windows system proxy:

- Registry key: `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`.
- Reads `ProxyEnable`, `ProxyServer`, and `ProxyOverride`.
- `ProxyEnable` must be `0x1`; otherwise no proxy is returned.
- `ProxyServer` forms:
  - `host:port` → treated as `http://host:port`.
  - `http://...` or `https://...` → used as-is.
  - `http=host;https=host;socks=host` → prefers `http`, then `socks` (as `socks://`), then `https` (as `http://`).
- `ProxyOverride` is split on `;` into the bypass list.
- `localhost`, `127.0.0.1`, and `::1` are always appended to the bypass list.
- `ProxyManager` polls the system proxy every 5 seconds and updates Electron sessions when the value changes.
- On non-Windows platforms it reads `HTTPS_PROXY`, `HTTP_PROXY`, `https_proxy`, `http_proxy`, and `NO_PROXY`/`no_proxy` from the environment.

When a proxy is active, the launcher exports `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, `https_proxy`, `no_proxy`, and `grpc_proxy`. For SOCKS it also sets `SOCKS_PROXY` and `ALL_PROXY`. In direct mode it deletes those variables.

YAYL mapping:

- `ProxyMode::Direct` — same default as the official launcher.
- `ProxyMode::System` — same WinINET registry read on Windows, then environment fallback when the registry has no active proxy; environment only on non-Windows platforms.
- `ProxyMode::Manual` — YAYL extension for an explicit HTTP/HTTPS/SOCKS URL and `no_proxy` list.

## Game identities

| Game | game_tag | Install dir | Executable |
|---|---|---|---|
| Arknights EN | `Arknights_EN` | `Arknights_EN` | `Arknights.exe` |
| Stella Sora EN | `StellaSora_EN` | `StellaSora_EN` | `StellaSora.exe` |

The executable path is resolved from the local `game-launcher-config.json` when present, with the profile value as the fallback. `game_tag` is the value used in the signed API header.

## Uninstall differences

Stella Sora additionally removes:

```text
HKCU\Software\RoamingStar\StellaSora
```

Do not remove registry keys for Arknights unless observed and documented.

## UI/behavior notes from the official launcher

- Full-bleed key art with a dark overlay.
- One primary play/update/install action.
- Version and download size displayed near the action.
- Download screen replaces the home content during an active download.
- Settings cover install path, proxy, and basic launcher behavior.
- The official shell is Electron; YAYL replaces it with Tauri.

## Open questions

- Exact minimum-version enforcement (`game_lowest_version`) per region.
- Whether launching an outdated but above-minimum install is officially supported in all cases.
- CDN selection response semantics under failover.
- Full uninstall registry/file list for Arknights.
- Auto-update signing and release channel design.
