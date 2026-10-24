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
    "game_tag": "Arknights",
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

### Endpoints observed

| Endpoint | Purpose |
|---|---|
| `/api/launcher/game/config` | Game version/config |
| `/api/launcher/base/config` | Base launcher config, background art, notices |
| `/api/launcher/operations/resource` | Operations/news resource |
| `/api/launcher/social/media/resource` | Social media resource |
| `/api/launcher/advanced/game/download/cdn` | CDN selection |
| `/api/launcher/game/config/json` | JSON game config |
| `/api/launcher/advanced/config` | Advanced config |
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

## Download behavior

Observed behavior worth preserving:

- 10 concurrent connections.
- Files are written to `.tmp` paths.
- HTTP Range requests resume partial downloads.
- Main CDN first, then a backup CDN (`-bk` host pattern).
- CRC verification after download; only then commit the final file.
- Manifest/config written after the file set is complete.
- Cancellation preserves partial files for resume unless the user explicitly clears them.

CDN hosts observed:

- `launcher-pkg-ark-en.yo-star.com`
- `launcher-pkg-ss-en.yo-star.com`
- backup variants use `-bk` hosts

## Game identities

| Game | game_tag | Install dir | Executable |
|---|---|---|---|
| Arknights EN | `Arknights` | `Arknights_EN` | `Arknights` |
| Stella Sora EN | `StellaSora` | `StellaSora_EN` | `StellaSora` |

The exact executable extension/path should be resolved per game profile.

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
