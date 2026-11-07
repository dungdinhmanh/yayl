# Security review

**Reviewed revision:** `7297a62` (`2026-11-07`), clean worktree  
**Scope:** Rust core, Tauri command boundary, React webview, and download/launch flows  
**Review type:** source review informed by the [Cloudflare security-audit skill](https://github.com/cloudflare/security-audit-skill). This is not a completed run of that skill.

## Method and limits

The requested skill repository could not be cloned because this environment could not resolve `github.com`. Its published instructions describe a six-phase workflow requiring independent hunter/verifier agents, an OS-enforced source execution sandbox, and Node-based schema/coverage validators. Those requirements could not be met here, so this report does not claim independent validation or complete coverage. `cargo`, `rustc`, `bun`, and `node` are also unavailable; no build or tests were run. Findings below are based on source inspection only and should be revalidated by maintainers before release.

The initial code review was compared against the follow-up source inspection. The initial claim that the game config could escape the install root was withdrawn: `process::resolve` passes the config-derived path through `join_inside`, which rejects absolute and non-normal components. The update-check behavior observation is retained as a validation item rather than a confirmed security vulnerability.

## Confirmed source findings

### 1. Untrusted news URLs reach the WebView as links and image sources

**Priority: Medium**

`OperationsResource::feed` copies remote `jump_url`, `link`, banner image, and thumbnail strings into `NewsFeed` without URL validation (`crates/yayl-core/src/api.rs:330-389`). `NewsWidget` accepts every `https://` prefix for links and both `http://` and `https://` prefixes for images (`apps/desktop/src/components/NewsWidget.tsx:30-37`), then renders them as `href` and `img src` (`NewsWidget.tsx:158-168, 252-265`). A compromised or malformed API response can therefore navigate users to attacker-controlled HTTPS destinations and cause the launcher WebView to make HTTP image requests. This bypasses the stricter URL parser used for social links and external-open commands (`crates/yayl-core/src/api.rs:179-208`, `apps/desktop/src-tauri/src/commands.rs:590-598`).

**Fix:** validate every news/banner/image URL with a parsed URL policy at the API normalization boundary; allow HTTPS only for images and links, and consider restricting link hosts to expected publisher domains if product requirements permit.

### 2. Launch uses a saved install root without the command boundary check

**Priority: Medium**

Install-root commands such as `download_status` and `start_download` use `ensure_allowed_root` (`apps/desktop/src-tauri/src/download.rs:252-280`), which restricts a path to the default or saved root. `launch_game` instead loads the path from settings and passes it directly to `damaged_files` and `launch` (`apps/desktop/src-tauri/src/commands.rs:396-416`). A malformed or manually modified settings file can consequently direct the launcher to run a configured executable from another absolute directory. The same saved-path trust pattern appears in `game_version` (`commands.rs:620-635`).

**Fix:** route saved roots through the same root validation used by other commands before reading metadata or launching. Treat a bad saved root as an error instead of using it.

## Needs validation (not confirmed vulnerabilities)

### Manifest total-size overflow

`Manifest::total_bytes` sums untrusted manifest sizes with ordinary `u64` addition (`crates/yayl-core/src/manifest.rs:64-100, 103-112`). The parsed values can individually be any `u64`; combined values above the type range may overflow or panic depending on build configuration. The impact and exact production behavior were not reproduced because no Rust toolchain is available. Validate with a bounded local fixture in both debug and release builds; if confirmed, reject cumulative overflow using checked addition during parse/planning.

### Update detection and minimum-version enforcement

The UI bootstrap loads settings and download status but does not fetch `game_version` (`apps/desktop/src/App.tsx:202-280`). `launch_game` does not itself compare the installed version with the server's latest or minimum version (`apps/desktop/src-tauri/src/commands.rs:396-416`). This appears to leave the intended update/minimum-version flow disconnected, but whether the UI exposes a usable stale state elsewhere and what the publisher requires needs validation. Trace the full installed-game state transitions and compare with the official launcher behavior before classifying as a security issue.

### Local manifest completeness and launch integrity

`LocalManifest::validate` silently drops file entries with invalid per-file checksums (`crates/yayl-core/src/local_manifest.rs:96-108`), while `damaged_files` checks sizes only for entries remaining after validation (`crates/yayl-core/src/process.rs:92-118`). This can reduce the checked file set. However, the manifest is local user-writable state, and it is not established whether this crosses a security boundary beyond the same user's control. Determine the intended trust model and whether partial valid metadata can be produced by an untrusted input before treating it as a vulnerability.

## Comparison summary

- **Both reviews identified:** the news URL validation gap and launch-time install-root inconsistency.
- **Initial review only, retained as needs validation:** unchecked aggregate manifest size and update/minimum-version flow.
- **Downgraded to needs validation:** local manifest completeness; impact depends on the local metadata trust model.
- **Withdrawn after checking the call chain:** arbitrary executable path through game config; `join_inside` rejects absolute and non-normal path components.
- **Not assessed as findings:** generic hardening suggestions without a demonstrated boundary failure.

## Coverage statement

This is a partial, source-only review. It did not include the skill's coverage ledger, independent agent checks, structured findings/schema validation, sandboxed reproductions, dependency audit, or release pipeline audit. It makes no claim that all security issues have been found.
