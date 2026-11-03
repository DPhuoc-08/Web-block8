# Bằng chứng nộp — Block 8 (xác thực SSR trên database block7)

Thu ngày 03/11/2026 bằng `node scripts/collect-evidence.mjs` (trong `source-code/`): script tự chạy server thật ở `http://localhost:3000`, điều khiển **Chrome thật** (headless, DevTools Protocol) qua từng kịch bản, rồi gửi thêm request trực tiếp như `curl -i`. Thư đi vào hộp thư thử nghiệm (`MAIL_TRANSPORT=file`). Tài khoản thử dùng tên miền `demo.example` và bị xoá ở cuối cùng bộ đếm giới hạn → DB trở lại trạng thái sau seed. Chạy lại script là thu lại toàn bộ thư mục (trừ hai file log kiểm thử `curl/9`, `curl/10`).

**Đã che:** mật khẩu, mã kích hoạt, reset token, `_csrf`, `g-recaptcha-response` → `<đã che>`; `sid` → `<đã che · vân tay xxxxxxxx>` (8 ký tự đầu SHA-256 của giá trị, để so được sid trước / sau mà không dùng lại được); hash trong DB chỉ để 6 ký tự đầu, Argon2id chỉ để phần tham số. Script **từ chối ghi** nếu sau khi che còn sót một giá trị bí mật nó biết. Thư mục này không chứa `.env`, chuỗi kết nối, host database, `SESSION_SECRET`, `OTP_PEPPER`, App Password hay secret reCAPTCHA (đã quét lại sau khi ghi).

**CAPTCHA trong ảnh là key thử của Google** (dòng chữ đỏ "for testing purposes only"). Bấm ô "Tôi không phải người máy" từ Chrome do script điều khiển thì widget quay mãi — Google nhận ra trình duyệt tự động; mình không tìm cách lách. Vì secret thử chấp nhận mọi token, script điền một token thử vào ô `g-recaptcha-response`, nên ảnh thấy ô chưa tick. Đây **không** phải bằng chứng chặn bot: tick thật, token dùng lại, token hết hạn làm tay với key thật (checklist BUILD_LOG bước 16).

## Đối chiếu bảng nghiệm thu của đề

| Kịch bản của đề | Kết quả cần chứng minh | Ảnh `screens/` | Network / request / DB |
| :--- | :--- | :--- | :--- |
| Đăng ký, tài khoản pending đăng nhập | Không có session, báo cần kích hoạt | `06-dang-nhap-chua-kich-hoat-375` | `db/2` (user `pending`, 0 phiên), `network` mục 3 |
| Đăng ký với `role=admin` trong body | Server gán `viewer` | — | `curl/4` (DB `role=viewer`) |
| Email mới / đang pending / đã active | Cùng status, cùng trang; pending không ghi đè mật khẩu; active không gửi thư | — | `curl/4` (cùng `303 /activate?msg=registered`; vân tay hash không đổi; 0 thư) |
| Mã kích hoạt hợp lệ | `active` + `emailVerifiedAt` + `usedAt`, không tự đăng nhập | `07-kich-hoat-xong-375` | `network` mục 4 (`303 /login?msg=activated`), `db/3` |
| Mã sai | Thông báo chung, tăng `attempts` | `05-ma-sai-375` | `network` mục 2 (200 + `INVALID_OTP`), `db/2` (`attempts=1`) |
| Mã chỉ lưu dạng băm | Không có mã trong DB, log, trang | `04-nhap-ma-sau-dang-ky-*` | `db/1` (`otpHash` HMAC 64 ký tự), `mail/1`, `curl/8` (log không có mã) |
| Thiếu CAPTCHA / tự khai "đã qua" | Từ chối trước khi băm mật khẩu, tạo user | `02-dang-ky-chua-tick-captcha-375` | `curl/5` (`CAPTCHA_REQUIRED`, không có user `bot@…`) |
| Lỗi nhập ở form đăng ký | 200 + chỉ rõ ô sai | `02-dang-ky-loi-nhap-375` | — |
| Sai mật khẩu / email không có | Cùng một thông báo, giữ email, bỏ mật khẩu | `15-dang-nhap-sai-375` | `curl/9` phần D |
| Sai 3 lần | Lần sau phải qua CAPTCHA | `16-dang-nhap-can-captcha-375` | `curl/9` phần C |
| Sai 10 lần | Khoá 5 phút, `429` + `Retry-After`, kể cả khi mật khẩu đúng | `17-tam-khoa-429-375` | `network` mục 12, `curl/7` (mật khẩu ĐÚNG vẫn 429), `db/7` (`count=10`, `lockedUntil`) |
| Đăng nhập đúng | `303`, `Set-Cookie` sid **mới**, cookie HttpOnly / SameSite=Lax / Path=/ | `09-quan-tri-da-dang-nhap-1280`, `-375` | `network` mục 5–7 (vân tay sid trước ≠ sau), `db/4` (bản ghi `sessions` gắn `userId`) |
| Chưa đăng nhập gọi CRUD (cả curl không cookie, cookie bịa) | `303 /login`, dữ liệu không đổi | `08-chua-dang-nhap-vao-quan-tri-1280` | `curl/1` (9 request GET/POST/PATCH/DELETE đều 303; 1.200 món, món #1 không đổi) |
| Khởi động lại server | Cookie cũ vẫn đăng nhập (session ở DB) | — | `curl/3` (200 trước và sau khi dừng / chạy lại tiến trình) |
| Đăng xuất | Huỷ phiên ở DB, xoá cookie, `303 /login`; sid cũ bị từ chối; không có `GET /logout` | `10-da-dang-xuat-375` | `network` mục 8–9, `curl/2` (sid cũ → 303, 0 bản ghi; `GET /logout` → 404) |
| Form gửi từ trang khác (CSRF) | Từ chối | — | `curl/2` (thiếu `_csrf` → 403; `Origin` trang lạ → 403) |
| Quên mật khẩu: email có / không có | Cùng status, cùng trang, thời gian gần nhau | `11-quen-mat-khau-da-gui-375` | `curl/6`, `mail/2` (link từ `APP_ORIGIN`) |
| Mở link đặt lại | Chỉ hiện form, không tiêu thụ token, `Referrer-Policy: no-referrer` | `12-dat-lai-mat-khau-375` | `network` mục 10, `db/5` (`usedAt` rỗng, chỉ lưu SHA-256, hạn 15 phút) |
| Đặt mật khẩu mới | Token dùng xong, mật khẩu đổi, mọi phiên cũ bị xoá, không tự đăng nhập | `13-dat-lai-xong-375` | `network` mục 11, `db/6` (vân tay hash đổi, `usedAt` có giá trị, 0 phiên), `mail/3` |
| Dùng lại link | "Link không dùng được" | `14-link-da-dung-375` | `curl/9` phần E |
| Toàn bộ bảng nghiệm thu + hồi quy thực đơn / quản trị | ĐẠT hết | — | `curl/9-check-auth.txt` **94/94**, `curl/10-check-ssr.txt` **48/48** |

Giao diện ở 3 cỡ màn hình: `01-dang-ky-1280`, `-820`, `-375`; `04-nhap-ma-sau-dang-ky-1280`, `-375`; `09-quan-tri-da-dang-nhap-1280`, `-375`.

## Hai lỗi chỉ lộ ra khi thu bằng chứng bằng trình duyệt thật

Cả hai đã có trong BUILD_LOG bước 18 (tái hiện, nguyên nhân, cách sửa, bằng chứng sau khi sửa):

1. **Chrome không đặt lại được mật khẩu (403).** Trang đặt lại có `Referrer-Policy: no-referrer`; theo chuẩn Fetch, form gửi từ trang như vậy mang `Origin: null`, bị lớp kiểm tra Origin chặn. Sau khi sửa: `network` mục 11 — `Origin: null` → `303`.
2. **`curl` không cookie gọi CRUD nhận 403 thay vì `303 /login`.** CSRF chạy trước `requireLogin`. Sau khi sửa: `curl/1` — mọi request đều 303.

## Cấu trúc

| Thư mục | Nội dung |
| :--- | :--- |
| `screens/` | 22 ảnh Chrome theo thứ tự luồng (đăng ký → kích hoạt → đăng nhập → quản trị → đăng xuất → quên / đặt lại → dò mật khẩu) |
| `network/network-log.md` | Request trang của Chrome (header Origin, Cookie, Set-Cookie, Location, Referrer-Policy, Retry-After; form data đã che) và bảng cookie như tab Application |
| `curl/` | Request gửi trực tiếp (không qua giao diện) kèm status, header, kết quả DB; log server; output hai script kiểm tra |
| `db/` | Bản ghi `users`, `activation_challenges`, `password_resets`, `sessions`, `rate_limits` ở từng thời điểm |
| `mail/` | Ba thư của luồng (kích hoạt, đặt lại, báo đã đổi mật khẩu) |
| `diagrams/` | 4 sơ đồ luồng SVG (đăng ký có CAPTCHA + kích hoạt, đăng nhập chống brute force, đăng xuất, quên / đặt lại mật khẩu) vẽ từ code thật, mỗi ô ghi `file:dòng`; `node evidence/diagrams/ve-so-do.mjs` vẽ lại sau khi đổi code. **Bản nháp — chờ nhóm duyệt.** |
