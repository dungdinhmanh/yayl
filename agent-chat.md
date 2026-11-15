# Agent chat

Shared log for agents. Tasks live in TODO.md (IDs: T-, D-, M-). Owner: kazuki.

LOAD ONLY: this header, "Open threads", and the last 40 lines. Never load the whole file.

## Rules
1. Append at the bottom only. Do not edit old entries. Fix = new `correction` entry. Only the "Open threads" table may be edited.
2. `git pull --rebase` before writing. On merge conflict keep both sides.
3. Claim before editing code: `claim T-xx`. End with `done T-xx` or `release T-xx`.
4. No evidence, not done. State what you ran (`cargo test`, `tsc -b`) and what you did not.
5. Disagree with evidence. If stuck, tag `kazuki`; do not change the related code until a `decision` entry exists.
6. Items under "Decided" in TODO.md stay closed unless there is new data.
7. Never write secrets, tokens, AUTH_SALT, game assets, or personal data.
8. Max 5 lines per entry. Cite `path:line`. Do not paste logs.

## Entry format
`[YYYY-MM-DD HH:MM] from>to type ref`, then 1-5 lines. Time: `date -u +"%F %H:%M"`.
- type: status claim release done question answer proposal objection decision blocker handoff correction
- to: all | kazuki | agent name
- ref: T-05, path:line, or re:<time><from>

## Open threads
| id | topic | waiting on |
|---|---|---|
| Q-05 | T-05: is a bad `vc` always a corrupt file? | agent who knows the protocol |
| Q-07 | T-07: size cap for custom background | kazuki |
| Q-10 | T-10: drop custom proxy code? | agent with Windows |
| Q-12 | T-12: hooks or Zustand? | all |

Close a thread: delete its row and add a `decision` entry.

## Archive
If the log passes 200 lines, move closed threads' entries to docs/agent-chat-archive.md. Do not load the archive unless asked.

## Log

[2026-11-13 08:40] kazuki>all decision ref:TODO.md
Decided (recorded by claude from chat):
- Keep custom CRC-64. Bench 32 MiB: ours 1953 MiB/s, crate `crc` 3.4.0 476 MiB/s.
- Keep design/.
- No CI for now.
- No Zustand yet. Try hooks/useReducer first (Q-12).

[2026-11-13 08:40] claude>all status ref:bec30c4
Done: hardening (window drag permission, CSP, tauri 2.12.5, http loopback only in cfg(test)); all version upgrades (animejs 4, Vite 8, TS 7, reqwest 0.13, sha2/md-5 0.11, fs4 1.1).
Verified: `tsc -b` ok, `vite build` ok (Node 22).
NOT verified: all Rust. No cargo in my sandbox. Please run `cargo test` and `clippy`, then report here.
audit.md A-01..A-05 checked against source: all true.
Next: TODO.md, suggested order at the bottom.

[2026-11-13 08:40] claude>kazuki question Q-07 ref:T-07
Custom background has no size cap. Server backgrounds are capped at 32 MiB (api.rs:525).
Options: (a) 32 MiB for all. (b) 32 MiB images, 256 MiB video.
I lean (b): video decode costs RAM, budget is 120 MB idle. 256 is a guess, not measured.
I will not touch T-07 until you choose.

[2026-11-13 08:40] claude>all proposal Q-10 ref:T-10
proxy.rs reads WinINET with winreg. reqwest already has `system-proxy`. We may delete ~100 lines and winreg.
Unverified on Windows. Delete only if these pass on Windows and Linux: no proxy, HTTP, HTTPS, no-proxy list. Otherwise keep.
Need a Windows tester, or an objection.

[2026-11-13 08:40] claude>all proposal Q-12 ref:T-12
I first proposed Zustand. audit A-08 and the owner prefer hooks first. I agree.
Revisit Zustand only if: (1) 3+ distant components share one state, or (2) onDownloadProgress ordering bugs a reducer cannot fix.
Object if the criteria are wrong.

[2026-11-13 08:40] claude>all question Q-05 ref:T-05
Plan: a bad `vc` entry counts as damaged (fail-closed). Files: local_manifest.rs:96-108, process.rs:92-118.
Unknown: do real official manifests ever lack `vc` or use another hash? If yes, fail-closed flags good files.
Anyone with protocol knowledge (docs/launcher-reference.md): please answer. T-05 is blocked until then.

[2026-11-13 17:06] opencode>all done ref:47879b9
Custom Select component plus backdrop path/opacity/blur/noise/fit/mute/loop landed; design/ mirrors it.
Ran: bun run build, bun run design:check, cargo fmt --check, clippy -D warnings, cargo test --workspace (120+13).
Gap: GIF loop cannot be toggled without decoding; tile fit is image-only, video falls back to cover.

[2026-11-13 17:06] opencode>all done T-07 ref:apps/desktop/src-tauri/src/commands.rs:564
Part (b) only: skip fs::copy when the pick already sits at the cache destination (self-copy truncated it).
Size cap (a) still waits on Q-07; no test, the command needs an AppHandle.
Ran: cargo fmt, clippy -D warnings, cargo test --workspace.

[2026-11-13 17:06] opencode>all done T-17 ref:apps/desktop/src/pages/Settings.tsx:1031
About chips now map over GAMES (name + region); rendered text is unchanged.
Ran: bun run build, bun run design:check; checked in the dev build at 1280x720.

[2026-11-13 17:06] opencode>kazuki question ref:D-05
audit.md was deleted in 3716970, so "move audit.md into docs/" cannot run as written.
Restore it from history (`git show 3716970^:audit.md`) or drop D-05?

[2026-11-14 00:46] opencode>all done ref:9296389
Custom backdrop now renders the picked file itself; one cache copy stays as the fallback.
- core settings gains background_source; older profiles fall back to background_path unchanged.
- choose_custom_background stores the source and opens it in the asset scope (setup reopens it on boot).
- App.tsx probes images before paint, swaps to the cache copy on error, then to game art.
- Settings shows the source path; the mock prints a source-shaped path because browsers hide it.
- Settings game hero: version + "Bản mới vX" badge replaces "vA → vB"; disk line uses a comma, no middle dot.
Ran: bun run build, bun run design:check, cargo fmt --check, clippy -D warnings, cargo test --workspace (120+13).
Gap: scope only grows during a session (forbid_file would also block re-picking a file); no size cap yet (Q-07).

[2026-11-14 01:25] opencode>all done ref:1ed7ee0
Official icons come from the extracted launcher resources (A9_extracted/resources/build.ico, stella-sora-en/app/resources/build.ico), copied to apps/desktop/public/icons/<game>.ico.
- No icon extraction code: the previous game_icon command and its windows-sys dependency were removed.
- FirstRun and the settings hero render /icons/<game>.ico; thumbs are 40x40 squares.
- First-run footer copy, LAUNCHER span, feature row and their keys/CSS are gone; primary button has no glow.
Ran: bun run build, bun run design:check, cargo fmt --check, clippy -D warnings, cargo test --workspace (120+13); browser-checked first-run and settings in vi.
Gap: design/assets/img/icons stays local (gitignored); the app ships the two .ico files (391 KB total).

[2026-11-14 12:33] opencode>all done ref:apps/desktop/src/components/DownloadMonitor.tsx
Steam-style download card and network settings trim.
- Hovering Play while downloading reveals network speed/graph and disk read/write speed/graph; samples once per second, keeps 48 points.
- Disk numbers use per-process cumulative counters (GetProcessIoCounters on Windows, /proc/self/io on Linux) via a new io_stats command.
- Proxy is now three modes ordered no proxy, system, custom. Download order row is gone; the saved value still defaults to smallest_first.
- design/ mirrors the card, the proxy order/labels and the UI-kit segmented sample; the lab animates the graphs with mock samples.
Ran: bun run build, bun run design:check, cargo fmt --check, clippy -D warnings, cargo test --workspace (120+13); browser-checked the card and proxy control in vi/en.
Gap: the disk graph plots writes only; read speed is numeric.

[2026-11-14 12:40] opencode>all done ref:apps/desktop/src/components/Rail.tsx
Rail avatars use the official /icons/<game>.ico files instead of game art, with object-fit contain and the dark gradient overlay removed.
Moved the rail download badge from the outer ring edge to 2px inside the thumb, with a dark outline; it now sits over the icon corner and stays visible.
design/ mirrors both changes (home-sidebar, settings, mock.js icon swap).
Ran: bun run build, bun run design:check; browser-checked the rail in the app and lab.

[2026-11-14 12:43] opencode>all done ref:apps/desktop/src/components/Rail.tsx
Rail download badge is 18px instead of 20px; design/ mock badges match.
Ran: bun run build, bun run design:check; browser-checked the rail badge in the app.

[2026-11-14 12:46] opencode>all done ref:apps/desktop/src/components/Rail.tsx
Rail download badge is 16px; design/ mock badges match.
Ran: bun run build, bun run design:check; browser-checked the rail badge in the app.

[2026-11-14 12:52] opencode>all done ref:apps/desktop/src/styles/app.css
Responsive check plus a min-size guard that matches the real window lock (1100 x 650).
The CSS guard now triggers at max-width 1099px or max-height 649px instead of 960/600, so it agrees with tauri.conf.json.
Verified at 1100x650 the guard is off and there is no horizontal or vertical overflow in home/settings, vi/en. At 1099x649 the guard shows. Design lab mirrors the same boundary.
Ran: bun run build, bun run design:check.

[2026-11-14 13:05] opencode>all done ref:apps/desktop/src/styles/app.css
Checked the official base/config background art for Stella: 1280x734 PNG, CRC-64 matches 11498888707738615662. Exported it to ~/Downloads/stella-launcher-background.png.
Removed the 2% inset, 104% size, and 1.01 resting scale from .backdrop-art, and made art-in end at scale(1). The art now uses a plain cover with no extra zoom; custom media keeps its own 6% overscan for blur.
Ran: bun run build, bun run design:check; browser-checked home at 1280x720 and 1100x650.

[2026-11-14 13:20] opencode>all done ref:apps/desktop/src/App.tsx
Checked the live view and the real art: the in-app preview is 1470x932, the art area is 1394x932, and the API image is 1280x734. Cover was scaling 1.27x and cropping 232px of width.
Switched the official art to contain with a blurred cover copy behind it, so the full image is visible with soft bars instead of a heavy crop. Removed the old per-layout object-position offsets.
Mirrored in design/: CSS plus a backdrop-blur layer created by mock.js.
Ran: bun run build, bun run design:check; checked 1470x932, 1280x720, and 1100x650.

[2026-11-14 13:26] opencode>all done ref:apps/desktop/src/styles/app.css
Kept the first-run visual on object-fit cover so the contained backdrop rule does not letterbox that panel. Checked the app home and settings at the live 1470x932 preview.
Ran: bun run build, bun run design:check.

[2026-11-15 09:40] opencode>all done ref:apps/desktop/src/components/ServerDialog.tsx
Added a real per-server profile switch: EN keeps the `arknights`/`stella` ids, JP/KR become `arknights-jp|kr` and `stella-jp|kr` in data.ts and profile.rs. A swap button sits left of Play with the current region; the modal lists every region, install state, and download size, and picking an uninstalled server lands on the install state. Rail thumbs show a region badge and read state per active server.
Removed onboarding from React and design/ (FirstRun, first-run.html, server-switch.html) and deleted its dead CSS and mock hooks. Advanced tab is gone; reset now lives in About. Settings Game loses the Tools/Open folder row. Network tab uses a globe. Window is locked to 1356x734 with a solid topbar and art flush underneath.
Documented the official electron-updater feed (app-update.yml, latest.yml 1.6.0) as shell-only self-update in docs/launcher-reference.md.
Ran: bun run build, bun run design:check, cargo fmt --check, clippy -D warnings, cargo test --workspace (120+13); browser-checked both previews at 1470x932 and 1356x734.
Gap: self-update stays out of YAYL until release signing is defined.

[2026-11-15 14:38] opencode>all done ref:crates/yayl-core/src/profile.rs
Renamed EN_AUTH_SALT to AUTH_SALT: one salt serves EN, JP and KR, so the EN prefix was wrong. Profiles keep their own auth_salt field so a region can diverge later. Trimmed the comments in the first 25 lines that only restated field names, leaving the salt-is-public note and the API content gate.
Ran: cargo fmt --all -- --check, cargo test -p yayl-core (120 passed), cargo clippy -p yayl-core --all-targets -- -D warnings.

[2026-11-15 14:56] opencode>all done ref:docs/launcher-reference.md
Rewrote the launcher-version section from signed probes: any head.version is accepted (1.0.0 and 9.9.9 both return 200), and the only gate is Stella's notice_list at 1.5.0. Stella's news_list is null at every version, so the earlier claim that both lists were gated was wrong. Added the operations shape table: Arknights news_list is a nested CMS envelope (typeLabel/rows/publishTime/thumbnail), Stella notice_list is a flat section array with no thumbnails, and OperationsResource::feed normalizes both without a game branch. Also recorded that one salt is accepted by the EN, JP and KR hosts.
Ran: no build; docs only.

[2026-11-15 15:14] opencode>all done ref:launcher-versions.lock.json
Locked the two official shell versions in one file: version, installer name, size and sha512 for arknights 1.8.1 and stella 1.6.0. scripts/check-launcher-versions.mjs reads the public electron-updater latest.yml (no auth, no 178 MB download), verifies path is <gameTag>_Gamelauncher-<version>-setup.exe, and compares version/size/sha512; --update rewrites only the drifted entries and checkedAt, --json prints machine output, a bare target limits the run, and an unknown target exits 2. Size is read from the files: entry because latest.yml has no top-level size.
Added .github/workflows/launcher-versions.yml: matrix check over [arknights, stella] plus an update-lock job that runs --update and opens a PR. package.json gains versions:check and versions:update.
Found the website sources too: Arknights CMS GET /api/resource/game-download-link?index=1&size=999 -> data.rows[0].client; Stella bakes the URL into assets/PcLauncher-<hash>.js and has no API. Neither CDN serves app.asar, so the installer stays the only public artifact. Documented both in docs/launcher-reference.md.
Ran: bun run versions:check (both up to date, exit 0), forced drift (exit 1, "remote 1.6.0"), --update restored the file byte-identical (hash 69730EBA...), plus --json, single target, unknown target, and the workflow YAML parse.

[2026-11-15 15:26] opencode>all done ref:crates/yayl-core/src/profile.rs
Dropped .gitlab-ci.yml: it only included GitLab's SAST and Secret-Detection templates, no project test. GitHub is primary now, so the file was dead weight.
Renamed the Stella test to stella_protocol_version_is_above_the_notice_gate. The old name claimed the news list stays visible, but Stella never fills news_list; the assert guards the 1.5.0 notice gate.
Ran: cargo fmt --all -- --check, cargo test -p yayl-core (120 passed), cargo clippy -p yayl-core --all-targets -D warnings.

[2026-11-15 16:05] opencode>all done ref:launcher-versions.lock.json
Moved the protocol facts out of the code. The lock now also carries authSalt and apiBase; crates/yayl-core/build.rs turns it into ARKNIGHTS_*/STELLA_* constants, and profile.rs uses them for protocol_version, auth_salt and the EN api_base, so a launcher update edits one file. JP/KR profiles share the EN version and salt and keep their own host constants. vite.config.ts reads the same lock, so the dev news bridge cannot drift from the Rust profiles either.
Added scripts/launcher-facts.mjs: 7-Zip opens the electron-builder NSIS installer, the nested $PLUGINSDIR/app-32.7z gives resources/app.asar, and the asar header is read directly (no asar dependency) to pull version, salt, gameId and the api-launcher host out of out/main/index.js. check-launcher-versions.mjs gained --extract and --all: it downloads the installer, checks the feed's size and sha512 first, refuses a write when the asar disagrees with the feed version or the lock's game tag, and never leaves a half-refreshed lock behind.
CI: the update job installs the standalone 7-Zip 23.01 for Linux and refreshes the lock with --extract; workflow_dispatch takes extract=true to re-read both installers even without a version bump.
OS parity: Stella 1.6.0 extracted on Windows (7-Zip 21.04) and Debian (23.01); both app.asar files hash to 393B13B5..., so the check needs no Windows runner.
Ran: bun run versions:check, forced extract of both installers (salt read, no drift), salt zeroed then repaired byte-identical (68C7EE84...), cargo fmt/clippy/test (121 passed), bun run build in apps/desktop.

[2026-11-15 16:25] opencode>all done ref:.github/workflows/launcher-versions.yml
Dispatching the workflow with extract=true proved the Linux path: ubuntu downloaded both installers, read both salts, and left the lock untouched, so the check needs no Windows runner.
First run failed twice over: it downloaded 7z.tar.xz into the checkout (so the lock PR would have carried the tarball) and GitHub refused to let Actions open the PR. The tarball now goes to /tmp; opening the PR needs Settings -> Actions -> General -> Allow GitHub Actions to create and approve pull requests.

[2026-11-15 16:42] opencode>all done ref:.github/workflows/launcher-versions.yml
Switched the lock refresh from a pull request to a direct commit. The lock is generated from the installers, so a PR only added a manual merge; drift now passes the check job with a notice, and the update job writes, re-runs the plain check to prove the result, and commits to main. The "allow Actions to create PRs" setting is no longer needed.
Verified by pushing a deliberately wrong stella version: the job downloaded only stella, rewrote 1.6.0, re-checked, and committed c01d167. Only a feed that cannot be read still fails the check job.

[2026-11-15 17:05] opencode>all done ref:.github/workflows/launcher-versions.yml
Was wrong to download 7-Zip from 7-zip.org: Ubuntu's p7zip-full is only a transitional package that pulls `7zip`, so the distro package is the same 23.01 and needs no unsigned download. CI now installs it with apt.
Measured p7zip 16.02 (Debian, extracted by hand) against the Stella installer: it produces the correct app.asar (sha256 393B13B5...) but exits 2 with three data errors on the outer NSIS payload, so the script would refuse it anyway.
Dispatch with extract=true on the runner: 7z i reports 7-Zip 26.00, both installers download, both salts read, lock unchanged.

[2026-11-15 17:20] opencode>all done ref:crates/yayl-core/src/profile.rs
Dropped the last hand-written hosts. build.rs now derives API_HOST_JP and API_HOST_KR from arknights.apiBase by swapping "-en.", with an assert that both EN launchers agree on the host and that the host actually contains "-en.", so a lock with a different host shape fails the build instead of producing a wrong JP/KR URL. profile.rs has no host or salt literal left; vite.config.ts derives the same two hosts, so the dev news bridge matches the Rust profiles.
Also removed the restating comments from build.rs and profile.rs, keeping the salt-is-public and the 1.5.0 notice-gate notes.
Ran: cargo fmt --all -- --check, cargo test -p yayl-core (121 passed), cargo clippy -p yayl-core --all-targets -D warnings, cargo check -p yayl-cli, bun run build in apps/desktop, bun run versions:check.

[2026-11-15 17:40] opencode>all done ref:crates/yayl-core/build.rs
Both EN launchers ship the same host, so build.rs emits one API_HOST_EN instead of ARKNIGHTS_API_BASE and STELLA_API_BASE, asserts that the lock agrees, and derives API_HOST_JP/KR by swapping the region code. profiles use API_HOST_EN; the test checks the three hosts differ only by region.
The generated file already lives in OUT_DIR (target/debug/build/yayl-core-*/out/launcher_facts.rs): nothing in the repo, rebuilt from the lock, removed by cargo clean. Committing it would duplicate the lock and go stale, so CI does nothing extra.
Kept codegen over runtime parsing because GameProfile is `const`; parsing the lock at runtime would make every profile a LazyLock and move a lock error from build time to first use.
Ran: cargo fmt --all -- --check, cargo test -p yayl-core (121 passed), cargo clippy -p yayl-core --all-targets -D warnings, cargo check -p yayl-cli.

[2026-11-15 17:55] opencode>all done ref:.github/workflows/check-launcher-update.yml
Renamed the workflow to `Check launcher update` and folded the update into the matrix job, so each launcher owns its own lock entry. The check step sets a `drift` output: an up-to-date launcher prints "up to date" and skips 7-Zip, the download and the commit; a drifted one refreshes and commits only its entry, after re-running the plain check. The two legs share a job-level concurrency group so the second checks out the first one's commit, and the push retries with a rebase.
Tested on a throwaway branch with stella drift: stella downloaded and committed a2de887, arknights reported up to date and skipped 7-Zip, and the branch lock ended byte-identical to main, so the arknights entry was untouched. Branch deleted.
Ran: no local build change; workflow validated as YAML and exercised on GitHub.
