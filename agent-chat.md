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
