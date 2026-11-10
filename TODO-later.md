# TODO sau

Các mục chưa làm, tách khỏi `TODO.md` và `audit.md` ngày 2026-11-10.

## Đã quyết định

- `design/` giữ nguyên: đây là nơi xem trước UI trước khi port sang React.
- CRC-64: giữ implementation slicing-by-8. Bench 32 MiB (best / median):
  - hiện tại: 1953 / 1865 MiB/s
  - `crc` 3.4.0 (`CRC_64_XZ`): 476 / 467 MiB/s
- Zustand: chưa thêm. Thử custom hook rồi `useReducer` trước (audit A-08).
- Update/minimum-version: đã nối vào bootstrap và `launch_game` (security review #4).

## Bảo mật / hardening

- [x] `capabilities/default.json`: thêm `core:window:allow-start-dragging` cho titlebar.
- [x] `tauri.conf.json`: CSP production và `devCsp`; `img-src` cho `asset:`, `http://asset.localhost`, `https:` và `data:`.
- [x] Nâng crate `tauri` 2.12.5 (npm `@tauri-apps/api`/`cli` 2.12.4), kéo theo `tauri-build` 2.7.4, `tauri-plugin-dialog` 2.8.4, `tauri-plugin-opener` 2.7.3.
- [x] `validate_remote_url`: chỉ cho loopback `http` trong `cfg(test)`.

Tauri 2.12.5 yêu cầu Rust 1.90, nên workspace `rust-version` đã nâng 1.85 → 1.90. Máy build hiện dùng Rust 1.98.

## Nâng cấp

- [ ] `animejs` 4.5.0, bỏ `@types/animejs`.
- [ ] `vite` 8.3.7 cùng `@vitejs/plugin-react` 6.3.0.
- [ ] `sha2` và `md-5` 0.11, `fs4` 1.1.0, `reqwest` 0.13.
- [ ] `windows-sys` 0.61, `winreg` 0.56, `base64` 0.23.
- [ ] `typescript` 7.0.2 trên nhánh riêng.

## Thay code tự viết

- [ ] `state.rs`: `MoveFileExW` → `tempfile::NamedTempFile::persist`, rồi bỏ `windows-sys` khỏi core.
- [ ] `proxy.rs`: dùng `system-proxy` của reqwest; test Windows/Linux với proxy thật.
- [ ] `ipc.ts`: sinh type bằng `ts-rs`.
- [ ] `App.tsx`: tách custom hook/`useReducer` trước; chỉ dùng Zustand nếu state thật sự chia sẻ rộng.
- [ ] `tauri-plugin-single-instance`.
- [ ] `tauri-plugin-log` (bản stable).
- [ ] `@biomejs/biome`.
- [ ] `vitest` + `@testing-library/react`.

## Dọn code

- [ ] Xoá key i18n `anim.*`, `kit.*`, `server.*`, rồi rà key động.
- [ ] `data.ts`: lazy import chỉ trong dev.
- [ ] `design/`: giữ nguyên, không xoá.
- [ ] Tách `ipc.ts` thành `ipc.tauri.ts` và `ipc.mock.ts`.
- [ ] Xoá dev plugins trong `vite.config.ts` sau khi xác nhận workflow (audit khuyến nghị giữ đến khi hiểu rõ).
- [ ] `Settings.tsx`: bỏ hardcode tên game, lấy từ profile.
- [ ] Tách `app.css` theo component.

## Docs

- [ ] `AGENTS.md`: sửa mục Stack cho khớp `package.json`.
- [ ] `docs/roadmap.md`: tick M1/M2.
- [ ] `docs/security-review-2026-11-07.md`: ghi chú #1–#4 đã sửa; #5 còn chờ chốt trust model.
- [ ] `docs/backend-worklog.md`: gộp hoặc archive.

## Audit còn lại

- [ ] A-01: `crc64_file_blocking` delegate cho `crc64_reader`.
- [ ] A-02: `DownloadTask::load` phân biệt `NotFound` với lỗi filesystem.
- [ ] A-03: thay `unwrap_or(0)` ở metadata bằng xử lý `NotFound` tường minh.
- [ ] A-04: `state.rs` migration không bỏ qua lỗi `rename`.
- [ ] A-05: atomic write dùng temp file duy nhất, review concurrency và Windows/Linux.
- [ ] A-06: review `proxy.rs` với `system-proxy`.
- [ ] A-07: gom setup chung của download/verify/repair.
- [ ] A-08: tổ chức lại state frontend.
- [ ] A-09: sinh type IPC từ Rust.
- [ ] Security #5: chốt trust model của `LocalManifest::validate` (đang âm thầm bỏ entry sai `vc`).
