# Backend worklog

> Mục đích: một file duy nhất để lưu kế hoạch, trạng thái, quyết định kỹ thuật và việc đang làm dở.
> Cập nhật file này sau mỗi mốc để lần làm việc sau không cần đọc lại toàn bộ hội thoại.

- **Cập nhật lần cuối:** 2026-10-28
- **Mốc hiện tại:** M1 hoàn tất — API + manifest + downloader resumable
- **Trạng thái:** backend tải xuống đã chạy end-to-end với CDN thật
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
5. Verify CRC-64/XZ sau khi tải; chỉ commit file khi hash đúng.
6. Checksum nhanh hơn tốc độ tải; không chặn UI.
7. Viết test cho API signing, manifest, resume, retry, checksum, news/version.
8. Giữ code Rust thuần, chạy được Windows + Linux; không thêm C++/Go nếu không cần.

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
- **Verify:** CRC-64/XZ, bảng slicing-by-8; hash file trên blocking thread.
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

### Đang làm / tiếp theo

- [ ] `verify` / `repair` toàn bộ install từ local manifest.
- [ ] Manifest diff local ↔ remote (chỉ tải file thay đổi).
- [ ] Lưu settings/install root.
- [ ] Tauri command layer + progress event.
- [ ] Launch game, playtime, tray.
- [ ] News/art cache cho UI.
- [ ] JP/KR profiles.
- [ ] Linux CI/build.

### Chưa làm

- [ ] Tauri shell (`apps/desktop/src-tauri`).
- [ ] React flow wiring.
- [ ] Signed release/updater.
- [ ] Proxy.
- [ ] Uninstall/registry/shortcut.

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
  local_manifest.rs  official manifest.json + game-launcher-config.json
  download_plan.rs   orchestration: API → manifest → jobs → download → manifest/config
  manifest.rs        remote manifest parse/URL
  downloader.rs      resumable downloader + checkpoint + progress
  crc64.rs           CRC-64/XZ slicing-by-8
  install.rs         install plan/disk
  profile.rs         game profiles
  settings.rs        local settings
  path.rs            path validation
crates/yayl-cli/src/main.rs
  hash | manifest | disk | plan | download | probe | news | manifest-url
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
```

## 7. Ghi chú resume/power-loss

- Ghi file theo kiểu append; mỗi 8 MiB gọi `sync_data()` rồi ghi checkpoint nguyên tử.
- Khi resume: đọc part length; nếu checkpoint nhỏ hơn part thì truncate về checkpoint (phần đuôi chưa chắc đã xuống đĩa).
- Nếu stream ngắn hơn `size`: giữ part, retry bằng Range; không xóa toàn bộ.
- Nếu `size` lớn hơn dự kiến: xóa part (không trừ nhầm counter).
- Nếu CRC sai: xóa part + checkpoint, tải lại file đó.
- Nếu server trả `200` khi đã có offset: truncate và tải lại từ 0.
- Nếu server trả `206`: kiểm tra `Content-Range` bắt đầu đúng offset; sai thì bỏ response, không append.
- Checkpoint được ghi cả khi stream lỗi/bị cancel, nên lần chạy sau vẫn resume được.
- Kiểm tra dung lượng đĩa chỉ tính phần còn thiếu (trừ file đã có và part đã tải), tránh chặn resume game lớn.
- Manifest remote được lưu trước khi tải tại `<root>/.yayl/remote-manifest.json`.
- `manifest.json` và `game-launcher-config.json` chỉ được ghi sau khi toàn bộ file pass CRC.

## 8. Nhật ký

### 2026-10-28

- Đã probe live API cho Arknights EN + Stella EN.
- Xác nhận tải file lẻ, manifest remote, CDN chính/dự phòng.
- Hoàn tất `api.rs`, `local_manifest.rs`, `download_plan.rs`, nâng cấp downloader/CRC/CLI.
- `cargo fmt --all -- --check`: pass.
- `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- `cargo test --workspace`: 44 test pass.
- `plan` đọc được cả remote manifest (`file[]`) và official local `manifest.json` (`files[]`).
- Live test: tải `API-MS-Win-core-file-l2-1-0.dll` từ CDN Arknights với part 5000 byte; Range resume, CRC `5943362273480959350`, commit thành công.
- Lưu ý: `cargo` trên PowerShell có thể trả exit code 1 vì ghi stderr; kiểm tra dòng `Finished`/`test result: ok` thay vì chỉ exit code.
