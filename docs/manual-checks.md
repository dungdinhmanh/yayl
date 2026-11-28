# Kiểm tra tay trên Windows

Các việc agent không chạy được (xem `TODO.md`: T-06, T-08, T-09, T-10 và sự kiện `online`).
Làm trên bản build thật (`bun run tauri build` hoặc `bun run tauri dev`). Ghi kết quả vào `agent-chat.md`.

## Chuẩn bị: proxy đếm request

```powershell
pip install mitmproxy
mitmdump --listen-port 8080
```

`mitmdump` in mỗi request đi qua nó. Với HTTPS chỉ cần thấy dòng `CONNECT api-launcher-en.yo-star.com:443`, không cần giải mã.
Bên Settings của YAYL, mở mục mạng (proxy). Mỗi ca dưới đây: bấm làm mới tin tức hoặc mở lại app, rồi nhìn cửa sổ `mitmdump`.

## T-10: proxy (4 ca + hệ thống)

| # | Cấu hình | Kỳ vọng |
|---|---|---|
| 1 | Không dùng proxy (`Direct`) | Tin tức tải được; `mitmdump` **không** thấy request nào |
| 2 | Tuỳ chỉnh `http://127.0.0.1:8080` | `mitmdump` thấy `CONNECT api-launcher-en.yo-star.com:443`; tin tức tải được |
| 3 | Tuỳ chỉnh dùng proxy `https://...` (chỉ khi có proxy TLS) | Tin tức tải được qua proxy, hoặc báo lỗi rõ ràng |
| 4 | Ca 2 + ô bypass `api-launcher-en.yo-star.com` | Tin tức vẫn tải được; `mitmdump` **không** thấy request |
| 5 | Chế độ hệ thống, bật proxy Windows `127.0.0.1:8080` (Settings → Network & internet → Proxy → Manual) | `mitmdump` thấy request; tắt proxy Windows rồi mở lại app thì không còn |

Cũng thử tải thử một game (hoặc nút verify) ở ca 2 và ca 5 để chắc file tải đi qua proxy.
Trên Linux: đặt `HTTPS_PROXY=http://127.0.0.1:8080` rồi chạy app ở chế độ hệ thống.

## Offline và làm mới khi có mạng lại
1. Mở app khi có mạng (để có cache), đóng app.
2. Ngắt mạng (hoặc đặt proxy tuỳ chỉnh vào cổng không có ai nghe) rồi mở app: vẫn hiện tin cũ, không có banner giả.
3. Bật lại mạng khi app đang mở: tin tức và ảnh nền tự làm mới (sự kiện `online`).

## T-08: một instance
Chạy `YAYL.exe` lần 2 (cả khi cửa sổ đang thu nhỏ hoặc ẩn trong khay): chỉ còn **một** tiến trình trong Task Manager và cửa sổ cũ được đưa lên trước.

## T-09: log thật
Mở thư mục log (thường `%LOCALAPPDATA%\app.yayl.launcher\logs`, tên file bắt đầu bằng `yayl`).
Ngắt mạng giữa lúc đang tải để tạo lỗi, rồi kiểm tra: có dòng `download ... failed`, và **không** có token, `authSalt` hay URL kèm khoá.

## T-22: settings.json hỏng
Đường dẫn: `%APPDATA%\yayl\settings.json`. Với app đã đóng:
1. Lưu file bằng "UTF-8 with BOM" (Notepad cũ): app mở bình thường, giữ nguyên cài đặt.
2. Ghi `{ hỏng` vào file: app vẫn mở, dùng mặc định, và có `settings.json.bad` chứa nội dung cũ.

## T-06: tốc độ CRC-64
Repo chưa có bench, nên chưa đo lại được 1953 MiB/s sau khi gộp vòng đọc. Nếu cần chắc, đo nhanh trên file vài GB (hash bằng `yayl-cli` hoặc test tạm) trước và sau commit `44b5a21`.
