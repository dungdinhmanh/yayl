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
- Owner: ____ Trạng thái: ____

### T-02 Ghi file atomic bằng `tempfile::persist` (thay `unsafe`)
- **File:** `crates/yayl-core/src/state.rs` (`write_atomic_with`, dòng 87; khối `MoveFileExW` dòng ~109–122)
- **Việc:** dùng `tempfile::NamedTempFile::new_in(dir)` + `persist` (chuyển `tempfile` 3.27 từ dev-dep sang dependency). Giữ phân biệt `Durability::Full`/`Relaxed` và phòng symlink/planted-link. Bỏ `windows-sys` khỏi `yayl-core` nếu không còn chỗ dùng (hiện chỉ file này).
- **Xong khi:** không còn `unsafe`; test ghi đè file có sẵn, hai ghi đồng thời, dọn file tạm khi lỗi; chạy trên Windows và Linux.
- Owner: ____ Trạng thái: ____

### T-03 Migration state không nuốt lỗi `rename`
- **File:** `crates/yayl-core/src/state.rs:46` (`let _ = std::fs::rename(&legacy, &path)`)
- **Việc:** trả lỗi hoặc dùng file cũ có chủ đích và báo là chưa migrate. Không xoá file legacy trước khi state mới ghi xong.
- **Xong khi:** test migrate thành công, thiếu legacy, đích đã có, rename lỗi.
- Owner: ____ Trạng thái: ____

### T-04 Rà `unwrap_or(0)` ở metadata trong downloader
- **File:** `crates/yayl-core/src/downloader.rs` (dòng 371, 398, 462, 533, 775, 790, 794)
- **Việc:** xét từng chỗ; chỗ nào cần "thiếu file = 0" thì dùng helper `file_len_or_zero` (chỉ `NotFound` → 0, lỗi khác propagate). Không thay máy móc.
- **Xong khi:** test resume với checkpoint hợp lệ + `.part` bị cắt; file `.part` thiếu vẫn recover như cũ.
- Owner: ____ Trạng thái: ____

### T-05 `LocalManifest::validate` fail-closed (security #5)
- **File:** `crates/yayl-core/src/local_manifest.rs:96-108`, `process.rs:92-118`
- **Việc:** entry có checksum `vc` sai không bị bỏ im lặng mà coi là **damaged/cần tải lại**, để verify/repair xử lý.
- **Xong khi:** test manifest hỏng 1 entry → `damaged_files` báo đúng entry đó; cập nhật `docs/security-review` mục #5.
- Owner: ____ Trạng thái: ____

### T-06 Gộp vòng lặp CRC trùng
- **File:** `crates/yayl-core/src/crc64.rs:82-108`
- **Việc:** `crc64_file_blocking` mở file rồi gọi `crc64_reader`; sửa doc comment sai của `crc64_reader`. **Không đổi thuật toán.**
- **Xong khi:** test vector cũ (`"123456789"` → `0x995DC9BBDF1939FA`) qua; bench không tụt so với 1953 MiB/s.
- Owner: ____ Trạng thái: ____

### T-07 Ảnh nền tùy chỉnh: giới hạn dung lượng + tránh copy chính nó
- **File:** `apps/desktop/src-tauri/src/commands.rs` (`choose_custom_background`)
- **Việc:** (a) kiểm tra dung lượng trước khi copy (**cần chốt mức**; ảnh nền từ server giới hạn 32 MiB ở `api.rs:525`, mp4 người dùng có thể cần cao hơn); (b) nếu `path == dest` thì bỏ qua copy (copy file lên chính nó có thể cắt cụt).
- **Xong khi:** file quá lớn trả lỗi `invalid_input` có mã ổn định; chọn lại file đang nằm trong cache không làm mất dữ liệu.
- Owner: ____ Trạng thái: ____

### T-08 Single instance
- **Việc:** thêm `tauri-plugin-single-instance` 2.5.5; mở lần 2 thì focus cửa sổ cũ.
- **Xong khi:** chạy 2 lần chỉ còn 1 tiến trình; không xung đột file state/task.
- Owner: ____ Trạng thái: ____

### T-09 Log cục bộ
- **Việc:** thêm `tauri-plugin-log` 2.10.1 (bản stable, không lấy 3.0 alpha), chỉ ghi file local; **không upload** (ràng buộc "no telemetry"). Không log token/salt/URL có credential.
- **Xong khi:** lỗi tải/verify để lại log đọc được; đã rà log không lộ dữ liệu nhạy cảm.
- Owner: ____ Trạng thái: ____

---

## P2. Bảo trì

### T-10 Proxy mode `System` dùng reqwest
- **File:** `crates/yayl-core/src/proxy.rs` (`env_proxy`, `windows_system_proxy`, `parse_proxy_server`; dep `winreg`)
- **Việc:** workspace đã bật `reqwest` feature `system-proxy`; thử để mode `System` dùng hành vi mặc định, giữ `Direct` và `Manual` rõ ràng. Bỏ `winreg` nếu không còn dùng.
- **Xong khi:** test tay: không proxy, HTTP, HTTPS, bypass/no-proxy trên **Windows và Linux**. Nếu thiếu hành vi cần thiết thì giữ code cũ.
- Owner: ____ Trạng thái: ____

### T-11 Gom setup chung của download/verify/repair
- **File:** `apps/desktop/src-tauri/src/download.rs` (`run_download`, `run_verify`, `run_repair`)
- **Việc:** chỉ trích phần setup giống hệt (load settings, build client, load/prepare plan, tổng file/byte). Giữ rõ luồng riêng, huỷ và sự kiện kết thúc.
- Owner: ____ Trạng thái: ____

### T-12 Tổ chức lại state của `App.tsx`
- **File:** `apps/desktop/src/App.tsx` (858 dòng, >12 `useState`, 6 `useEffect`)
- **Việc:** tách custom hook theo nhóm (download, settings, news, update check), dùng `useReducer` cho state có chuyển trạng thái liên quan. Chỉ xét Zustand nếu state thật sự dùng chung rộng và khó đồng bộ.
- Owner: ____ Trạng thái: ____

### T-13 Sinh type IPC từ Rust
- **File:** `apps/desktop/src/lib/ipc.ts` (type chép tay), các DTO trong `src-tauri`
- **Việc:** thêm `ts-rs` 12.0.1; bắt đầu từ DTO request/response ổn định, sinh vào thư mục riêng, có lệnh tái sinh được ghi trong docs. Không dùng `tauri-specta` (Tauri 2 mới có bản rc). Type chỉ của UI vẫn viết tay.
- Owner: ____ Trạng thái: ____

### T-14 Tách `ipc.ts` thành bản Tauri và bản mock
- **File:** `apps/desktop/src/lib/ipc.ts` (684 dòng, 39 nhánh `IS_TAURI`)
- **Việc:** `ipc.tauri.ts` và `ipc.mock.ts`, chọn một ở điểm vào. Giữ DevBar/mock mode hoạt động.
- Owner: ____ Trạng thái: ____

### T-15 Dọn i18n
- **File:** `apps/desktop/src/i18n.ts` (1009 dòng); script `scripts/check-design-i18n.mjs`
- **Việc:** xoá key của design lab trong app (`anim.*`, `kit.*`, `server.*`, ≥ 67 key) và chuỗi demo kiểu `settings.toast.detect.text`. Rà tiếp key không dùng nhưng **loại trừ key động** (`settings.nav.${id}`, `firstRun.step${n}`, `settings.network.${...}`). Giữ `bun run design:check` chạy được.
- Owner: ____ Trạng thái: ____

### T-16 Tách `data.ts`
- **File:** `apps/desktop/src/data.ts` (9 file production import)
- **Việc:** tách hằng số thật (`GAMES`, `STATE_META`) khỏi fixture mock (`HOME_STATES`, `NEWS`, dữ liệu giả như `D:\Games\YAYL`); fixture chỉ nạp khi dev/mock mode. **Không** lazy-import cả file.
- Owner: ____ Trạng thái: ____

### T-17 Bỏ hardcode tên game
- **File:** `apps/desktop/src/pages/Settings.tsx:888-889` (chip "Arknights EN", "Stella Sora EN")
- **Việc:** lấy từ dữ liệu profile/`GAMES`.
- Owner: ____ Trạng thái: ____

### T-18 Tách `app.css`
- **File:** `apps/desktop/src/styles/app.css` (6350 dòng)
- **Việc:** tách theo component bằng import CSS của Vite, không đổi giao diện. Vì giữ `design/`, ghi quy tắc đồng bộ token/CSS giữa `design/` và `src/` vào `design/README.md`.
- Owner: ____ Trạng thái: ____

### T-19 Dev plugins trong `vite.config.ts`
- **File:** `apps/desktop/vite.config.ts` (`devNewsPlugin`, `devLauncherPlugin`, `AUTH_SALT` lặp với `profile.rs`)
- **Việc:** xác nhận workflow dev còn cần không (chỉ chạy khi `serve`, không vào bundle production). Nếu giữ thì giảm trùng logic/salt; nếu bỏ thì dùng `bun run tauri dev` hoặc fixture JSON tĩnh.
- Owner: ____ Trạng thái: ____

### T-20 Công cụ dev cục bộ (không CI)
- **Việc:** thêm `@biomejs/biome` 2.6.6 và `vitest` 5.1.0 + `@testing-library/react`; chạy tay (`bunx biome check apps/desktop/src`). Bắt đầu test từ `BubbleProgress`, hook tách ở T-12 và `ipc.mock`.
- Owner: ____ Trạng thái: ____

---

## Docs

### D-01 `AGENTS.md`: sửa mục Stack
Bỏ/đánh dấu "chưa dùng" cho Tailwind 4, Zustand, i18next + react-i18next; ghi đúng: CSS thường + custom properties, `i18n.ts` tự viết. Việc này quan trọng vì coding agent đọc file này sẽ tự thêm đúng các gói đó.

### D-02 `README.md`
Sửa đoạn Status ("early development, chỉ có UI lab") và bảng "Planned stack" cho khớp thực tế.

### D-03 `docs/roadmap.md`
Tick M0 (scaffold Tauri + React), M1, các mục M2/M4 đã có code (đối chiếu từng mục trước khi tick). Sửa dòng M3 về `i18next` và `Zustand` theo quyết định ở trên.

### D-04 Gộp TODO
Giữ **một** file TODO (file này); xoá `TODO-later.md` và bản `TODO.md` cũ.

### D-05 `audit.md`
Chuyển vào `docs/` (ví dụ `docs/audit-2026-11-10.md`), thêm dòng trạng thái từng mục A-01…A-09 và ghi chú đã đối chiếu source.

### D-06 `docs/backend-worklog.md`
Archive hoặc xoá mục "3. Task board" và "8. Nhật ký" (dễ lỗi thời); giữ phần quyết định kỹ thuật và API đã xác minh.

### D-07 `docs/security-review-2026-11-07.md`
Cập nhật mục #5 sau T-05.

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
