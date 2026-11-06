# Network và Application (Cookies) — Chrome thật

Thu bằng `scripts/collect-evidence.mjs` (Chrome headless, DevTools Protocol). Chỉ ghi request trang (Document) và các header liên quan. Giá trị `sid` thay bằng vân tay (8 ký tự đầu SHA-256) để so trước / sau mà không lộ cookie; `_csrf`, mật khẩu, mã, token, `g-recaptcha-response` đã che.

## 1. Đăng ký: POST /register → 303 → trang nhập mã (email gõ hoa + khoảng trắng được chuẩn hoá)

### POST /register → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay b84aab05>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/register
Form data
  _csrf=<đã che>&username=Minh+Anh&email=Minh.Anh%40Demo.Example&password=<đã che>&passwordConfirm=<đã che>&g-recaptcha-response=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /activate?msg=registered
  Set-Cookie: sid=<đã che · vân tay b84aab05>; Path=/; Expires=Fri, 06 Nov 2026 14:05:45 GMT; HttpOnly; SameSite=Lax
```

### GET /activate?msg=registered → 200

```
Request headers
  Cookie: sid=<đã che · vân tay b84aab05>
  Referer: http://localhost:3000/register
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay b84aab05>; Path=/; Expires=Fri, 06 Nov 2026 14:05:45 GMT; HttpOnly; SameSite=Lax
```

## 2. Nhập mã sai: POST /activate → 200 + INVALID_OTP (lỗi nhập ở form xác thực trả 200 theo đề)

### POST /activate → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay b84aab05>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/activate?msg=registered
Form data
  _csrf=<đã che>&email=minh.anh%40demo.example&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay b84aab05>; Path=/; Expires=Fri, 06 Nov 2026 14:05:48 GMT; HttpOnly; SameSite=Lax
```

## 3. Pending đúng mật khẩu: cookie sau khi gửi (phiên ẩn danh giữ CSRF token, KHÔNG có đăng nhập — xem db/2)

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay b84aab05> | localhost | / | 2026-11-06 14:05:49Z | ✓ |  | Lax |

## 4. Mã đúng: POST /activate → 303 /login?msg=activated (không tự đăng nhập)

### POST /activate → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay b84aab05>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/activate
Form data
  _csrf=<đã che>&email=minh.anh%40demo.example&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?msg=activated
  Set-Cookie: sid=<đã che · vân tay b84aab05>; Path=/; Expires=Fri, 06 Nov 2026 14:05:51 GMT; HttpOnly; SameSite=Lax
```

### GET /login?msg=activated → 200

```
Request headers
  Cookie: sid=<đã che · vân tay b84aab05>
  Referer: http://localhost:3000/activate
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay b84aab05>; Path=/; Expires=Fri, 06 Nov 2026 14:05:51 GMT; HttpOnly; SameSite=Lax
```

## 5. Trước đăng nhập (đã mở /login?next=…): cookie phiên ẩn danh

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay b84aab05> | localhost | / | 2026-11-06 14:05:52Z | ✓ |  | Lax |

## 6. Đăng nhập: POST /login → 303 + Set-Cookie sid MỚI (regenerate); request sau gửi Cookie, trang quản trị Cache-Control: no-store

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay b84aab05>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/login?next=%2Fadmin%2Fdishes
Form data
  _csrf=<đã che>&next=%2Fadmin%2Fdishes&email=minh.anh%40demo.example&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: sid=<đã che · vân tay fe6c9d08>; Path=/; Expires=Fri, 06 Nov 2026 14:05:53 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay fe6c9d08>
  Referer: http://localhost:3000/login?next=%2Fadmin%2Fdishes
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay fe6c9d08>; Path=/; Expires=Fri, 06 Nov 2026 14:05:54 GMT; HttpOnly; SameSite=Lax
```

## 7. Sau đăng nhập: giá trị sid khác hẳn (regenerate) — so vân tay với bảng 5

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay fe6c9d08> | localhost | / | 2026-11-06 14:05:54Z | ✓ |  | Lax |

Vân tay sid trước: b84aab05 · sau: fe6c9d08 → KHÁC NHAU

## 8. Đăng xuất: POST /logout (form có _csrf) → xoá phiên ở DB rồi xoá cookie → 303 /login

### POST /logout → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay fe6c9d08>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/admin/dishes
Form data
  _csrf=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?msg=logged-out
  Set-Cookie: sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
```

### GET /login?msg=logged-out → 200

```
Request headers
  Referer: http://localhost:3000/admin/dishes
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 4f25f934>; Path=/; Expires=Fri, 06 Nov 2026 14:05:58 GMT; HttpOnly; SameSite=Lax
```

## 9. Sau đăng xuất: cookie cũ đã bị xoá; trang /login vừa mở cấp một phiên ẩn danh MỚI (vân tay khác bảng 7) chỉ để giữ CSRF token của form

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay 4f25f934> | localhost | / | 2026-11-06 14:05:58Z | ✓ |  | Lax |

## 10. Mở link đặt lại: GET /reset?token=<đã che> → 200 + Referrer-Policy: no-referrer, KHÔNG ghi usedAt

### GET /reset?token=<đã che> → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 4f25f934>
Response headers
  Content-Type: text/html; charset=utf-8
  Referrer-Policy: no-referrer
  Set-Cookie: sid=<đã che · vân tay 4f25f934>; Path=/; Expires=Fri, 06 Nov 2026 14:06:00 GMT; HttpOnly; SameSite=Lax
```

## 11. Đặt mật khẩu mới: POST /reset → 303 /login?msg=password-reset (không tự đăng nhập)

### POST /reset → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 4f25f934>
  Origin: null
Form data
  _csrf=<đã che>&token=<đã che>&password=<đã che>&passwordConfirm=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?msg=password-reset
  Referrer-Policy: no-referrer
  Set-Cookie: sid=<đã che · vân tay 4f25f934>; Path=/; Expires=Fri, 06 Nov 2026 14:06:01 GMT; HttpOnly; SameSite=Lax
```

### GET /login?msg=password-reset → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 4f25f934>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 4f25f934>; Path=/; Expires=Fri, 06 Nov 2026 14:06:01 GMT; HttpOnly; SameSite=Lax
```

## 12. Lần sai thứ 10 (có CAPTCHA) → 429 + Retry-After

### POST /login → 429

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 4f25f934>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/login
Form data
  _csrf=<đã che>&email=thu.khoa%40demo.example&password=<đã che>&g-recaptcha-response=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Retry-After: 301
  Set-Cookie: sid=<đã che · vân tay 4f25f934>; Path=/; Expires=Fri, 06 Nov 2026 14:07:35 GMT; HttpOnly; SameSite=Lax
```

## 13. Gửi lại mã: POST /activate/resend → 303 → trang nhập mã, đếm ngược 60 giây

### POST /activate/resend → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 495aac20>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/activate
Form data
  _csrf=<đã che>&email=gui.lai.chrome%40demo.example&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /activate?msg=otp-sent
  Set-Cookie: sid=<đã che · vân tay 495aac20>; Path=/; Expires=Fri, 06 Nov 2026 14:08:40 GMT; HttpOnly; SameSite=Lax
```

### GET /activate?msg=otp-sent → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 495aac20>
  Referer: http://localhost:3000/activate
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 495aac20>; Path=/; Expires=Fri, 06 Nov 2026 14:08:40 GMT; HttpOnly; SameSite=Lax
```

## 14. Sai 5 lần rồi gửi mã ĐÚNG → 429 + Retry-After, vẫn pending

### POST /activate → 429

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 495aac20>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/activate
Form data
  _csrf=<đã che>&email=khoa.chrome%40demo.example&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Retry-After: 900
  Set-Cookie: sid=<đã che · vân tay 495aac20>; Path=/; Expires=Fri, 06 Nov 2026 14:08:46 GMT; HttpOnly; SameSite=Lax
```

## 15. Yêu cầu /forgot thứ 4 trong một giờ với cùng email → 429 + Retry-After

### POST /forgot → 429

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 495aac20>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/forgot
Form data
  _csrf=<đã che>&email=quen.chrome%40demo.example
Response headers
  Content-Type: text/html; charset=utf-8
  Retry-After: 3597
  Set-Cookie: sid=<đã che · vân tay 495aac20>; Path=/; Expires=Fri, 06 Nov 2026 14:08:51 GMT; HttpOnly; SameSite=Lax
```

## 16. Trang khác (127.0.0.1:5500) tự gửi POST xoá món tới localhost:3000: Chrome KHÔNG gửi cookie sid (SameSite=Lax) → 303 /login; /login thấy phiên còn nên đưa về quản trị (ảnh 26: món #1 còn)

### GET / → 200

```
Request headers
Response headers
  Content-Type: text/html; charset=utf-8
```

### POST /admin/dishes/1?_method=DELETE → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Origin: http://127.0.0.1:5500
  Referer: http://127.0.0.1:5500/
Form data
  _csrf=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login
```

### GET /login → 303

```
Request headers
  Cookie: sid=<đã che · vân tay f8632d4e>
  Referer: http://127.0.0.1:5500/
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: sid=<đã che · vân tay f8632d4e>; Path=/; Expires=Fri, 06 Nov 2026 14:08:55 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay f8632d4e>
  Referer: http://127.0.0.1:5500/
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay f8632d4e>; Path=/; Expires=Fri, 06 Nov 2026 14:08:56 GMT; HttpOnly; SameSite=Lax
```

