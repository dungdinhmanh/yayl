# TODO

Danh sách cần fix cho YAYL, rút ra từ đợt review ngày 2026-11-10.
Số phiên bản lấy từ npm/crates.io cùng ngày, chỉ tính bản stable.

## A. Lỗi / bảo mật (làm trước)

- [ ] Thêm `"core:window:allow-start-dragging"` vào `apps/desktop/src-tauri/capabilities/default.json`. Titlebar dùng `data-tauri-drag-region` nhưng quyền này không nằm trong `core:default` (đã đối chiếu với Tauri 2.11.6, chưa chạy app để xác nhận).
- [ ] Đặt CSP thay cho `csp: null` trong `tauri.conf.json`. `img-src` phải cho phép `asset:`, `http://asset.localhost` và các host ảnh của news.
- [ ] Nâng crate `tauri` lên cùng minor với npm (crate 2.11.6, `@tauri-apps/api` và `cli` đã 2.12.4).
- [ ] `validate_remote_url` (`crates/yayl-core/src/url.rs`) cho phép `http` loopback cả ở bản release. Thu hẹp bằng `cfg(test)` hoặc feature.

## B. Nâng cấp phiên bản

- [ ] Rust (Tauri): `tauri` 2.12.5, `tauri-build` 2.7.4, `tauri-plugin-dialog` 2.8.4, `tauri-plugin-opener` 2.7.2.
      `cargo update -p tauri -p tauri-build -p tauri-plugin-dialog -p tauri-plugin-opener`
- [ ] `animejs` 3.2.2 → 4.5.0 (chỉ `BubbleProgress.tsx` dùng), gỡ `@types/animejs`. API đổi, đọc migration guide v4.
- [ ] `vite` 7.3.7 → 8.3.7 **cùng** `@vitejs/plugin-react` 5.2.0 → 6.3.0 (Node ≥ 20.19 hoặc ≥ 22.12).
- [ ] `sha2` và `md-5` lên 0.11 cùng nhau; `fs4` 0.13 → 1.1.0; `reqwest` 0.12 → 0.13 (đọc changelog, tên feature có thể đổi).
- [ ] Dọn bản trùng trong lock: `windows-sys` 0.59 → 0.61, `winreg` 0.55 → 0.56, `base64` 0.22 → 0.23.
- [ ] `typescript` 5.9.3 → 7.0.2 (làm sau cùng, trên nhánh riêng, kiểm tra `tsc -b`).

## C. Thay code tự viết bằng package có sẵn

- [ ] `crates/yayl-core/src/crc64.rs` → crate `crc` 3.4.0 (`CRC_64_XZ`). Giữ test vector cũ (`"123456789"` → `0x995DC9BBDF1939FA`).
- [ ] `crates/yayl-core/src/state.rs` (`unsafe MoveFileExW`) → `tempfile::NamedTempFile::persist` (chuyển `tempfile` từ dev-dependency sang dependency), rồi bỏ `windows-sys` khỏi `yayl-core` (chỉ file này dùng).
- [ ] `crates/yayl-core/src/proxy.rs`: mode `System` dùng `system-proxy` của reqwest, bỏ `winreg`, `env_proxy`, `parse_proxy_server`. **Phải test trên Windows có proxy thật.**
- [ ] `apps/desktop/src/lib/ipc.ts` (25 type chép tay từ Rust) → `ts-rs` 12.0.1 sinh type TS. Không dùng `tauri-specta` (Tauri 2 mới có bản rc).
- [ ] `App.tsx` (hơn 12 `useState`, 6 `useEffect`) → `zustand` 5.1.0, đăng ký `onDownloadProgress` một lần ở root.
- [ ] Thêm `tauri-plugin-single-instance` 2.5.5 (chặn mở 2 launcher cùng lúc).
- [ ] Thêm `tauri-plugin-log` 2.10.1 (bản stable, không lấy 3.0 alpha).
- [ ] Thêm `@biomejs/biome` 2.6.6 (chạy local: `bunx biome check apps/desktop/src`).
- [ ] Thêm `vitest` 5.1.0 + `@testing-library/react` cho frontend (hiện 0 test).

## D. Dọn code

- [ ] Xoá key i18n của design lab trong `i18n.ts`: `anim.*` (28), `kit.*` (24), `server.*` (15), tức ≥ 67 key. Sau đó lọc nốt key không dùng (292/491 key không xuất hiện trực tiếp, nhưng có key động như `settings.nav.${id}`, `firstRun.step${n}`, nên kiểm tra tay).
- [ ] `data.ts` (mock sinh từ `design/assets/js/mock-data.js`): chỉ nạp qua `import()` khi `import.meta.env.DEV` hoặc không chạy trong Tauri, để không nằm trong bundle production.
- [ ] Xoá `design/` (đã port xong) hoặc chỉ giữ một nguồn CSS. `design/assets/css/app.css` và `src/styles/app.css` trùng ~95% (chỉ 421 dòng khác).
- [ ] Tách `ipc.ts` thành `ipc.tauri.ts` và `ipc.mock.ts` (hiện 36 nhánh `IS_TAURI` trong 593 dòng).
- [ ] Xoá `devNewsPlugin` và `devLauncherPlugin` trong `vite.config.ts` (~230 dòng, chép lại logic API của Rust và trùng `AUTH_SALT`). Dev với dữ liệu thật dùng `bun run tauri dev`, hoặc phục vụ JSON fixture tĩnh.
- [ ] `Settings.tsx:711-712`: chip "Arknights EN" và "Stella Sora EN" hardcode → lấy từ dữ liệu profile.
- [ ] Tách `apps/desktop/src/styles/app.css` (6.328 dòng) thành file theo component.

## E. Docs

- [ ] `AGENTS.md`: mục Stack ghi Tailwind 4, Zustand, i18next nhưng `package.json` không có. Sửa cho khớp thực tế (hoặc cập nhật sau khi làm mục C).
- [ ] `docs/roadmap.md`: tick M1 và M2 theo code đã có.
- [ ] `docs/security-review-2026-11-07.md`: ghi chú hai lỗi đã được sửa (validate news URL ở `api.rs`, `ensure_allowed_root` trong `launch_game`) và overflow đã dùng `checked_add` ở `manifest.rs`.
- [ ] `docs/backend-worklog.md` (417 dòng): gộp hoặc archive, loại file nhật ký lỗi thời nhanh.

## Không làm (đã cân nhắc)

- CI test/lint: chưa cần, giữ SAST + secret detection hiện có trong `.gitlab-ci.yml`.
- Thay `downloader.rs` / `download_plan.rs` bằng thư viện chung: logic đặc thù giao thức (CRC trước khi commit, checkpoint, chuyển CDN chính/phụ).
- Chuyển i18n sang `i18next` + `react-i18next` (~1 MB unpacked) hoặc migrate sang Tailwind 4: không đáng với app này.
- Dùng `backon` thay `sleep_backoff`: lợi ích quá nhỏ.
