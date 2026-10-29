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
