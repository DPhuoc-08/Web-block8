# Bằng chứng nộp — Block 8 (xác thực SSR trên database block7)

Thu lại ngày 06/11/2026 (sau plan 12.4) bằng `node scripts/collect-evidence.mjs` (trong `source-code/`): script tự chạy server thật ở `http://localhost:3000`, điều khiển **Chrome thật** (headless, DevTools Protocol) qua từng kịch bản, rồi gửi thêm request trực tiếp như `curl -i`. Thư đi vào hộp thư thử nghiệm (`MAIL_TRANSPORT=file`). Tài khoản thử dùng tên miền `demo.example` và bị xoá ở cuối cùng bộ đếm giới hạn → DB trở lại trạng thái sau seed. Chạy lại script là thu lại toàn bộ thư mục, trừ `curl/9`, `curl/10` (output của `check-auth`, `check-ssr`), `curl/16` và `devtools/` (làm tay).

**Đã che:** email thật của nhóm trong `.env` (tài khoản seed, người gửi thư) → `<email nhóm đã che>`; mật khẩu, mã kích hoạt, reset token, `_csrf`, `g-recaptcha-response` → `<đã che>`; `sid` → `<đã che · vân tay xxxxxxxx>` (8 ký tự đầu SHA-256 của sid — cùng vân tay với bản ghi `sessions` trong `db/` và `prisma/sql/auth-state.sql`, so được trước / sau mà không dùng lại được); hash trong DB chỉ để 6 ký tự đầu, Argon2id chỉ để phần tham số. Script **từ chối ghi** nếu sau khi che còn sót một giá trị bí mật nó biết. Thư mục này không chứa `.env`, chuỗi kết nối, host database, `SESSION_SECRET`, `OTP_PEPPER`, App Password hay secret reCAPTCHA (đã quét lại sau khi ghi).

**Các ảnh luồng dùng key thử của Google** (dòng chữ đỏ "for testing purposes only"). Bấm ô "Tôi không phải người máy" từ Chrome do script điều khiển thì widget quay mãi — Google nhận ra trình duyệt tự động; mình không tìm cách lách. Vì secret thử chấp nhận mọi token, script điền một token thử vào ô `g-recaptcha-response`, nên ảnh thấy ô chưa tick. Đây **không** phải bằng chứng chặn bot. Với **key thật**: thiếu token, token bịa, tự khai đã có ở `curl/15` (backend gọi Google thật); tick thật, dùng lại, quá hạn **chưa làm** — cần người tick, chạy `node scripts/captcha-key-that.mjs`, kết quả vào `curl/16`.

**Chưa có (cần người làm):** `curl/16` và ảnh DevTools thật trong `devtools/`. Hiện Network và Application có bản chữ đọc từ Chrome qua DevTools Protocol (`network/network-log.md`).

## Đối chiếu bảng nghiệm thu của đề

| Kịch bản của đề | Kết quả cần chứng minh | Ảnh `screens/` | Network / request / DB |
| :--- | :--- | :--- | :--- |
| Đăng ký, tài khoản pending đăng nhập | Không có session, báo cần kích hoạt | `06-dang-nhap-chua-kich-hoat-375` | `db/2` (user `pending`, 0 phiên), `network` mục 3 |
| Đăng ký với `role=admin` trong body | Server gán `viewer` | — | `curl/4` (DB `role=viewer`) |
| Email mới / đang pending / đã active | Cùng status, cùng trang; pending không ghi đè mật khẩu; active không gửi thư | — | `curl/4` (cùng `303 /activate?msg=registered`; vân tay hash không đổi; 0 thư) |
| Mã kích hoạt hợp lệ | `active` + `emailVerifiedAt` + `usedAt`, không tự đăng nhập | `07-kich-hoat-xong-375` | `network` mục 4 (`303 /login?msg=activated`), `db/3` |
| Mã sai, hết hạn, đã dùng | Cùng thông báo, cùng trang, trạng thái không đổi | `05-ma-sai-375`, `21-ma-het-han-375`, `22-ma-da-dung-375` | `curl/11`, `network` mục 2, `db/2` |
| Gửi lại mã | Mã cũ bị từ chối, mã mới dùng được, `attempts` không về 0 | `23-gui-lai-ma-375` | `curl/11`, `network` mục 13, `db/8` (`attempts=3` sau khi gửi lại) |
| Vượt giới hạn thử hoặc gửi | `429` ở server, kể cả mã đúng | `24-kich-hoat-tam-khoa-429-375` | `curl/11`, `network` mục 14, `db/8` (`lockedUntil`; `attempts` về 0 lúc đặt khoá theo plan mục 4) |
| Hai request xác nhận đồng thời | Một `303`, một `INVALID_OTP` | — | `curl/11` |
| Kích hoạt xong; OTP làm mật khẩu | Không có phiên; bị từ chối | — | `curl/11` |
| Mã chỉ lưu dạng băm | Không có mã trong DB, log, trang | `04-nhap-ma-sau-dang-ky-*` | `db/1` (`otpHash` HMAC 64 ký tự), `mail/1`, `curl/8` (log không có mã) |
| Thiếu CAPTCHA, token bịa, tự khai "đã qua" (**key thật**) | Từ chối, không tạo user, không gửi thư | `02-dang-ky-chua-tick-captcha-375` | `curl/15` (Google xác minh thật), `curl/5` |
| Hostname ngoài danh sách | `success=true` vẫn bị từ chối | — | `curl/15` |
| Tick thật, dùng lại, quá hạn (**key thật**) | Đi tiếp; hai ca sau bị từ chối | **Chưa có** | `curl/16` **chưa có** (cần người tick) |
| Lỗi nhập ở form đăng ký | 200 + chỉ rõ ô sai | `02-dang-ky-loi-nhap-375` | — |
| Sai mật khẩu / email không có | Cùng một thông báo, giữ email, bỏ mật khẩu | `15-dang-nhap-sai-375` | `curl/9` phần D |
| Sai đến ngưỡng, bỏ CAPTCHA | Chặn trước bước so mật khẩu, bộ đếm không đổi | `16-dang-nhap-can-captcha-375` | `curl/12`, `db/9` |
| CAPTCHA đúng, mật khẩu sai; xoá cookie | Bộ đếm vẫn tăng; xoá cookie không né được | — | `curl/12` |
| Email không tồn tại | Cùng trang, cùng ngưỡng CAPTCHA | — | `curl/12`, `db/9` |
| Sai 10 lần | Khoá 5 phút, `429` + `Retry-After`, kể cả khi mật khẩu đúng | `17-tam-khoa-429-375` | `network` mục 12, `curl/7` (mật khẩu ĐÚNG vẫn 429), `db/7` (`count=10`, `lockedUntil`) |
| Đăng nhập đúng | `303`, `Set-Cookie` sid **mới**, cookie HttpOnly / SameSite=Lax / Path=/ | `09-quan-tri-da-dang-nhap-1280`, `-375` | `network` mục 5–7 (vân tay sid trước ≠ sau), `db/4` (bản ghi `sessions` gắn `userId`) |
| Chưa đăng nhập gọi CRUD (cả curl không cookie, cookie bịa) | `303 /login`, dữ liệu không đổi | `08-chua-dang-nhap-vao-quan-tri-1280` | `curl/1` (9 request GET/POST/PATCH/DELETE đều 303; 1.200 món, món #1 không đổi) |
| Khởi động lại server | Cookie cũ vẫn đăng nhập (session ở DB) | — | `curl/3` (200 trước và sau khi dừng / chạy lại tiến trình) |
| Đăng xuất | Huỷ phiên ở DB, xoá cookie, `303 /login`; sid cũ bị từ chối; không có `GET /logout` | `10-da-dang-xuat-375` | `network` mục 8–9, `curl/2` (sid cũ → 303, 0 bản ghi; `GET /logout` → 404) |
| Form gửi từ trang khác (CSRF) | Từ chối | `26-form-tu-trang-khac-375` (món #1 còn; `/login` đưa về quản trị vì phiên vẫn còn) | `network` mục 16 và `curl/17` (Chrome thật: POST từ `127.0.0.1:5500` không kèm cookie), `curl/2` (có cookie: thiếu `_csrf` → 403; `Origin` trang lạ → 403) |
| Back sau khi đăng xuất | Không xem được trang quản trị | `27-back-sau-dang-xuat-375` | `curl/17` |
| Xoá cookie có huỷ phiên không | Không: bản ghi còn, cookie đã lưu vẫn dùng được | — | `curl/14` |
| Quên mật khẩu: email có / không có | Cùng status, cùng trang, thời gian gần nhau | `11-quen-mat-khau-da-gui-375` | `curl/6`, `mail/2` (link từ `APP_ORIGIN`) |
| Mở link đặt lại | Chỉ hiện form, không tiêu thụ token, `Referrer-Policy: no-referrer` | `12-dat-lai-mat-khau-375` | `network` mục 10, `db/5` (`usedAt` rỗng, chỉ lưu SHA-256, hạn 15 phút) |
| Đặt mật khẩu mới | Token dùng xong, mật khẩu đổi, mọi phiên cũ bị xoá, không tự đăng nhập | `13-dat-lai-xong-375` | `network` mục 11, `db/6` (vân tay hash đổi, `usedAt` có giá trị, 0 phiên), `mail/3` |
| Vượt giới hạn `/forgot` | `429`, email có và không có giống nhau | `25-quen-mat-khau-429-375` | `curl/13`, `network` mục 15 |
| Token cũ, hết hạn, đã dùng | Cùng trang, mật khẩu không đổi | `14-link-da-dung-375` | `curl/13` (so `passwordHash`) |
| Reset thành công: `sid` cũ | Bị từ chối, 0 bản ghi phiên | — | `curl/13`, `db/6` |
| Reset token ở route khác | `/activate`, `/login`, cookie `sid` đều từ chối; token chưa bị tiêu thụ | — | `curl/13` |
| Reset tài khoản pending | Vẫn pending, không đăng nhập được | — | `curl/13`, `db/10` |
| Toàn bộ bảng nghiệm thu + hồi quy thực đơn / quản trị | ĐẠT hết | — | `curl/9-check-auth.txt` **135/135**, `curl/10-check-ssr.txt` **124/124** |
| Mở rộng: tìm tiếng Việt không dấu (plan 12.3, không thuộc đề) | Từ khoá không dấu ra món có dấu ở mọi kiểu tìm; từ khoá có dấu giữ nguyên như block7 | `18-tim-khong-dau-pho-1280`, `19-gan-dung-khong-dau-375`, `20-toan-van-khong-dau-1280` | `curl/10` phần D (32 ca) |

Hai file `curl/9`, `curl/10` chạy lại ngày 06/11/2026 trên code hiện tại.

Giao diện ở 3 cỡ màn hình: `01-dang-ky-1280`, `-820`, `-375`; `04-nhap-ma-sau-dang-ky-1280`, `-375`; `09-quan-tri-da-dang-nhap-1280`, `-375`.

## Hai lỗi chỉ lộ ra khi thu bằng chứng bằng trình duyệt thật

Cả hai đã có trong BUILD_LOG bước 18 (tái hiện, nguyên nhân, cách sửa, bằng chứng sau khi sửa):

1. **Chrome không đặt lại được mật khẩu (403).** Trang đặt lại có `Referrer-Policy: no-referrer`; theo chuẩn Fetch, form gửi từ trang như vậy mang `Origin: null`, bị lớp kiểm tra Origin chặn. Sau khi sửa: `network` mục 11 — `Origin: null` → `303`.
2. **`curl` không cookie gọi CRUD nhận 403 thay vì `303 /login`.** CSRF chạy trước `requireLogin`. Sau khi sửa: `curl/1` — mọi request đều 303.

## Cấu trúc

| Thư mục | Nội dung |
| :--- | :--- |
| `screens/` | 32 ảnh Chrome theo thứ tự luồng (đăng ký → kích hoạt → đăng nhập → quản trị → đăng xuất → quên / đặt lại → dò mật khẩu → tìm không dấu → các ca lỗi 21–27) |
| `network/network-log.md` | Request trang của Chrome (header Origin, Cookie, Set-Cookie, Location, Referrer-Policy, Retry-After; form data đã che) và bảng cookie như tab Application |
| `curl/` | Request gửi trực tiếp (không qua giao diện) kèm status, header, kết quả DB; log server; output hai script kiểm tra |
| `devtools/` | **Chưa có:** ảnh DevTools thật và kết quả CAPTCHA quá hạn, do `captcha-key-that.mjs` dẫn từng bước |
| `db/` | Bản ghi `users`, `activation_challenges`, `password_resets`, `sessions`, `rate_limits` ở từng thời điểm |
| `mail/` | Ba thư của luồng (kích hoạt, đặt lại, báo đã đổi mật khẩu) |
| `diagrams/` | 4 sơ đồ luồng SVG (đăng ký có CAPTCHA + kích hoạt, đăng nhập chống brute force, đăng xuất, quên / đặt lại mật khẩu) vẽ từ code thật, mỗi ô ghi `file:dòng`; `node evidence/diagrams/ve-so-do.mjs` vẽ lại sau khi đổi code. Nhóm đã duyệt 06/11/2026. |
