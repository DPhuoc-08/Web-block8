# BUILD_LOG — Block 8

Plan: `../block8-plan.md`. Quy ước làm việc: `../CLAUDE.md`. Đề: `../block8.md`.
Hướng làm (đã chốt 02/11/2026): ứng dụng SSR đúng yêu cầu đề, trên database và backend của block7. Giao diện auth theo bản Figma vòng 2 đã duyệt (trang "Block 8 · Đăng nhập" trong file Figma của block7).

## Bước 0 — Khởi tạo repo
**Đã làm:** tạo `Week6/block8/`, `git init` (nhánh `main`), `.gitignore`, `BUILD_LOG.md`.

**Quyết định và lý do:**
- **Repo mới, không tiếp nối lịch sử block7**: mỗi block một repo (yêu cầu của giảng viên). Lịch sử block7 vẫn ở `Week5/block7/`.
- **`.gitignore` tạo trước mọi `npm install`** (bài học block5): tránh VS Code báo vượt 10000 thay đổi.
- Nội dung chép từ block7, bỏ `dist/` (block8 không có SPA build), thêm:
  - `.mail-outbox/`: thư của transport `file` chứa OTP và link đặt lại mật khẩu thật.
  - `*.cookies`, `tmp/`: cookie jar của script kiểm tra chứa `sid` đăng nhập.
  - `.env.*` (đã có) che luôn `.env.test` chứa key thử reCAPTCHA.

**Đã kiểm tra:** `git status` chỉ thấy `.gitignore` và `BUILD_LOG.md`.

## Bước 1 — Chép nền backend block7
**Đã làm:**
- Lấy `api/` của block7 bằng `git archive HEAD` (commit `789bbba`, cây làm việc block7 sạch) vào thư mục tạm, rồi chép **chỉ phần backend dùng lại** vào `source-code/`:
  - `prisma/` (schema 7 bảng, seed tất định + `seed-data/`, `sql/`), `prisma.config.js`, `certs/supabase-ca.crt`
  - `src/db.js`, `src/search/` (fulltext, fuzzy), `src/validators/` (list-query, dish, chef, ingredient, tag, common, id)
  - `scripts/run-sql.js`, `package.json`, `package-lock.json`
- **Không chép** (plan mục 0, CLAUDE.md): `src/app.js` (app API JSON có CORS), `src/http/` (envelope JSON), `src/routes/` (route JSON), `scripts/check-api.sh` (kiểm tra API JSON), `.env.example` cũ.
- `package.json`: tên `block8`, mô tả mới; gỡ `cors`; thêm `ejs@7.0.1`, `method-override@3.0.0` (đúng bản block5 đã dùng, ghim chính xác như block7).
- `.env.example` mới: `DATABASE_URL` (ghi rõ là DB block7, seed xoá sạch rồi tạo lại), `PORT`, `LOG_SQL`. Biến của phần auth thêm dần ở bước cần tới.
- `.env`: người dùng đồng ý cho chép từ `Week5/block7/api/.env` bằng `cp`, không đọc nội dung; xoá dòng `CORS_ORIGIN` không còn dùng.

**Quyết định và lý do:**
- **`git archive` + chép chọn lọc**: chỉ lấy file đã commit của block7, không thể lỡ chép `node_modules/`, `generated/`, `.env`.
- **Logic truy vấn món của `routes/dishes.js` (handler `GET /` và `textSearch`) chưa chép**: phần lớn logic đã nằm trong `validators/list-query.js` (`parseListQuery`, `escapeLike`, `basicAdvancedWhere`) và `search/`. Phần còn lại sẽ chuyển sang route SSR ở bước 3, đổi đầu ra JSON → `res.render`, giữ nguyên câu truy vấn.
- **`src/db.js` giữ nguyên**: `findPage`, `findFuzzyPage`, `nameTaken`, mã lỗi Prisma dùng lại cho admin SSR. Comment nói "response JSON / SPA" sửa ở bước 2 khi viết app SSR.
- **Phiên bản**: express 5.3.0, Prisma 7.10.0, pg 8.23.1, dotenv 18.0.8 giữ theo lockfile block7.

**Đã kiểm tra:**
- `npm install` → `prisma generate` sinh `generated/prisma` (7.10.0).
- `git check-ignore`: `source-code/.env` bị bỏ qua. `.env` chỉ có `DATABASE_URL`, `PORT`.
- Host của `DATABASE_URL`: `aws-0-ap-southeast-1.pooler.supabase.com` (project block7, Singapore).
- Đọc DB qua `src/db.js`: 1.200 món, 60 đầu bếp, 250 nguyên liệu, 16 tag, 2.106 `dish_tags`, 106 `chef_tags`, 5.357 `dish_ingredients`.
- Chưa có `src/app.js` nên `npm start` chưa chạy: bước 2 viết khung SSR.

## Bước 2 — Khung SSR
**Đã làm:**
- `src/app.js`: EJS (`src/views`), `express.static(public/)`, `express.urlencoded`, `req.body ??= {}`, `method-override` (`_method`), bảng thông báo `?msg=` (10 mã của block5/block7), `/` → `/dishes`, trang `404`, error handler `500`.
- `src/views/partials/header.ejs`, `footer.ejs`: chuyển từ `Layout.jsx` của block7 — brand "Nhà hàng" (+ "/ Quản trị" khi ở `/admin`), nav Thực đơn / Quản trị có `aria-current`, footer "© 2026 Nhà hàng · Món Việt ba miền" chỉ ở trang khách.
- `src/views/404.ejs`, `500.ejs` (như block5, 500 chỉ thông báo chung).
- `public/css/style.css`: chép nguyên `web/src/styles/style.css` của block7; thêm phần "Block8 (SSR)" ở cuối.
- `src/db.js`: sửa comment còn nói "response JSON / SPA / ok:false" cho đúng SSR (404, 400, 409).

**Quyết định và lý do:**
- **Nút đóng thông báo là link GET** về đúng URL hiện tại bỏ `msg` (và `saved`), thay cho button JS của block7: SSR không cần JavaScript cho việc này, `q`/`page` giữ nguyên.
- **`section` (menu/admin) tính trong middleware** từ `req.path`, thay cho `useLocation()` của block7.
- **`import "dotenv/config"` ở đầu `app.js`**: block7 nạp `.env` qua `db.js`, nhưng khung SSR chưa dùng DB nên `PORT` sẽ không được đọc.
- **CSS chép nguyên, chưa xoá phần không dùng** (Tải thêm, Cuộn vô hạn, khung xương, công tắc cách hiển thị): bước 3 dựng thực đơn xong mới biết chính xác selector nào không còn dùng.

**Đã kiểm tra (server chạy thật, curl):**
- `GET /` → `302 /dishes`; `GET /css/style.css` → 200; `/dishes`, `/admin/dishes` → 404 (chưa có route, bước 3–5).
- `/dishes?msg=dish-created&q=pho`: có thông báo "Đã thêm món mới.", link đóng = `/dishes?q=pho`. `?msg=<script>` (mã lạ) → không hiện thông báo.
- `/admin/x`: brand có "/ Quản trị", "Quản trị" có `aria-current`, không có footer.
- Chrome headless 1280px và 375px (375px nhúng iframe vì Chrome headless không thu cửa sổ dưới ~500px, như block7): header, thông báo, trang 404, footer đúng bố cục, không cuộn ngang.

## Bước 3 — Thực đơn `/dishes` và chi tiết `/dishes/:id` bằng SSR
**Đã làm:**
- `src/queries/dishes.js`: chuyển phần truy vấn của `api/src/routes/dishes.js` (block7) — `listDishes` (basic/advanced bằng Prisma, `total` + `items` trong một transaction `RepeatableRead`; fulltext/fuzzy qua `search/`), `getDish`, `listTags` (kèm `dishCount`). Câu truy vấn giữ nguyên, chỉ bỏ phần trả JSON.
- `src/list-query.js`: chuyển `web/src/listQuery.js` (bỏ `view`): đọc nguyên văn các ô để điền lại form, `pageParams`/`menuUrl` dựng URL gọn, `pageWindow`, `safeMenuBack`.
- `src/routes/menu.js`: `GET /dishes` (validate bằng `parseListQuery` của block7, render, `400` khi điều kiện sai), `GET /dishes/:id` (`404` khi id sai/không có).
- `src/format.js`, `src/dish-art.js` (dữ liệu 11 hình minh hoạ, chuyển từ `DishArt.jsx`).
- View: `dishes/index.ejs` (đầu trang đầy đủ/thu gọn, thanh công cụ, lỗi điều kiện, không có kết quả, trang vượt phạm vi, lưới thẻ), `dishes/show.ejs`; partial `search-panel`, `category-bar`, `dish-card`, `dish-image`, `art-icon`, `pagination`. `404.ejs` nhận tiêu đề riêng ("Không tìm thấy món").
- `public/js/ui.js` (chỉ tiện dùng): ảnh lỗi → hình minh hoạ; sắp xếp tự gửi form; thu gọn "N tag khác"; khung tìm đổi gợi ý / khoá "Tìm theo" / hiện nhóm nâng cao theo kiểu tìm.
- CSS: thêm quy tắc có/không có JS; bỏ CSS chỉ dành cho SPA (công tắc cách hiển thị, Tải thêm, Cuộn vô hạn, khung xương, biểu tượng xoay, hiệu ứng món nối thêm): 609 → 561 dòng.

**Quyết định và lý do:**
- **Validate dùng lại nguyên `parseListQuery` của block7** → cùng quy tắc, cùng câu báo lỗi; chỉ bỏ `pageSize` và `searchIn` khỏi URL trang (thực đơn cố định 12 món/trang như block7, `searchIn` là của admin).
- **Chuyển về URL gọn bằng redirect 302**: form GET gửi cả ô trống (`tag=&minPrice=`) và tham số không thuộc chế độ đang chọn. Khi điều kiện hợp lệ, server chuyển về URL chỉ gồm tham số có hiệu lực (giống `toPageParams` của block7) → link copy gọn, `?page=1` về `/dishes`. Có lỗi thì giữ nguyên URL để hiện giá trị sai cạnh ô. Không lặp redirect vì URL đích được dựng bằng chính `URLSearchParams` mà lần sau so sánh.
- **Kiểm tra `?tag=` có thật bằng danh sách tag đã tải** cho thanh danh mục (thay cho `findUnique` riêng của block7): bớt một vòng mạng tới Supabase, cùng kết quả. Danh sách tag và trang món tải song song.
- **Link số trang có `#ket-qua`** thay cho `useListTop` (cuộn + focus bằng JS): trình duyệt tự cuộn tới đầu danh sách và Tab bắt đầu từ đó.
- **Trang chi tiết quay về đúng danh sách đang lọc bằng `?back=`** (block7 dùng `state` của router). `safeMenuBack` chỉ nhận URL bắt đầu bằng `/dishes` → không thành open redirect. Thực đơn mặc định thì không thêm `back`.
- **Tăng dần theo JS** (plan 9.3): không JS thì nhóm nâng cao luôn hiện kèm ghi chú "chỉ áp dụng khi Kiểu tìm là Nâng cao", đủ 16 nút danh mục, nút "Áp dụng" cho sắp xếp, ảnh lỗi hiện chữ alt. Có JS thì giống block7.
- **Phương án đã bỏ:** `<details>` cho "N tag khác" (không đặt được các nút ẩn nối tiếp trong cùng hàng flex, nhất là thanh cuộn ngang ở điện thoại); tự nâng kiểu tìm lên Nâng cao khi có ô nâng cao (đổi hợp đồng: block7 bỏ qua tham số không thuộc chế độ).

**Đã kiểm tra:**
- Mã trạng thái (curl): `/dishes` 200; URL có ô trống → 302 `/dishes`; `?page=1` → 302 `/dishes`; `?page=999` 200 (trang vượt phạm vi); `?page=0`, `?mode=fuzzy` (thiếu từ khoá), `?q=a&q=b`, `?mode=advanced&tag=999`, `?minPrice=abc`, `?mode=xyz` → 400; `/dishes/1` 200; `/dishes/abc`, `/dishes/99999` → 404.
- **So với API block7** (chạy `Week5/block7/api` ở cổng 3001, không sửa gì): script gom id món trên trang SSR và so với `items` của `GET /api/dishes` cùng điều kiện — **19/19 ca giống hệt** id, thứ tự, điểm phù hợp, số trang. Các ca: mặc định, trang 2/100, `q=bún`, sort giá giảm trang 3, sort tên, nâng cao (tag + giá 0–60.000 + còn bán + giá tăng, trang 2), `available=false`, giá 0, theo nguyên liệu "tôm" (trang 1, 5), theo đầu bếp "Mai", `q=100%`, `q=_`, toàn văn "nước dùng xương" / "cá kho tộ", gần đúng "bò lúc lắt", gần đúng theo nguyên liệu "tôm xú", theo đầu bếp "Trần Thị Bít".
- Chrome headless: thực đơn 1280px (khớp ảnh `block7/evidence/screens/so-trang-1.png`, trừ công tắc cách hiển thị đã bỏ), 820px (2 cột, kết quả "bò" giá giảm, nhãn Tạm hết), 375px (dòng món ảnh 96px, thanh danh mục cuộn ngang, phân trang "Trang 1/100"), điều kiện sai 1280px (lỗi cạnh ô + khung "Điều kiện tìm không hợp lệ"), lọc tag "Miền Bắc" 820px (phần tag ẩn tự mở vì tag đang chọn nằm trong đó), chi tiết món không ảnh 375px (hình minh hoạ, "← Thực đơn" về `/dishes?q=miến`).
- Tắt JavaScript (HTML bỏ thẻ `<script>`): nhóm nâng cao hiện kèm ghi chú, nút "Bộ lọc nâng cao" ẩn, form vẫn gửi bình thường.
- Lần mở đầu sau khi server khởi động ~5,4s (mở kết nối tới Supabase Singapore), các lần sau ~0,35s.
