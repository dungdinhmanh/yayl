# Backend worklog

> Mục đích: lưu các quyết định kỹ thuật và API đã xác minh của backend.
> Trạng thái công việc và mốc tiến độ nằm ở `TODO.md` và `docs/roadmap.md`; file này không theo dõi tiến độ.

- **Phạm vi:** quyết định kỹ thuật, API đã xác minh, ghi chú resume/power-loss.
- **Nguồn tiến độ:** `TODO.md`, `docs/roadmap.md`.

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

## 3. API đã xác minh (live, 2026-10-28)

| Endpoint | Kết quả |
|---|---|
| `GET /api/launcher/game/config` | `game_latest_version`, `game_lowest_version`, `game_latest_file_path`, `game_start_exe_name`, `decompression_size` |
| `GET /api/launcher/base/config` | background, notice popup, terms/privacy |
| `GET /api/launcher/operations/resource` | banner + news (Arknights); Stella trả banner + `notice_list` (News/Events/Notices) khi `head.version` ≥ 1.5.0 |
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
- `news --game stella` trả 5 banner, 3 section (News/Events/Notices). API ẩn
  `notice_list` khi `head.version` < 1.5.0; profile Stella gửi `1.6.0`.

## 4. File map

```text
crates/yayl-core/src/
  api.rs             API client, auth, config/news/CDN/manifest URL
  background.rs      bounded cache for the official background art
  cache.rs           last-known launcher metadata for offline starts
  checksum.rs        Checksum: CRC-64/MD5/SHA-256/None
  crc64.rs           CRC-64/XZ slicing-by-8
  disk.rs            disk-space queries for the install root
  downloader.rs      resumable downloader + checkpoint + order + checksum
  download_plan.rs   PlanDocument, Yostar adapter, run/repair/verify/diff
  error.rs           typed error codes and conversions
  install.rs         install planning: size, free space, saved location
  manifest.rs        remote manifest parse/URL
  local_manifest.rs  official manifest.json + game-launcher-config.json
  path.rs            path validation
  playtime.rs        playtime history kept outside the install root
  process.rs         game process launch
  profile.rs         game profiles
  proxy.rs           direct/system/manual proxy + reqwest client builder
  settings.rs        local settings (proxy, order, install roots)
  state.rs           .yayl paths + atomic JSON writes
  sys.rs             per-process disk I/O counters
  task.rs            task.json (progress, failures, state)
  url.rs             remote URL validation
  verify.rs          verify report + manifest diff
crates/yayl-cli/src/main.rs
  hash | manifest | disk | plan | download | probe | news | manifest-url
  verify | repair | diff
```

## 5. Lệnh kiểm tra

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

> Trên PowerShell, `cargo` có thể trả exit code 1 vì ghi stderr; kiểm tra dòng `Finished`/`test result: ok` thay vì chỉ exit code.

## 6. Ghi chú resume/power-loss

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

