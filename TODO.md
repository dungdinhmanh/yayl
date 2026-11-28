# TODO (để giao việc)

Gộp từ `TODO.md`, `TODO-later.md` và `audit.md` (review ngày 2026-11-10).
Số dòng tham chiếu theo commit `bec30c4`; kiểm tra lại trước khi sửa.
Phiên bản package lấy từ npm/crates.io ngày 2026-11-10, chỉ tính bản stable.

Cột **Owner** và **Trạng thái** để trống cho người nhận việc.

## Đã quyết định (đừng làm lại)

- Giữ CRC-64 tự viết (slicing-by-8): bench 32 MiB cho 1953 MiB/s, crate `crc` 3.4.0 chỉ 476 MiB/s.
- Giữ `design/` (nơi xem trước UI trước khi port sang React). Không xoá, không bỏ CSS trùng.
- Chưa dùng Zustand; thử custom hook/`useReducer` trước.
- Chưa làm CI test/lint; giữ SAST + secret detection hiện có.
- Không thay `downloader.rs`/`download_plan.rs` bằng thư viện chung, không đổi sang `i18next`/Tailwind, không dùng `backon`.
- Đã xong: hardening A (capability, CSP, `tauri` 2.12.5, loopback `http` chỉ trong `cfg(test)`) và toàn bộ nâng cấp phiên bản (animejs 4, Vite 8, plugin-react 6, TS 7, reqwest 0.13, sha2/md-5 0.11, fs4 1.1...).

## Quy ước khi làm

- Chỉ thêm dependency đã ghi trong task. Giữ nguyên hành vi, mỗi task một commit.
- Rust: `cargo fmt --check`, `cargo clippy --workspace --all-targets`, `cargo test --workspace`.
- Frontend: `bunx tsc -b` và `bun run --cwd apps/desktop build`.
- Việc đụng tới `cfg(windows)` hoặc proxy cần test tay trên Windows.

---

## P1. Đúng đắn / độ tin cậy

### T-01 `DownloadTask::load` phân biệt NotFound

- **File:** `crates/yayl-core/src/task.rs:70`
- **Việc:** bỏ `path.exists()`; đọc thẳng, chỉ `ErrorKind::NotFound` → `Ok(None)`, lỗi khác trả về.
- **Xong khi:** có test cho file thiếu, JSON hỏng, schema sai, lỗi đọc.
- **Trạng thái:** xong 2026-11-23.

### T-02 Ghi file atomic bằng `tempfile::persist` (thay `unsafe`)

- **File:** `crates/yayl-core/src/state.rs` (`write_atomic_with`, dòng 87; khối `MoveFileExW` dòng ~109–122)
- **Việc:** dùng `tempfile::NamedTempFile::new_in(dir)` + `persist` (chuyển `tempfile` 3.27 từ dev-dep sang dependency). Giữ phân biệt `Durability::Full`/`Relaxed` và phòng symlink/planted-link. Bỏ `windows-sys` khỏi `yayl-core` nếu không còn chỗ dùng (hiện chỉ file này).
- **Xong khi:** không còn `unsafe`; test ghi đè file có sẵn, hai ghi đồng thời, dọn file tạm khi lỗi; chạy trên Windows và Linux.
- **Trạng thái:** xong 2026-11-23. `NamedTempFile::new_in` + `persist`, khoá `Mutex` trong process (Windows `persist` lỗi `Access denied` khi ghi đồng thời — test bắt được), giữ `Full`/`Relaxed`; `windows-sys` vẫn cần cho `sys.rs` nên chỉ bỏ feature `Win32_Storage_FileSystem`. Windows: 139 test pass; Linux chưa chạy trên máy này.

### T-03 Migration state không nuốt lỗi `rename`

- **File:** `crates/yayl-core/src/state.rs:46` (`let _ = std::fs::rename(&legacy, &path)`)
- **Việc:** trả lỗi hoặc dùng file cũ có chủ đích và báo là chưa migrate. Không xoá file legacy trước khi state mới ghi xong.
- **Xong khi:** test migrate thành công, thiếu legacy, đích đã có, rename lỗi.
- **Trạng thái:** xong 2026-11-23 (ghi `manifest.json` durable trước, xoá legacy best-effort sau).

### T-04 Rà `unwrap_or(0)` ở metadata trong downloader

- **File:** `crates/yayl-core/src/downloader.rs` (dòng 371, 398, 462, 533, 775, 790, 794)
- **Việc:** xét từng chỗ; chỗ nào cần "thiếu file = 0" thì dùng helper `file_len_or_zero` (chỉ `NotFound` → 0, lỗi khác propagate). Không thay máy móc.
- **Xong khi:** test resume với checkpoint hợp lệ + `.part` bị cắt; file `.part` thiếu vẫn recover như cũ.
- **Trạng thái:** xong 2026-11-23 (helper chỉ nuốt `NotFound`; giữ `unwrap_or(0)` ở `remove_part` vì là cleanup best-effort).

### T-05 `LocalManifest::validate` fail-closed (security #5)

- **File:** `crates/yayl-core/src/local_manifest.rs:96-108`, `process.rs:92-118`
- **Việc:** entry có checksum `vc` sai không bị bỏ im lặng mà coi là **damaged/cần tải lại**, để verify/repair xử lý.
- **Xong khi:** test manifest hỏng 1 entry → `damaged_files` báo đúng entry đó; cập nhật `docs/security-review` mục #5.
- **Trạng thái:** xong 2026-11-24 theo Q-05 (bad `vc` = damaged). `LocalManifest::validate` vẫn loại entry khỏi `files` để diff không dùng hash sai, nhưng lưu path vào `invalid_files` (`#[serde(skip)]`, không đổi format); `process::damaged_files` đưa các path này vào danh sách damaged. Test `quarantines_tampered_files_instead_of_hiding_them` và `damaged_files_reports_a_bad_file_vc`; `cargo test -p yayl-core` 140 pass, fmt/clippy sạch. D-07 cập nhật riêng.

### T-06 Gộp vòng lặp CRC trùng

- **File:** `crates/yayl-core/src/crc64.rs:82-108`
- **Việc:** `crc64_file_blocking` mở file rồi gọi `crc64_reader`; sửa doc comment sai của `crc64_reader`. **Không đổi thuật toán.**
- **Xong khi:** test vector cũ (`"123456789"` → `0x995DC9BBDF1939FA`) qua; bench không tụt so với 1953 MiB/s.
- **Trạng thái:** xong phần code 2026-11-23. Vector qua; workspace không có `benches/`/criterion nên **không đo lại được** 1953 MiB/s — thuật toán và buffer 1 MiB giữ nguyên.

### T-07 Ảnh nền tùy chỉnh: giới hạn dung lượng + tránh copy chính nó

- **File:** `apps/desktop/src-tauri/src/commands.rs` (`choose_custom_background`)
- **Việc:** (a) kiểm tra dung lượng trước khi copy (**cần chốt mức**; ảnh nền từ server giới hạn 32 MiB ở `api.rs:525`, mp4 người dùng có thể cần cao hơn); (b) nếu `path == dest` thì bỏ qua copy (copy file lên chính nó có thể cắt cụt).
- **Xong khi:** file quá lớn trả lỗi `invalid_input` có mã ổn định; chọn lại file đang nằm trong cache không làm mất dữ liệu.
- Owner: ____ Trạng thái: (b) xong; (a) thay bằng T-21 (Q-07)

### T-08 Single instance

- **Việc:** thêm `tauri-plugin-single-instance` 2.5.5; mở lần 2 thì focus cửa sổ cũ.
- **Xong khi:** chạy 2 lần chỉ còn 1 tiến trình; không xung đột file state/task.
- **Trạng thái:** code xong 2026-11-23 (plugin đăng ký đầu tiên, gọi `show_main`; `cargo check -p yayl-desktop` pass). **Chưa chạy thử 2 tiến trình** trên máy này.

### T-09 Log cục bộ

- **Việc:** thêm `tauri-plugin-log` 2.10.1 (bản stable, không lấy 3.0 alpha), chỉ ghi file local; **không upload** (ràng buộc "no telemetry"). Không log token/salt/URL có credential.
- **Xong khi:** lỗi tải/verify để lại log đọc được; đã rà log không lộ dữ liệu nhạy cảm.
- **Trạng thái:** code xong 2026-11-23. `tauri-plugin-log` 2.10.x chỉ target `LogDir` (`yayl*.log`, ~5 MiB xoay vòng), level Info; log lỗi download/verify/repair theo `code` + `detail`, không log header/token/salt. `cargo check/clippy/test -p yayl-desktop` qua; **chưa mở app để đọc file log thật**.

---

## P2. Bảo trì

### T-10 Proxy mode `System` dùng reqwest

- **File:** `crates/yayl-core/src/proxy.rs` (`env_proxy`, `windows_system_proxy`, `parse_proxy_server`; dep `winreg`)
- **Việc:** workspace đã bật `reqwest` feature `system-proxy`; thử để mode `System` dùng hành vi mặc định, giữ `Direct` và `Manual` rõ ràng. Bỏ `winreg` nếu không còn dùng.
- **Xong khi:** test tay: không proxy, HTTP, HTTPS, bypass/no-proxy trên **Windows và Linux**. Nếu thiếu hành vi cần thiết thì giữ code cũ.
- **Trạng thái:** code xong 2026-11-24 theo Q-10. `System` để reqwest tự detect, `Direct` gọi `.no_proxy()`, `Manual` vẫn validate URL/`no_proxy`; xoá custom WinINET/env detection và dep `winreg`. `cargo test -p yayl-core proxy` 5 pass, full `cargo test -p yayl-core` 139 pass, `clippy -p yayl-core --all-targets -D warnings` sạch, `cargo check -p yayl-desktop` pass (7m28s); backend-worklog/launcher-reference đã cập nhật. **Chưa test tay Windows/Linux** (người dùng nhận phần này).

### T-11 Gom setup chung của download/verify/repair

- **File:** `apps/desktop/src-tauri/src/download.rs` (`run_download`, `run_verify`, `run_repair`)
- **Việc:** chỉ trích phần setup giống hệt (load settings, build client, load/prepare plan, tổng file/byte). Giữ rõ luồng riêng, huỷ và sự kiện kết thúc.
- **Trạng thái:** xong 2026-11-24. `OperationSetup` gom settings → client → plan (`PlanSource::Resume`/`Saved`) → `Downloader` → tổng file/byte; `run_*` giữ nguyên luồng riêng, cancel và event kết thúc. Bỏ clamp 1–32 ở desktop vì `verify.rs:101` và `downloader.rs:194` đã clamp; `plan_totals` có test. `cargo fmt`, `clippy -p yayl-desktop --all-targets -D warnings`, `cargo test -p yayl-desktop` (14 test) qua.

### T-12 Tổ chức lại state của `App.tsx`

- **File:** `apps/desktop/src/App.tsx` (858 dòng, >12 `useState`, 6 `useEffect`)
- **Việc:** tách custom hook theo nhóm (download, settings, news, update check), dùng `useReducer` cho state có chuyển trạng thái liên quan. Chỉ xét Zustand nếu state thật sự dùng chung rộng và khó đồng bộ.
- Owner: ____ Trạng thái: ____

### T-13 Sinh type IPC từ Rust

- **File:** `apps/desktop/src/lib/ipc.ts` (type chép tay), các DTO trong `src-tauri`
- **Việc:** thêm `ts-rs` 12.0.1; bắt đầu từ DTO request/response ổn định, sinh vào thư mục riêng, có lệnh tái sinh được ghi trong docs. Không dùng `tauri-specta` (Tauri 2 mới có bản rc). Type chỉ của UI vẫn viết tay.
- **Trạng thái:** xong 2026-11-24. `ts-rs` 12.0.1 chỉ annotate 13 DTO ổn định; `.cargo/config.toml` gốc đặt `TS_RS_EXPORT_DIR=apps/desktop/src/lib/generated` và `TS_RS_LARGE_INT=number`. `cargo test -p yayl-desktop export_bindings` 13 pass; `bun run build` (tsc -b + vite) qua, bundle không đổi kích thước. `ipc.ts` chỉ alias type sinh, giữ enum hẹp của UI; lệnh tái sinh ghi tại `docs/backend-worklog.md`.

### T-14 Tách `ipc.ts` thành bản Tauri và bản mock

- **File:** `apps/desktop/src/lib/ipc.ts` (684 dòng, 39 nhánh `IS_TAURI`)
- **Việc:** `ipc.tauri.ts` và `ipc.mock.ts`, chọn một ở điểm vào. Giữ DevBar/mock mode hoạt động.
- Owner: ____ Trạng thái: ____

### T-15 Dọn i18n

- **File:** `apps/desktop/src/i18n.ts` (1009 dòng); script `scripts/check-design-i18n.mjs`
- **Việc:** xoá key của design lab trong app (`anim.*`, `kit.*`, `server.*`, ≥ 67 key) và chuỗi demo kiểu `settings.toast.detect.text`. Rà tiếp key không dùng nhưng **loại trừ key động** (`settings.nav.${id}`, `firstRun.step${n}`, `settings.network.${...}`). Giữ `bun run design:check` chạy được.
- **Trạng thái:** xong 2026-11-24. Script đối chiếu mọi file `src/**/*.ts(x)` (literal + template `${}`) và chỉ giữ `settings.nav.`/`settings.network.`; xoá 238 key/locale (408 → 170, vi/en khớp nhau), gồm toàn bộ `anim.*`, `kit.*` và key lab. `bun run build` (tsc + vite) và `bun run design:check` qua; chưa mở app để xem UI.

### T-16 Tách `data.ts`

- **File:** `apps/desktop/src/data.ts` (9 file production import)
- **Việc:** tách hằng số thật (`GAMES`, `STATE_META`) khỏi fixture mock (`HOME_STATES`, `NEWS`, dữ liệu giả như `D:\Games\YAYL`); fixture chỉ nạp khi dev/mock mode. **Không** lazy-import cả file.
- **Trạng thái:** xong 2026-11-24. `fixtures.ts` giữ NEWS/sample game/server; mọi import runtime đều là `import()` trong nhánh mock (`App`, `ipc`, `NewsWidget`), `data.ts` chỉ còn metadata thật. DevBar lấy state từ `STATE_META`, bỏ `HOME_STATES` chết. `bun run build` qua: fixture thành chunk riêng 2.41 kB (gzip 1.07), index giảm 327.5 → 325.9 kB. Đã mở `bun run dev`: fixtures.ts tải 200, mock playtime "126 giờ 42 phút" hiện đúng, không có lỗi console.

### T-17 Bỏ hardcode tên game

- **File:** `apps/desktop/src/pages/Settings.tsx:888-889` (chip "Arknights EN", "Stella Sora EN")
- **Việc:** lấy từ dữ liệu profile/`GAMES`.
- Owner: ____ Trạng thái: xong

### T-18 Tách `app.css`

- **File:** `apps/desktop/src/styles/app.css` (6350 dòng)
- **Việc:** tách theo component bằng import CSS của Vite, không đổi giao diện. Vì giữ `design/`, ghi quy tắc đồng bộ token/CSS giữa `design/` và `src/` vào `design/README.md`.
- **Trạng thái:** xong 2026-11-24. 29 file con theo component; `app.css` chỉ còn 30 dòng `@import` (dòng 1 cũ + 29 file theo thứ tự). Đối chiếu byte: nối 29 file = thân `app.css` cũ (115960 B); CSS phát ra giữ SHA256 `7D81E478…` (90664 B / gzip 17.43 kB). `bun run build` qua. `design/README.md:77` ghi quy tắc đồng bộ token/CSS. Không mở app; byte-identical CSS nên không đổi giao diện.

### T-19 Dev plugins trong `vite.config.ts`

- **File:** `apps/desktop/vite.config.ts` (`devNewsPlugin`, `devLauncherPlugin`, `AUTH_SALT` lặp với `profile.rs`)
- **Việc:** xác nhận workflow dev còn cần không (chỉ chạy khi `serve`, không vào bundle production). Nếu giữ thì giảm trùng logic/salt; nếu bỏ thì dùng `bun run tauri dev` hoặc fixture JSON tĩnh.
- **Trạng thái:** xong 2026-11-24. Giữ 2 plugin vì browser lab (`!isTauri()`) vẫn dùng bridge; cả hai `apply: "serve"` nên không vào bundle production. Salt/version/host đã lấy từ `launcher-versions.lock.json` — cùng nguồn `build.rs`, không còn hardcode trùng; logic normalize vẫn mirror Rust nhưng có comment ghi rõ. Kiểm chứng `bun run dev`: `/__dev/news`, `/__dev/social`, `/__dev/background` trả 200.

### T-20 Công cụ dev cục bộ (không CI)

- **Việc:** thêm `@biomejs/biome` 2.6.6 và `vitest` 5.1.0 + `@testing-library/react`; chạy tay (`bunx biome check apps/desktop/src`). Bắt đầu test từ `BubbleProgress`, hook tách ở T-12 và `ipc.mock`.
- Owner: ____ Trạng thái: ____

### T-21 Bản cache nhẹ cho ảnh nền tùy chỉnh (thay T-07a)

- **Bối cảnh:** app luôn tải file gốc (`background_source`) trước; cache chỉ dự phòng khi người dùng xoá/di chuyển file gốc. Hiện cache là bản copy nguyên size (`tokio::fs::copy` trong `choose_custom_background`, `commands.rs`), nên file lớn bị nhân đôi trên đĩa.
- **Việc:**
  1. **Frontend:** sau khi ảnh gốc tải được (probe trong `App.tsx`, ~dòng 487), vẽ lên canvas, thu nhỏ cạnh dài ≤ 1920 px, `toBlob("image/jpeg", 0.8)`. Video: lấy một khung hình tĩnh từ `<video>` rồi đi cùng đường JPEG. Ảnh động (GIF/APNG/WebP động): lấy khung đầu. Không chuyển mã video, không thêm crate `image`.
  2. **Rust:** lệnh mới `save_background_cache(bytes)`: từ chối > 4 MiB (ước lượng, chưa đo), ghi atomic vào `cache/custom/` đúng một file, xoá bản cũ, cập nhật `background_path`. Dùng chung hàm ghi atomic với T-02.
  3. **`choose_custom_background`:** bỏ `tokio::fs::copy`; chỉ lưu `background_source` và mở asset scope. `background_path` chỉ được set khi bản nhẹ đã ghi xong.
  4. **Thứ tự dự phòng giữ nguyên:** file gốc → cache nhẹ → ảnh game. Settings ghi chú khi đang dùng cache vì file gốc không còn.
  5. **Máy đã có bản copy nguyên size:** nếu cache lớn hơn ngưỡng và file gốc còn tồn tại thì tạo lại bản nhẹ lúc khởi động; nếu file gốc mất thì giữ nguyên.
- **Xong khi:**
  - Chọn ảnh ~20 MB thì cache chỉ còn vài trăm KB đến ~2 MB (số tham khảo).
  - Xoá file gốc: nền vẫn hiện bản nhẹ. Video bị xoá: hiện khung tĩnh.
  - Không còn file tạm thừa trong cache.
  - `tsc -b`, `vite build`, `cargo fmt/clippy/test` qua.
- **Lưu ý:**
  - Dùng JPEG, không dùng WebP: mã hoá WebP qua canvas không chắc chạy trên mọi webview (chưa kiểm chứng).
  - Video gốc rất lớn vẫn tốn RAM khi giải mã. Cân nhắc cảnh báo mềm ở Settings, không chặn cứng.
  - Kiểm tra nhánh probe cho video trong `App.tsx` (mình chỉ thấy probe cho ảnh).
  - Server background giữ nguyên (đã giới hạn 32 MiB ở `api.rs:525`).
- Owner: opencode Trạng thái: xong 2026-11-20 (cache ảnh 93 KB từ ảnh 3200×2000; video 640×360 → 16 KB)

---

### T-22 Settings: BOM và file hỏng không làm hỏng mọi lệnh
- **File:** `crates/yayl-core/src/settings.rs`, `apps/desktop/src-tauri/src/settings.rs`
- **Việc:** bỏ UTF-8 BOM khi đọc; `Settings::load_or_recover` chuyển file không parse được sang `settings.json.bad` rồi dùng mặc định (lỗi I/O thật vẫn trả về). Desktop `settings::load` dùng nó và ghi `log::warn!`.
- **Xong khi:** test BOM, JSON hỏng, UTF-16, `.bad` cũ bị thay. Kiểm tay: `docs/manual-checks.md`.
- Owner: ____ Trạng thái: xong code 2026-11-28 (`9d723a2`, bản vá được `git am` vào `main`). Kiểm chứng lại sau merge: `cargo test -p yayl-core` 146 pass, `cargo test -p yayl-desktop` 27 pass, `cargo fmt --all -- --check` + `clippy -p yayl-core -p yayl-desktop --all-targets -D warnings` sạch. Chưa kiểm tay Windows (`docs/manual-checks.md`).

### T-23 Cache tin tức/social: validate lại khi đọc, dùng chung hàm ghi atomic
- **File:** `crates/yayl-core/src/api.rs` (`NewsFeed::sanitized`, `SocialLink::sanitized`), `cache.rs`, `commands.rs`
- **Việc:** dữ liệu đọc từ cache đi qua cùng luật URL như dữ liệu mạng; `cache::store` dùng `state::write_atomic_with(.., Relaxed)` thay vì `.part` cố định.
- Owner: ____ Trạng thái: xong code 2026-11-28 (`c25b0fd`). 2 test cache news/social nằm trong 146 test core đã qua; desktop 27 test qua, fmt/clippy sạch. Chưa kiểm tay Windows/offline.

### T-24 Workflow lock: ghim host và duyệt thay đổi nhạy cảm
- **File:** `.github/workflows/check-launcher-update.yml`, `crates/yayl-core/build.rs`
- **Việc:** `build.rs` chỉ nhận `apiBase` dạng `https://*.yo-star.com` thuần; workflow chỉ push thẳng khi `version`/`size`/`sha512` đổi, còn `authSalt`/`apiBase` đổi thì mở PR để người duyệt; action ghim theo SHA. Cần bật "Allow GitHub Actions to create and approve pull requests" trong Settings → Actions.
- Owner: ____ Trạng thái: xong code 2026-11-28 (`8280e3e`, `9072f06`). Đã thử `cargo check -p yayl-core --locked`: host hợp lệ exit 0, 5 host xấu (domain khác, http, có path, có credential, có port) exit 101 đúng thông báo; step `Commit` qua `bash -n`. Workflow chạy build rules rồi mở/cập nhật PR kèm verdict. Chưa chạy Actions thật; cần bật "Allow GitHub Actions to create and approve pull requests" và kiểm tay Windows.

## Docs

### D-01 `AGENTS.md`: sửa mục Stack

Bỏ/đánh dấu "chưa dùng" cho Tailwind 4, Zustand, i18next + react-i18next; ghi đúng: CSS thường + custom properties, `i18n.ts` tự viết. Việc này quan trọng vì coding agent đọc file này sẽ tự thêm đúng các gói đó.
- **Trạng thái:** xong 2026-11-22.

### D-02 `README.md`

Sửa đoạn Status ("early development, chỉ có UI lab") và bảng "Planned stack" cho khớp thực tế.
- **Trạng thái:** xong 2026-11-22.

### D-03 `docs/roadmap.md`

Tick M0 (scaffold Tauri + React), M1, các mục M2/M4 đã có code (đối chiếu từng mục trước khi tick). Sửa dòng M3 về `i18next` và `Zustand` theo quyết định ở trên.
- **Trạng thái:** xong 2026-11-22 (chỉ tick mục đã đối chiếu source; uninstall/first-run/bandwidth/log viewer để trống).

### D-04 Gộp TODO

Giữ **một** file TODO (file này); xoá `TODO-later.md` và bản `TODO.md` cũ.
- **Trạng thái:** xong (chỉ còn `TODO.md`; `TODO-later.md` và `audit.md` đã gỡ — D-05 khôi phục audit).

### D-05 `audit.md`

Chuyển vào `docs/` (ví dụ `docs/audit-2026-11-10.md`), thêm dòng trạng thái từng mục A-01…A-09 và ghi chú đã đối chiếu source.
- **Trạng thái:** xong 2026-11-23. A-01…A-04 resolved kèm commit (`9ce59a3`, `3d431ad`, `1465b84`, `44b5a21`), A-05…A-09 giữ open; đã ghi 137 test + fmt/clippy.

### D-06 `docs/backend-worklog.md`

Archive hoặc xoá mục "3. Task board" và "8. Nhật ký" (dễ lỗi thời); giữ phần quyết định kỹ thuật và API đã xác minh.
- **Trạng thái:** xong 2026-11-23. Đã xoá 2 mục, đánh số lại 1–6, cập nhật header (trỏ tiến độ về `TODO.md`/`roadmap`), thêm các module còn thiếu vào file map.

### D-07 `docs/security-review-2026-11-07.md`

Cập nhật mục #5 sau T-05.
- **Trạng thái:** xong 2026-11-24. Status header, mục "Local manifest completeness and launch integrity" và comparison summary ghi rõ Q-05 + commit `d3365c2`: bad `vc` → damaged, `invalid_files` (serde-skip), `damaged_files` chặn launch. Chỉ sửa docs review; các finding còn lại giữ nguyên.

## Đo đạc

### M-01 Kiểm ngân sách (roadmap M5)

Đo trên bản build Windows: installer ≤ 15 MB, cài đặt ≤ 40 MB, RAM nhàn rỗi ≤ 120 MB, khởi động nguội ≤ 1,5 giây (theo AGENTS.md). Ghi số đo vào docs.

---

## Thứ tự đề xuất

1. T-01, T-06, T-03, T-04 (nhỏ, rủi ro thấp) → T-02 → T-05
2. T-08, T-09, T-07
3. D-01, D-02, D-03, D-04, D-05, D-06, D-07
4. T-14, T-15, T-16, T-17, T-12, T-13
5. T-10 (cần máy Windows), T-11, T-18, T-19, T-20, M-01
