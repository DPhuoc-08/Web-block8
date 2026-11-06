# Block 8 — Ứng dụng nhà hàng: đăng ký, đăng nhập, phiên, chống brute force

Ứng dụng **SSR** (Express 5 + EJS): thực đơn công khai và khu quản trị CRUD (món, đầu bếp, nguyên liệu) của block7, viết lại bằng form HTML; thêm đăng ký có reCAPTCHA, kích hoạt bằng mã 6 số qua email, đăng nhập bằng session + cookie `sid`, chống dò mật khẩu, đăng xuất, quên / đặt lại mật khẩu. Chỉ `/admin/*` cần đăng nhập.

Database là **project Supabase của block7**: 7 bảng cũ giữ nguyên, thêm 5 bảng `users`, `activation_challenges`, `password_resets`, `sessions`, `rate_limits`. Vì sao làm hybrid (SSR theo đề trên database block7) và chỗ lệch chữ của đề: `hotrotrinhbay.html` mục 2.

| Tài liệu | Nội dung |
| :--- | :--- |
| `hotrotrinhbay.html` | Mục tiêu, chính sách công bố, lựa chọn reCAPTCHA / session store / CSRF và giới hạn, 6 câu hỏi trình bày kèm bằng chứng, công nghệ |
| `kichban.html` | 5 bảng mới, luồng form ↔ request ↔ DB, kịch bản demo theo bảng nghiệm thu, lỗi đã phát hiện |
| `evidence/README.md` | Bằng chứng (ảnh, Network, request trực tiếp, bản ghi DB, thư — đã che) và sơ đồ luồng |
| `BUILD_LOG.md` | Từng bước đã làm, quyết định, lý do, lỗi phát hiện, mục "Kiểm tra mã nguồn", checklist thao tác tay |

## Chạy ứng dụng

Cần Node ≥ 22.22 (máy phát triển: Node 25) và Chrome (chỉ để thu bằng chứng). Project Supabase không dùng 7 ngày sẽ bị tạm dừng: mở lại trên dashboard trước.

```bash
cd source-code
cp .env.example .env      # điền theo bảng dưới
npm install               # tự chạy `prisma generate`
npx prisma db seed        # in host của DATABASE_URL rồi XOÁ và nạp lại toàn bộ 12 bảng
npm start                 # http://localhost:3000  (npm run dev: tự khởi động lại khi sửa code)
```

| Biến (`source-code/.env`) | Điền gì |
| :--- | :--- |
| `DATABASE_URL` | Chuỗi kết nối project Supabase **block7** (Connect → Session pooler, cổng 5432) |
| `APP_ORIGIN` | `http://localhost:3000` — link trong email dựng từ đây, không từ header `Host` |
| `SESSION_SECRET`, `OTP_PEPPER` | Chuỗi ngẫu nhiên dài, khác nhau: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Thiếu thì server không khởi động |
| `SEED_VIEWER_EMAIL`, `SEED_ADMIN_EMAIL`, `SEED_USER_PASSWORD` | Hai tài khoản `active` của seed (nên dùng Gmail của nhóm dạng `ten+viewer@gmail.com`) |
| `MAIL_TRANSPORT` | `smtp` khi demo (Gmail); `file` ghi thư ra `source-code/.mail-outbox/` |
| `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Gmail gửi thư + **App Password** (tài khoản bật xác minh 2 bước) |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | Key **reCAPTCHA v2 (ô tick)** tạo tại Google reCAPTCHA admin, domain `localhost`. Để trống thì không đăng ký được |
| `RECAPTCHA_HOSTNAMES` | `localhost` |
| `LOG_SQL=1` *(tuỳ chọn)* | In câu SQL thật; câu chạm bảng xác thực không in tham số |

`NODE_ENV=production` bật cookie `Secure` (cần HTTPS). Không commit `.env`, `.env.test`, `.mail-outbox/`.

**Thêm 5 bảng vào database block7 lần đầu** (đã làm ở bước 7, chỉ cần khi dựng lại), trong `source-code/`: in SQL trước bằng `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (phải chỉ có `CREATE`, không `DROP`), rồi `npx prisma db push`. **Không** chạy `prisma db push` từ thư mục block7 (schema block7 không có 5 bảng này nên sẽ đòi xoá).

**Bật extension tìm kiếm** (đã làm, chỉ cần khi dựng lại): `node scripts/run-sql.js prisma/sql/setup-search.sql` bật `pg_trgm` và `unaccent`. Thiếu `unaccent` thì mọi từ khoá không dấu sẽ lỗi `500`, kể cả tìm cơ bản như `?q=pho`.

**Tìm không dấu:** gõ không dấu (`pho`, `bun bo hue`) thì so với dữ liệu đã bỏ dấu ở mọi kiểu tìm; gõ có dấu (`phở`) thì kết quả giữ nguyên như block7. Lý do và giới hạn: plan mục 12.3, `BUILD_LOG.md`.

## Kiểm tra

```bash
cd source-code
node scripts/check-auth.mjs        # 135 kiểm tra — tự chạy server riêng ở :3100, thư ghi ra file
node scripts/check-auth.mjs C D    # chỉ phần C, D
npm start &                        # check-ssr cần server ở :3000
node scripts/check-ssr.mjs         # 124 kiểm tra — thực đơn, tìm kiếm (cả không dấu), CRUD, tag, lọc món so với SQL viết tay
node scripts/run-sql.js prisma/sql/auth-state.sql   # trạng thái 5 bảng xác thực (đã che hash, sid)
```

| Phần `check-auth` | Số ca | Nội dung |
| :--- | :--- | :--- |
| A | 25 | Đăng ký, mã kích hoạt (6 điều kiện, khoá, gửi lại không đặt lại số lần thử, hai request đồng thời) |
| B | 6 | CAPTCHA ở đăng ký (thiếu, tự khai “đã qua”, secret không lộ ra trang, secret sai, hostname sai), giới hạn theo IP |
| C | 12 | Brute force: CAPTCHA từ lần sai 3, khoá ở lần 10, bộ đếm không theo cookie |
| D | 30 | Phiên, cookie, đổi sid, khởi động lại server, đăng xuất (cả khi đã hết phiên), CRUD khi chưa đăng nhập, CSRF |
| E | 20 | Quên / đặt lại mật khẩu, xoá phiên cũ, token dùng một lần |
| F | 4 | Hồi quy nhanh thực đơn và CRUD sau khi đăng nhập |
| G | 38 | Tên hiển thị, hồ sơ, đổi mật khẩu (khoá sau 5 lần sai, xoá phiên khác, hai request đồng thời) |

`check-auth` cần file `source-code/.env.test` (không commit) chứa **cặp key thử công khai của Google reCAPTCHA** — lấy trong FAQ của reCAPTCHA (“I'd like to run automated tests…”):
```
RECAPTCHA_SITE_KEY=<site key thử>
RECAPTCHA_SECRET_KEY=<secret key thử>
RECAPTCHA_HOSTNAMES=localhost,testkey.google.com
```
Key thử cho mọi token qua → chỉ dùng cho script, không dùng khi demo, không làm bằng chứng chặn bot. Script tự xoá tài khoản thử, nhưng **seed lại sau khi test** để bảng phiên / bộ đếm sạch.

**Thu lại bằng chứng:** tắt `npm start`, rồi `node scripts/collect-evidence.mjs` (Chrome thật + request trực tiếp, ghi vào `evidence/`, từ chối ghi nếu còn sót bí mật). **Vẽ lại sơ đồ** sau khi sửa code: `node evidence/diagrams/ve-so-do.mjs` (từ thư mục `block8/`).

## Route

| Route | Đăng nhập? | Ghi chú |
| :--- | :--- | :--- |
| `GET /dishes`, `GET /dishes/:id` | Không | Thực đơn như block7: 4 chế độ tìm, “Tìm theo”, tag, giá, trạng thái, sắp xếp, số trang. Khách xem không tạo phiên |
| `GET/POST /register` | Không | reCAPTCHA mọi lần |
| `GET/POST /activate`, `POST /activate/resend` | Không | Mã 6 số; gửi lại chờ 60 giây |
| `GET/POST /login` | Không | CAPTCHA từ lần sai thứ 3 |
| `POST /logout` | — | Không có `GET /logout` |
| `GET/POST /forgot`, `GET/POST /reset` | Không | `GET /reset` chỉ hiện form |
| `/admin/dishes`, `/admin/chefs`, `/admin/ingredients`, `/admin/tags` (+ `/new`, `/:id/edit`, `/:id/delete`, `POST`, `?_method=PATCH|DELETE`) | **Có** | Chưa đăng nhập → `303 /login`. Tag đang dùng không xoá được (`409`) |
| `GET /admin/dishes?available=&chef=`, `PATCH /admin/dishes/:id/availability` | **Có** | Lọc theo tình trạng, đầu bếp ở cả ba kiểu tìm; đổi nhanh Đang phục vụ / Tạm hết trên danh sách |
| `GET`, `PATCH /admin/profile`; `GET`, `POST /admin/profile/password` | **Có** | Hồ sơ của chính mình, sửa tên hiển thị, đổi mật khẩu. Không nhận id từ URL hay body |

## Cấu trúc

```
block8/
├── BUILD_LOG.md, README.md, hotrotrinhbay.html, kichban.html
├── evidence/                 ← bằng chứng đã che + diagrams/ (sơ đồ SVG + script vẽ)
└── source-code/
    ├── prisma/               ← schema (7 bảng block7 + 5 bảng auth), seed, sql/
    ├── public/               ← css/style.css (của block7 + phần auth), js/ui.js (chỉ để tiện dùng)
    ├── scripts/              ← check-auth, check-ssr, collect-evidence, run-sql, lib/
    └── src/
        ├── app.js            ← thứ tự middleware
        ├── auth/             ← session store, loadUser, requireLogin, csrf, mật khẩu, mã / token, bộ đếm, reCAPTCHA, thư
        ├── routes/           ← menu.js, auth/ (login, register, password-reset), admin/
        ├── search/, validators/, queries/   ← chép từ block7
        └── views/            ← EJS
```

Khi nộp: xoá `source-code/node_modules/`, `source-code/generated/`, `source-code/.mail-outbox/`; giữ `package-lock.json`.
