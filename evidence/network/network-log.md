# Network và Application (Cookies) — Chrome thật

Thu bằng `scripts/collect-evidence.mjs` (Chrome headless, DevTools Protocol). Chỉ ghi request trang (Document) và các header liên quan. Giá trị `sid` thay bằng vân tay (8 ký tự đầu SHA-256) để so trước / sau mà không lộ cookie; `_csrf`, mật khẩu, mã, token, `g-recaptcha-response` đã che.

## 1. Đăng ký: POST /register → 303 → trang nhập mã (email gõ hoa + khoảng trắng được chuẩn hoá)

### POST /register → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay a5f960b7>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/register
Form data
  _csrf=<đã che>&email=Minh.Anh%40Demo.Example&password=<đã che>&passwordConfirm=<đã che>&g-recaptcha-response=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /activate?msg=registered
  Set-Cookie: sid=<đã che · vân tay a5f960b7>; Path=/; Expires=Tue, 03 Nov 2026 06:13:16 GMT; HttpOnly; SameSite=Lax
```

### GET /activate?msg=registered → 200

```
Request headers
  Cookie: sid=<đã che · vân tay a5f960b7>
  Referer: http://localhost:3000/register
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay a5f960b7>; Path=/; Expires=Tue, 03 Nov 2026 06:13:16 GMT; HttpOnly; SameSite=Lax
```

## 2. Nhập mã sai: POST /activate → 200 + INVALID_OTP (lỗi nhập ở form xác thực trả 200 theo đề)

### POST /activate → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay a5f960b7>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/activate?msg=registered
Form data
  _csrf=<đã che>&email=minh.anh%40demo.example&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay a5f960b7>; Path=/; Expires=Tue, 03 Nov 2026 06:13:22 GMT; HttpOnly; SameSite=Lax
```

## 3. Pending đúng mật khẩu: cookie sau khi gửi (phiên ẩn danh giữ CSRF token, KHÔNG có đăng nhập — xem db/2)

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay a5f960b7> | localhost | / | 2026-11-03 06:13:24Z | ✓ |  | Lax |

## 4. Mã đúng: POST /activate → 303 /login?msg=activated (không tự đăng nhập)

### POST /activate → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay a5f960b7>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/activate
Form data
  _csrf=<đã che>&email=minh.anh%40demo.example&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?msg=activated
  Set-Cookie: sid=<đã che · vân tay a5f960b7>; Path=/; Expires=Tue, 03 Nov 2026 06:13:25 GMT; HttpOnly; SameSite=Lax
```

### GET /login?msg=activated → 200

```
Request headers
  Cookie: sid=<đã che · vân tay a5f960b7>
  Referer: http://localhost:3000/activate
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay a5f960b7>; Path=/; Expires=Tue, 03 Nov 2026 06:13:28 GMT; HttpOnly; SameSite=Lax
```

## 5. Trước đăng nhập (đã mở /login?next=…): cookie phiên ẩn danh

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay a5f960b7> | localhost | / | 2026-11-03 06:13:29Z | ✓ |  | Lax |

## 6. Đăng nhập: POST /login → 303 + Set-Cookie sid MỚI (regenerate); request sau gửi Cookie, trang quản trị Cache-Control: no-store

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay a5f960b7>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/login?next=%2Fadmin%2Fdishes
Form data
  _csrf=<đã che>&next=%2Fadmin%2Fdishes&email=minh.anh%40demo.example&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: sid=<đã che · vân tay 9e5770ff>; Path=/; Expires=Tue, 03 Nov 2026 06:13:30 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 9e5770ff>
  Referer: http://localhost:3000/login?next=%2Fadmin%2Fdishes
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 9e5770ff>; Path=/; Expires=Tue, 03 Nov 2026 06:13:30 GMT; HttpOnly; SameSite=Lax
```

## 7. Sau đăng nhập: giá trị sid khác hẳn (regenerate) — so vân tay với bảng 5

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay 9e5770ff> | localhost | / | 2026-11-03 06:13:30Z | ✓ |  | Lax |

Vân tay sid trước: a5f960b7 · sau: 9e5770ff → KHÁC NHAU

## 8. Đăng xuất: POST /logout (form có _csrf) → xoá phiên ở DB rồi xoá cookie → 303 /login

### POST /logout → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 9e5770ff>
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
  Set-Cookie: sid=<đã che · vân tay 25edb249>; Path=/; Expires=Tue, 03 Nov 2026 06:13:33 GMT; HttpOnly; SameSite=Lax
```

## 9. Sau đăng xuất: cookie cũ đã bị xoá; trang /login vừa mở cấp một phiên ẩn danh MỚI (vân tay khác bảng 7) chỉ để giữ CSRF token của form

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay 25edb249> | localhost | / | 2026-11-03 06:13:33Z | ✓ |  | Lax |

## 10. Mở link đặt lại: GET /reset?token=<đã che> → 200 + Referrer-Policy: no-referrer, KHÔNG ghi usedAt

### GET /reset?token=<đã che> → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 25edb249>
Response headers
  Content-Type: text/html; charset=utf-8
  Referrer-Policy: no-referrer
  Set-Cookie: sid=<đã che · vân tay 25edb249>; Path=/; Expires=Tue, 03 Nov 2026 06:13:35 GMT; HttpOnly; SameSite=Lax
```

## 11. Đặt mật khẩu mới: POST /reset → 303 /login?msg=password-reset (không tự đăng nhập)

### POST /reset → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 25edb249>
  Origin: null
Form data
  _csrf=<đã che>&token=<đã che>&password=<đã che>&passwordConfirm=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?msg=password-reset
  Referrer-Policy: no-referrer
  Set-Cookie: sid=<đã che · vân tay 25edb249>; Path=/; Expires=Tue, 03 Nov 2026 06:13:36 GMT; HttpOnly; SameSite=Lax
```

### GET /login?msg=password-reset → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 25edb249>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 25edb249>; Path=/; Expires=Tue, 03 Nov 2026 06:13:36 GMT; HttpOnly; SameSite=Lax
```

## 12. Lần sai thứ 10 (có CAPTCHA) → 429 + Retry-After

### POST /login → 429

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 25edb249>
  Origin: http://localhost:3000
  Referer: http://localhost:3000/login
Form data
  _csrf=<đã che>&email=thu.khoa%40demo.example&password=<đã che>&g-recaptcha-response=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Retry-After: 301
  Set-Cookie: sid=<đã che · vân tay 25edb249>; Path=/; Expires=Tue, 03 Nov 2026 06:14:28 GMT; HttpOnly; SameSite=Lax
```

