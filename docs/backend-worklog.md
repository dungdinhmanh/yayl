# Backend worklog

> Mục đích: một file duy nhất để lưu kế hoạch, trạng thái, quyết định kỹ thuật và việc đang làm dở.
> Cập nhật file này sau mỗi mốc để lần làm việc sau không cần đọc lại toàn bộ hội thoại.

- **Cập nhật lần cuối:** 2026-10-28
- **Mốc hiện tại:** M2 hoàn tất — proxy, plan/task bền vững, tải nhỏ trước, verify/repair/diff
- **Trạng thái:** backend tải xuống chạy end-to-end với CDN thật; plan/task/verify/repair đã có test tích hợp
- **Người dùng ưu tiên:** tải xuống trước; các phần launch/UI/Tauri làm sau.

## 1. Mục tiêu backend

1. Lấy được thông tin game từ API chính thức của A9/Stella:
   - phiên bản mới nhất, phiên bản tối thiểu
   - đường dẫn manifest
   - CDN chính và CDN dự phòng
   - tin tức/banner
2. Tải manifest trước khi tải file game.
3. Tải từng file lẻ từ CDN (không phải zip part):
   - URL = `CDN + manifest.source + manifest file path`
   - có CDN dự phòng
4. Resume được khi:
   - mất mạng giữa chừng
   - tắt app / kill process
   - mất điện (dùng checkpoint + `sync_data`)
5. Verify checksum sau khi tải; chỉ commit file khi hash đúng.
6. Checksum nhanh hơn tốc độ tải; không chặn UI.
7. Hỗ trợ proxy giống launcher chính thức (direct/system) và thêm manual.
8. Downloader không phụ thuộc game cụ thể; game khác chỉ cần tạo `PlanDocument`.
9. Ưu tiên file nhỏ trước để game sớm ở trạng thái chạy được.
10. Verify/repair và manifest diff phục vụ vòng đời update/corrupted.
11. Giữ code Rust thuần, chạy được Windows + Linux; không thêm C++/Go nếu không cần.

## 2. Quyết định kỹ thuật đã chốt

- **Ngôn ngữ:** Rust cho toàn bộ backend. Không thêm C++/Go ở mốc này.
  - Lý do: `tokio` + `reqwest` + `serde` chạy tốt trên Windows/Linux; thêm ngôn ngữ thứ hai làm tăng build/CI và không giải quyết vấn đề tải xuống.
  - Phần Windows-only (registry, shortcut, tray) sẽ tách sau bằng crate có cfg; bản Linux dùng cùng core.
- **Auth:** `head = { game_tag, time, version }`; `sign = MD5(JSON.stringify(head) + data + salt)`.
  - `game_tag` thực tế: `Arknights_EN`, `StellaSora_EN`.
  - `version` là version launcher; server hiện chấp nhận `0.1.0`.
- **Manifest remote:** JSON `{ source, file: [{ path, hash, size }] }`.
- **Manifest local:** `manifest.json` theo format official:
  - `{ name, version, basis, vc, files: [{ path, hash, size, vc }] }`
  - `vc = base64(MD5(Object.values(obj).join(";")))`
- **Game config local:** `game-launcher-config.json` theo format official, có `vc`.
- **Download URL:** `source` bắt đầu bằng `/`; file path bắt đầu bằng `/`; nối thành `CDN/source/path`.
- **Partial file:** `.yayl-part`; checkpoint `.yayl-part.ckpt` (độ dài đã sync).
- **Checksum:** abstraction `Checksum::{None, Crc64, Md5, Sha256}`.
  - Yostar dùng CRC-64/XZ; game khác có thể dùng MD5/SHA-256 hoặc không có checksum.
  - CRC-64/XZ dùng bảng slicing-by-8; hash file trên blocking thread.
- **Downloader đa hình:** `PlanDocument` là đầu vào chung; `RemoteGame` chỉ là adapter Yostar.
  - Game khác tự dựng `PlanDocument` rồi gọi `DownloadPlan::from_document`.
  - `write_local_metadata` chỉ ghi `manifest.json`/`game-launcher-config.json` khi provider là `yostar`; provider khác là no-op.
- **Thứ tự tải:** `SmallestFirst` (mặc định), `LargestFirst`, `Manifest`.
  - File nhỏ xong trước giúp game sớm có đủ file khởi động; file lớn chạy sau.
- **Proxy:** `ProxyMode::{Direct, System, Manual}`.
  - `Direct` là mặc định, giống launcher chính thức.
  - `System` đọc WinINET registry trên Windows (`ProxyEnable`, `ProxyServer`, `ProxyOverride`); nền tảng khác dùng biến môi trường.
  - `Manual` nhận HTTP/HTTPS/SOCKS4/SOCKS5 và `no_proxy`.
  - Luôn thêm `localhost`, `127.0.0.1`, `::1` vào bypass khi đọc system proxy.
- **Trạng thái bền vững:** tách `plan.json` và `task.json`.
  - `.yayl/plan.json` = desired state bất biến: game config, CDN, manifest snapshot, jobs, order.
  - `.yayl/task.json` = execution state thay đổi: progress, failures, timestamps.
  - Tách ra để cập nhật tiến độ không phải ghi lại manifest snapshot; verify/repair/diff đọc plan ổn định.
  - `.yayl/manifest.json` giữ nguyên byte manifest gốc để ghi metadata và chẩn đoán offline.
- **gRPC:** không dùng trong downloader hiện tại.
  - Tauri IPC + event đủ cho một tiến trình, một client.
  - gRPC/tonic chỉ hợp lý nếu tách download daemon, nhiều client, hoặc điều khiển từ xa; khi đó tăng footprint và độ phức tạp không cần thiết.
- **Verify/repair:** verify theo size + checksum, chạy song song có giới hạn; repair chỉ tải lại file lỗi.
- **Manifest diff:** so sánh local `manifest.json` với plan remote; phân loại added/removed/changed/unchanged và byte impact.
- **Không copy code GPL:** chỉ đọc hành vi từ A9; implementation viết lại.

## 3. Task board

### Đã xong (M1)

- [x] `api.rs`: client + auth + game config + base config + operations + CDN + manifest URL.
- [x] `local_manifest.rs`: đọc/ghi `manifest.json` và `game-launcher-config.json` có `vc`.
- [x] `download_plan.rs`: ghép API → manifest → file jobs → downloader → ghi manifest/config.
- [x] Nâng cấp downloader: checkpoint, giữ partial khi stream ngắn, validate `Content-Range`.
- [x] CLI: `probe`, `news`, `manifest-url`, `download --game`.
- [x] Test: auth vector, API parse fixtures, resume/checkpoint, short stream, CRC slicing.
- [x] Chạy `cargo fmt`, `clippy`, `test`.
- [x] Tải thử file thật từ CDN với partial 5000 byte; resume bằng Range, CRC đúng, commit thành công.

### Đã xong (M2)

- [x] `checksum.rs`: CRC-64/MD5/SHA-256/None, tagged JSON, verify async + blocking.
- [x] `proxy.rs`: direct/system/manual, WinINET registry, env fallback, SOCKS normalize, `no_proxy`, client builder.
- [x] `state.rs`: `.yayl/plan.json`, `.yayl/task.json`, `.yayl/manifest.json`, atomic writes.
- [x] `task.rs`: `DownloadTask`, `TaskState`, failure persistence, progress apply.
- [x] `settings.rs`: thêm `proxy` + `download_order`; file settings cũ vẫn load.
- [x] `downloader.rs`: `DownloadOrder`, `FileJob.checksum`, `http_client_with`, checksum abstraction.
- [x] `verify.rs`: missing/size/checksum issues, verify song song, `diff_manifests`.
- [x] `download_plan.rs`: `PlanDocument`/`PlanJob`/`PlanManifest`, `RemoteGame` adapter, plan/task persistence, repair subset, verify, diff, generic provider.
- [x] CLI: `--proxy`, `--proxy system`, `--direct`, `--order`, `verify`, `repair`, `diff`.
- [x] Test tích hợp HTTP cục bộ: generic SHA-256 download → task completed → xóa file → verify missing → repair.
- [x] `cargo fmt`, `clippy`, `test`: 70 test pass.

### Đang làm / tiếp theo

- [ ] Tauri command layer + progress event (dùng `PlanDocument`, `DownloadTask`).
- [ ] Resume UI: đọc `task.json` + `plan.json` khi mở app.
- [ ] Launch game, playtime, tray.
- [ ] News/art cache cho UI.
- [ ] JP/KR profiles.
- [ ] Linux CI/build.

### Chưa làm

- [ ] Tauri shell (`apps/desktop/src-tauri`).
- [ ] React flow wiring.
- [ ] Signed release/updater.
- [ ] Uninstall/registry/shortcut.
- [ ] Download daemon/gRPC (chỉ cân nhắc nếu có nhu cầu multi-client).

## 4. API đã xác minh (live, 2026-10-28)

| Endpoint | Kết quả |
|---|---|
| `GET /api/launcher/game/config` | `game_latest_version`, `game_lowest_version`, `game_latest_file_path`, `game_start_exe_name`, `decompression_size` |
| `GET /api/launcher/base/config` | background, notice popup, terms/privacy |
| `GET /api/launcher/operations/resource` | banner + news (Arknights); Stella hiện chỉ trả banner, `news_list`/`notice_list` là `null` |
| `GET /api/launcher/advanced/game/download/cdn` | `primary_cdn`, `back_up_cdn` |
| `GET /api/launcher/game/config/json?version=&file_path=` | `{ data: { url } }` → manifest JSON |

Ví dụ manifest thật:

- Arknights EN: `https://launcher-pkg-ark-en.yo-star.com/zip_online_config_json/042.0.0bQiwOhsX.json`
- Stella EN: `https://launcher-pkg-ss-en.yo-star.com/zip_online_config_json/2.0.0tgQuFPED.json`
- Arknights: 3.122 file / 3.47 GB; Stella: 9.254 file.
- Đây là **file lẻ**, không phải zip part. `game_latest_file_path` chỉ là `basis` để xin manifest.

Kết quả live probe gần nhất (2026-10-28):

- Arknights `042.0.0`, 3.122 file, 3.727.697.138 byte.
- CDN chính `https://launcher-pkg-ark-en.yo-star.com`, dự phòng `https://launcher-pkg-ark-en-bk.yo-star.com`.
- `probe --game arknights` và `news --game arknights` chạy thành công.
- `news --game stella` trả 6 banner, 0 section (đúng với response hiện tại của API).

## 5. File map

```text
crates/yayl-core/src/
  api.rs             API client, auth, config/news/CDN/manifest URL
  checksum.rs        Checksum: CRC-64/MD5/SHA-256/None
  proxy.rs           direct/system/manual proxy + reqwest client builder
  state.rs           .yayl paths + atomic JSON writes
  task.rs            task.json (progress, failures, state)
  verify.rs          verify report + manifest diff
  local_manifest.rs  official manifest.json + game-launcher-config.json
  download_plan.rs   PlanDocument, Yostar adapter, run/repair/verify/diff
  manifest.rs        remote manifest parse/URL
  downloader.rs      resumable downloader + checkpoint + order + checksum
  crc64.rs           CRC-64/XZ slicing-by-8
  install.rs         install plan/disk
  profile.rs         game profiles
  settings.rs        local settings (proxy, order, install roots)
  path.rs            path validation
crates/yayl-cli/src/main.rs
  hash | manifest | disk | plan | download | probe | news | manifest-url
  verify | repair | diff
```

## 6. Lệnh kiểm tra

```powershell
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# live probes
cargo run -p yayl-cli -- probe --game arknights
cargo run -p yayl-cli -- news --game stella
cargo run -p yayl-cli -- manifest-url --game arknights

# proxy + plan + verify/repair/diff
cargo run -p yayl-cli -- probe --game arknights --proxy system
cargo run -p yayl-cli -- download --game arknights --root D:\Games\Arknights_EN --proxy system
cargo run -p yayl-cli -- verify --root D:\Games\Arknights_EN
cargo run -p yayl-cli -- repair --root D:\Games\Arknights_EN --proxy system
cargo run -p yayl-cli -- diff --game arknights --root D:\Games\Arknights_EN
```

## 7. Ghi chú resume/power-loss

- Ghi file theo kiểu append; mỗi 8 MiB gọi `sync_data()` rồi ghi checkpoint nguyên tử.
- Khi resume: đọc part length; nếu checkpoint nhỏ hơn part thì truncate về checkpoint (phần đuôi chưa chắc đã xuống đĩa).
- Nếu stream ngắn hơn `size`: giữ part, retry bằng Range; không xóa toàn bộ.
- Nếu `size` lớn hơn dự kiến: xóa part (không trừ nhầm counter).
- Nếu checksum sai: xóa part + checkpoint, tải lại file đó.
- Nếu server trả `200` khi đã có offset: truncate và tải lại từ 0.
- Nếu server trả `206`: kiểm tra `Content-Range` bắt đầu đúng offset; sai thì bỏ response, không append.
- Checkpoint được ghi cả khi stream lỗi/bị cancel, nên lần chạy sau vẫn resume được.
- Kiểm tra dung lượng đĩa chỉ tính phần còn thiếu (trừ file đã có và part đã tải), tránh chặn resume game lớn.
- Manifest remote được lưu trước khi tải tại `<root>/.yayl/manifest.json`.
- `plan.json` được lưu trước khi tải; `task.json` cập nhật tối đa mỗi giây và luôn ghi khi kết thúc/lỗi/cancel.
- State nội bộ dùng JSON compact (`serde_json::to_vec`), không pretty-print.
- Progress snapshot của `task.json` ghi kiểu `Durability::Relaxed` (không fsync) và bỏ qua nếu counters không đổi; chỉ state kết thúc (`paused/completed/failed`) mới fsync.
- `plan.json` và `manifest.json` ghi một lần nên luôn dùng `Durability::Full`.
- `.yayl/manifest.json` là manifest gốc của server; `<root>/manifest.json` là file official do YAYL sinh ra sau verify. Tên cũ `.yayl/remote-manifest.json` được tự migrate khi load.
- `manifest.json` và `game-launcher-config.json` chỉ được ghi sau khi toàn bộ file pass checksum.

## 8. Nhật ký

### 2026-10-28

- Đã probe live API cho Arknights EN + Stella EN.
- Xác nhận tải file lẻ, manifest remote, CDN chính/dự phòng.
- Hoàn tất `api.rs`, `local_manifest.rs`, `download_plan.rs`, nâng cấp downloader/CRC/CLI.
- `cargo fmt --all -- --check`: pass.
- `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- `cargo test --workspace`: 44 test pass (M1).
- `plan` đọc được cả remote manifest (`file[]`) và official local `manifest.json` (`files[]`).
- Live test: tải `API-MS-Win-core-file-l2-1-0.dll` từ CDN Arknights với part 5000 byte; Range resume, CRC `5943362273480959350`, commit thành công.
- M2: thêm proxy, checksum abstraction, plan/task, smallest-first, verify/repair/diff.
- `cargo test --workspace`: 70 test pass (M2), gồm test HTTP cục bộ cho generic plan + repair.
- Lưu ý: `cargo` trên PowerShell có thể trả exit code 1 vì ghi stderr; kiểm tra dòng `Finished`/`test result: ok` thay vì chỉ exit code.

### 2026-10-29

- Benchmark state formats: JSON compact vs Postcard/MessagePack/CBOR/Bincode/rkyv/FlatBuffers trên plan 9.254 file.
- Kết luận: giữ JSON compact. FlatBuffers chỉ nhỏ hơn 9%, `root()` vẫn validate 2,5 ms, và Rust runtime không có mutator.
- Đổi progress snapshot của `task.json` sang `Durability::Relaxed`, bỏ ghi khi counters không đổi; terminal state vẫn fsync.
- Đổi tên `.yayl/remote-manifest.json` → `.yayl/manifest.json`; file tên cũ được tự migrate khi load.
- `cargo fmt --all -- --check`: pass.
- `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- `cargo test --workspace`: 74 test pass.
- Sửa review: lỗi đọc manifest không còn bị coi là "không có file", chỉ xoá legacy khi bản mới có nội dung, thay `remove_file` + `rename` bằng `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`, chặn plan Yostar thiếu raw manifest, chỉ đánh dấu progress đã lưu khi ghi thành công và bỏ qua khi đang ghi.
- `cargo test --workspace`: 79 test pass.
- Live E2E Arknights EN: tải 3.122 file / 3,47 GB; kill ở ~18 MB rồi resume, hoàn tất; verify phát hiện 1 file thiếu + 1 file sai checksum; repair tải lại 659,5 KB; verify lại 0 issue.
- Sửa state: `task.json` được reuse khi resume và không bị repair ghi đè bằng tập file con.
- `cargo test --workspace`: 81 test pass.
- Đo lại bằng release: CRC-64 file ~1,3 GB/s; verify 3,47 GB mất 5,0s (concurrency 8) và 1,1s (concurrency 32, cache nóng). 5,5 phút trước đó là debug build, không phải giới hạn thuật toán.
- `cargo test --workspace`: 82 test pass.

### 2026-10-30

- Added the M3 Tauri command layer in `apps/desktop/src-tauri`:
  - size, disk, folder, settings and window commands;
  - `download_status`, `start_download`, `cancel_download`, `discard_download`.
- `download-progress` emits 4 Hz snapshots with phase, bytes, speed, files and a stable error code. `done` is emitted only after the official metadata is written.
- `download_status` reads `plan.json`/`task.json` and maps a persisted `running`/`verifying` task to `paused` when no live token exists.
- The resume UI uses the saved install root from `%APPDATA%\yayl\settings.json`; the web build keeps mock fallbacks.
- Fixed issues found by the real Tauri E2E run:
  - download handles now have ids, so an old task cannot remove a newer resumed handle;
  - an early `.exe` is no longer treated as a complete install; `installed` requires a completed task (or no task yet);
  - resumed progress keeps the persisted counters as a floor, so the bar never drops back to zero;
  - cancel on a paused download drops plan/task but keeps `.yayl-part` and downloaded files;
  - `open_install_folder` opens the nearest existing ancestor for a folder that does not exist yet.
- Real webview E2E (temporary CDP config, reverted): start, pause, resume and restart with Arknights EN 3,122 files / 3,727,697,138 bytes. Paused at 32,689,697 bytes, resumed to 34,864,013 bytes; a mid-run kill reopened as `paused` and resumed. No game data was kept after the test.
- `cargo test --workspace`: 83 core + 11 desktop = 94 tests pass.
- `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- `bun run build`: pass; JS 321.28 KB (99.42 KB gzip), CSS 88.50 KB (16.62 KB gzip).

### 2026-10-31 — Security hardening from audit run-1

Audit findings (`security-audit/`): AUTH-001, PATH-001, IPC-001. All were
`needs_validation`; source review against the extracted official launchers
confirmed the salt and unauthenticated manifest GET are protocol behavior, not
defects.

- **Remote URLs:** added `yayl_core::url::validate_remote_url`. Manifest URLs,
  API base URLs, and plan/CDN URLs now require `https`; plain `http` is allowed
  only for loopback hosts so local tests keep working. Credentials embedded in
  URLs are rejected.
- **Path/symlink guard:** added `yayl_core::path::reject_symlink_components`.
  The downloader rejects symlinks/junctions in existing components below the
  install root before reading, creating directories, opening `.yayl-part`, and
  committing. `.yayl` state reads/writes and `discard_download` use the same
  guard. Checkpoint/state temp files use `create_new` so a planted link cannot
  redirect the write; fresh parts are created with `create_new` as well.
  Residual TOCTOU between the check and the OS call is documented; the root
  itself stays trusted because the user may point it at another drive.
- **Tauri IPC scope:** `download_status`, `start_download`, `discard_download`,
  and `open_install_folder` now require the saved install root for that game or
  the default root. `disk_space` still accepts a new folder for the install
  dialog but requires an absolute path. `save_install_root` remains the
  user-intent boundary. The install dialog hides "locate game" once the path is
  edited, because an unsaved path is not an allowed root yet.
- Tests: HTTPS/loopback URL cases, Windows junction rejection, and path
  comparison for the IPC allowlist.
- Gates: `cargo fmt --all -- --check`, `cargo clippy --workspace
  --all-targets -- -D warnings`, `cargo test --workspace` (91 core + 13 desktop),
  `bun run build`, `bun run design:check` pass.

### 2026-10-31 — Settings and first-run

- Extended `yayl_core::Settings` with `concurrency` (default 10), `reduced_motion`,
  `background` (`art`/`solid`), and `onboarding_complete`. Old settings files
  migrate `onboarding_complete` to `true`; a missing file stays `false`.
- Added Tauri commands: `set_language`, `save_network_settings`,
  `save_appearance`, `save_first_run`, `complete_onboarding`, `reset_settings`,
  `game_profiles`, and `app_info`. Reset keeps install roots and onboarding
  state; game files are never touched.
- The real downloader now uses the saved proxy, download order, and concurrency
  (clamped to 1–32) instead of hard-coded defaults.
- Added the React settings page (General, Game, Network, Advanced, About) and
  the three-step first-run flow. Both are lazy-loaded. The web lab keeps
  in-memory mock settings and can replay onboarding with `?onboarding=1`.
- First-run saves language and roots on "Get started" and marks onboarding
  complete only on "Open YAYL". Quitting early replays the flow with saved roots
  prefilled. It does not start a download automatically.
- Settings only expose behavior that exists: language, motion, background,
  proxy, download order, connections, install path/open folder, reset, and app
  info. Fake verify/repair/uninstall/tray controls were left out.
- Fixed first-run layout so language and game rows stack, added an insufficient
  space warning, and kept the settings path "saved" state after saving.
- Gates: `cargo fmt --all -- --check`, `cargo clippy --workspace
  --all-targets -- -D warnings`, `cargo test --workspace` (92 core + 13 desktop),
  `bun run build` (327.27 KB JS / 100.99 KB gzip), `bun run design:check` pass.

### 2026-11-01 - Launch, playtime, verify and repair

- Added `yayl_core::process` (resolve the profile executable inside the install
  root, reject symlinks, spawn with the root as cwd) and `yayl_core::playtime`
  (`playtime.json` under the launcher data dir, saturating session totals).
- Added Tauri commands `playtime`, `launch_game`, `verify_game`, and
  `repair_game`. `launch_game` waits on the child in a background thread and
  emits `game-exit` with `{ game, totalSeconds, lastPlayed }`.
- Verify reuses `DownloadPlan::verify_with_progress`; repair reuses
  `DownloadPlan::repair`, then re-verifies before reporting done. Both register
  in `AppState.begin`, so downloads and checks stay mutually exclusive per game.
- Verify emits `verifying` progress without a terminal event, because the command
  result is authoritative for the final state. Repair reuses `download-progress`
  while files transfer.
- Wired the Home primary action (Play / Repair / Resume), the secondary link
  (Verify / Pause / Cancel / Minimize), and the overflow menu (Verify, Repair,
  Settings). Launch failures map to a localized note instead of a raw error.
- Playtime and last-played now come from the backend; the web lab keeps the
  static fallback and simulates running/verifying states.
- Gates: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  -- -D warnings`, `cargo test --workspace` (98 core + 13 desktop),
  `bun run build` (329.98 KB JS / 101.73 KB gzip), `bun run design:check` pass.

### 2026-11-01 - Real news, live rail progress, tray and close behavior

- News now comes from the official API through the `fetch_news` command; the
  widget keeps the static feed only in the web lab. Remote images are limited to
  `http(s)` and links to `https`, and links open through `open_external` so the
  webview never navigates away. Loading and unavailable states are explicit.
- The rail progress ring reads live download progress instead of the static
  state table.
- Added a tray icon with a localized Open/Quit menu, left-click restore, and a
  menu refresh when the language changes.
- Added `Settings.close_to_tray` (default `true`, migrated for old files) and the
  `save_window_behavior` command. `CloseRequested` hides the window when the
  option is on, otherwise the app closes normally.
- Settings exposes "When closing the window" as tray/exit; the fake autostart,
  minimize-on-play, and start-minimized controls stay out of the UI.
- Gates: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  -- -D warnings`, `cargo test --workspace` (98 core + 13 desktop),
  `bun run build` (332.79 KB JS / 102.67 KB gzip), `bun run design:check` pass.


### 2026-11-06 - Real game version and cancel confirmation

- Added the `game_version` command: the installed version comes from
  `manifest.json`, latest/minimum come from the official `game_config`. A failed
  API call still returns the local version so the settings hero works offline.
- Settings no longer uses the mock version; it shows the installed version, the
  update target when one exists, or "Not installed".
- Cancelling a paused download now opens a confirmation dialog with the affected
  folder, focuses the safe action, and supports Escape/backdrop dismissal.
- Home shows stored playtime or an explicit "no data" label in the real app; the
  static sample history stays in the web lab. Removed unused mock size/drive
  placeholders from the Home action variables.
- Gates: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  -- -D warnings`, `cargo test --workspace` (98 core + 13 desktop),
  `bun run build` (334.83 KB JS / 103.12 KB gzip), `bun run design:check` pass.

### 2026-11-06 - Remove remaining mock fallbacks

- First-run per-game sizes now come from `fetchDownloadBytes`, so the selected
  games show their real download size instead of the static `GAMES[].required`
  copy.
- Tauri boot no longer invents a `GAMES[].path` when a root cannot be resolved;
  roots start empty and failed status reads leave them empty. The lab keeps the
  static paths.
- The install dialog no longer falls back to the mock `game.path` and only shows
  the locate action for a real path.
- Removed the unused mock-only `settings.game.switch*` strings from the shipped
  i18n bundle.
- Onboarding no longer blocks when the size or disk probe fails: it keeps the
  partial result, explains that the check will run again during install, and
  only blocks when a known free-space value is actually short.
- Added visible keyboard focus to the concurrency slider and the install path
  field, and removed the remaining mock/outdated toast strings from the shipped
  bundle.
- First-run now says "Folder set" instead of "Install detected": a saved root is
  not proof that the game files exist, and install detection/import is still M4.
- Layout pass at 1100x650 and 1280x720, 100% and 150% zoom, vi/en: no horizontal
  overflow; below 560 px the app scrolls vertically instead of clipping.
  Lighthouse accessibility stays 1.0 on Home, Settings, and first-run.
- Gates: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  -- -D warnings`, `cargo test --workspace` (98 core + 13 desktop),
  `bun run build` (333.24 KB JS / 102.80 KB gzip), `bun run design:check` pass.
- Removed the duplicated "Kiểm tra" secondary link from the Home ready state.
  The same action stays in the overflow menu, matching the design lab's
  `homeSecondaryText`, which returns null for ready.

### 2026-11-06 - Preview live news in the browser lab

- Added a serve-only Vite bridge (`/__dev/news`) that signs the official
  operations request with the same envelope as `yayl_core::api` and normalizes
  the feed like `OperationsResource::feed`.
- The browser lab now renders real banners and sections; if the bridge fails it
  keeps the static feed. Production builds never register the route.
- Verified: Arknights returns 4 banners and LATEST/event/contest sections;
  Stella Sora currently returns banners only because the API sends no
  news/notice lists.
- Section labels are mapped through i18n (`LATEST`/`event`/`contest`). Live
  banners no longer render the redundant "NEWS" kicker; the copy block only
  appears when the API sends a remark.
- Gates: `bun run build`, `bun run design:check` pass.
