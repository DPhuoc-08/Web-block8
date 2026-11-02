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

## Bước 4 — Quản trị món bằng SSR
**Đã làm:**
- `src/routes/admin/dishes.js`: danh sách `/admin/dishes?q=&mode=&page=` (Cơ bản tìm tên + tag, Toàn văn, Gần đúng; 20 món/trang, `id` tăng dần; toàn văn / gần đúng xếp điểm + cột Điểm), form thêm (`GET /new`, `POST /`), sửa (`GET /:id/edit`, `PATCH /:id`), xác nhận xoá (`GET /:id/delete`, `DELETE /:id`). Ghi xong `303` (PRG).
- `src/forms.js`: đổi giá trị form HTML (chuỗi) sang body có kiểu mà validator block7 cần; `splitNames`; `safeBack` / `withFlash` / `withBack` (quay về đúng trang danh sách).
- View: `admin/dishes/index.ejs`, `form.ejs`, `delete.ejs`; partial `admin-nav`, `admin-search`.
- `public/js/ui.js`: ô gõ có gợi ý + chip (ComboPicker của block7) cho nguyên liệu và đầu bếp; chặn bấm gửi hai lần (`data-once`); hỏi lại khi rời form chưa lưu (`beforeunload`); focus ô lỗi đầu tiên; cuộn tới dòng vừa lưu.
- CSS: `[hidden]` luôn thắng; `.choice-scroll` (danh sách tick có thanh cuộn khi không có JS).

**Quyết định và lý do:**
- **Dữ liệu thật luôn là ô HTML thường**: checkbox `tagIds` / `ingredientIds`, ô chọn `chefId` (có mục `new`), ô chữ `newTags` / `newIngredients` / `newChef`. Có JS thì `ui.js` dựng ô gợi ý + chip y như block7 nhưng chỉ tick / điền vào chính các ô đó → server nhận cùng một dạng dữ liệu; tắt JS vẫn thêm / sửa được (danh sách tick có thanh cuộn, ô chọn đầu bếp có nhóm "Đúng chuyên môn").
- **Thêm nhanh khi lưu (plan 12.2.a)**: tên mới gõ cách nhau bằng dấu phẩy, bỏ trùng không phân biệt hoa thường; trùng tên đã có → `400` cạnh ô ("Đã có tag: …"), không tạo bản ghi thứ hai. Tag, nguyên liệu, đầu bếp mới và món ghi trong **một transaction** → lỗi giữa chừng không để lại bản ghi tạo dở. Đầu bếp mới nhận chuyên môn = các tag của món (như block7).
- **Validate dùng lại nguyên `validateDish` / `checkDishRefs` của block7**: cùng câu lỗi. Chỉ bỏ lỗi "chọn ít nhất một …" khi người dùng đã gõ tên mới cho mục đó.
- **Danh sách dùng lại `parseListQuery`** (page, q bắt buộc ở toàn văn / gần đúng, escape `%` `_` `\`); `mode` chỉ nhận 3 kiểu của admin (block7 API nhận cả `advanced` nếu sửa tay URL — ở đây báo lỗi, rõ ràng hơn). URL gọn bằng redirect như thực đơn.
- **Quay về đúng trang**: link Sửa / Xoá mang `?back=` (URL danh sách đang xem); form gửi lại `back` trong ô ẩn; `safeBack` chỉ nhận URL bắt đầu bằng `/admin/dishes`. Thêm mới → trang 1 + thông báo (block7 plan 12); `?saved=<id>` tô dòng vừa lưu (thay `?id=` của block7 cho rõ nghĩa).
- **Phương án đã bỏ:** gọi `fetch` để thêm tag / nguyên liệu ngay khi gõ (trái quy tắc SSR "không fetch/AJAX"); bỏ hẳn thêm nhanh (người dùng chốt giữ, 12.2.a).

**Đã kiểm tra:**
- Đọc (curl): `/admin` → 302 `/admin/dishes`; danh sách trang 1/2/60/61 → 200; `?q=&mode=basic` → 302 gọn; `mode=fuzzy` thiếu từ khoá, `mode=advanced`, `page=0` → 400; form mới, sửa `/1`, xác nhận xoá `/1` → 200; `/abc/edit`, `/99999/edit`, `/99999/delete` → 404.
- **So với API block7** (chạy `block7/api` cổng 3001, tham số như trang admin block7 gửi): **8/8 ca trùng** id, điểm, `total` — mặc định, trang 2, trang 60, "lẩu" (tên + tag), "Miền Nam" trang 3, toàn văn "nước dùng xương", gần đúng "Bò lúc lắt", `q=%`.
- **Ghi qua form thật + đọc lại DB: 16/16 ĐẠT** — form trống / giá 1.5 / link `javascript:` / id bịa → 400, giữ giá trị, không ghi; thêm → 303 `/admin/dishes?msg=dish-created&saved=<id>`, mô tả rỗng lưu `null`, `role=admin` trong body bị bỏ qua; thêm nhanh 2 tag mới (bỏ trùng hoa thường) + nguyên liệu mới + đầu bếp mới (chuyên môn = 2 tag); tên mới trùng → 400, không tạo tag; "Đầu bếp mới" thiếu tên → 400; sửa → 303 về `?page=3`, giá 0, bỏ tick "Đang phục vụ" → `false`; `back=https://evil.example/` → về `/admin/dishes`; sửa / xoá id không có → 404; GET trang xác nhận không xoá; xoá → 303 về `?page=2`; xoá lần hai → 404.
- Dọn dữ liệu thử: DB còn đúng 1.200 món / 60 đầu bếp / 250 nguyên liệu / 16 tag, không còn bản ghi "[TEST B8]". (Sequence id đã nhảy qua 1201–1202; seed ở bước 8 `RESTART IDENTITY` đặt lại.)
- **Thao tác ô gợi ý trong Chrome thật** (script điều khiển Chrome qua DevTools Protocol): 10/10 ĐẠT — gõ "tom" ra "Tôm…" (bỏ dấu); Enter tick đúng checkbox; "+ Thêm nguyên liệu mới" ghi vào `newIngredients` + chip; Backspace bỏ chip cuối; Enter không gửi form; tick tag "Lẩu" → đầu bếp đúng chuyên môn lên đầu, dòng đếm cập nhật; chọn đầu bếp ghi `chefId`; "+ Thêm đầu bếp mới" → `chefId=new`, `newChef` = tên đã gõ.
- Ảnh: danh sách 1280px (thông báo + dòng #25 được tô), form sửa 1280px (chip đầu bếp, 4 chip nguyên liệu, ảnh xem trước), danh sách 375px (bảng thành thẻ), form lỗi 375px (focus ô Giá, lỗi từng ô, ô "Tag mới" giữ giá trị + lỗi trùng).

## Bước 5 — Quản trị đầu bếp, nguyên liệu bằng SSR
**Đã làm:**
- `src/routes/admin/list.js`: phần chung của danh sách đầu bếp / nguyên liệu (đọc URL, `parseAdminListQuery` của block7, URL gọn, `findPage` / `findFuzzyPage` của `db.js`, số trang, `?saved=`, link kèm `?back=`).
- `src/routes/admin/chefs.js`: danh sách (Cơ bản: tên hoặc chuyên môn; Gần đúng: tên), form (tên + chuyên môn dạng nút viên + tag mới tạo khi lưu), xoá: không còn món → xoá thẳng; còn món → chọn người nhận, `updateMany` chuyển món + `delete` trong **một transaction**; không chọn → `409`; chọn chính mình / người không có → `400`.
- `src/routes/admin/ingredients.js`: danh sách (Cơ bản: tên hoặc đơn vị; Gần đúng: tên), form (tên, đơn vị), xoá: đang được món dùng → `409` (kèm danh sách món), không dùng → xoá.
- View `admin/chefs/*`, `admin/ingredients/*`; partial `admin-list-state` (điều kiện sai / không có kết quả / trang vượt phạm vi).

**Quyết định và lý do:**
- **Xoá bị chặn trả `409`** như block5 (block7 API trả `200 + IN_USE` vì hợp đồng JSON). Trang hiện lại danh sách món liên quan và câu giải thích.
- **Form đầu bếp có "Tag mới"** giống form món (12.2.a): chuyên môn chưa có thì gõ tên, tạo cùng đầu bếp trong một transaction.
- Kiểm tra trùng tên dùng `nameTaken` của block7 (không phân biệt hoa thường), `@unique` của DB là lớp chặn cuối (`P2002` → 400).

**Đã kiểm tra:**
- **So với API block7: 13/13 ca trùng** id, số món, điểm, `total` (đầu bếp: trang 1–3, "Lẩu" theo chuyên môn, "Nguyễn", gần đúng "Nguyễn Văn Ann", `q=%`; nguyên liệu: trang 1, trang 13 (10 dòng), "tôm", "kg" trang 2, gần đúng "Nước mắn", `q=_`).
- Đọc: form / sửa / xác nhận xoá → 200; id sai → 404; `?mode=fuzzy` thiếu từ khoá, `?page=0` → 400.
- **Ghi: 16/16 ĐẠT** — form trống, trùng tên khác hoa thường → 400; thêm đầu bếp + tag mới → 2 chuyên môn; sửa → 303 về `?page=2`; xoá đầu bếp còn 2 món không chọn người nhận → 409 không xoá; chọn chính mình → 400; chọn Bếp B → 2 món sang Bếp B + Bếp A bị xoá, 303 về `?q=Test`; nguyên liệu đơn vị trống lưu `null`; xoá nguyên liệu đang dùng → 409; xoá nguyên liệu chưa dùng → 303 về `?page=13`; xoá lần hai → 404.
- Dọn dữ liệu thử: DB còn 1200/60/250/16, 2 món mượn để thử chuyển đã trả về đầu bếp cũ.
- Ảnh: xác nhận xoá đầu bếp còn 22 món ở 375px (danh sách món, mỗi món có link đổi đầu bếp riêng).

## Bước 6 — Script hồi quy SSR, mốc "nền SSR theo block7"
**Đã làm:**
- `scripts/check-ssr.mjs` (`npm run check:ssr`, chọn phần: `node scripts/check-ssr.mjs A C`): A thực đơn, B admin món, C admin đầu bếp / nguyên liệu. In ĐẠT / CHƯA ĐẠT, mã thoát 1 khi có ca chưa đạt.
- `scripts/lib/client.mjs`: "trình duyệt" tối giản cho script — giữ cookie, không tự theo redirect, tự gửi kèm ô `_csrf` của trang vừa mở (dùng từ bước 9). `scripts/lib/auth.mjs`: client đã đăng nhập (bước 10 điền phần đăng nhập).

**Quyết định và lý do:**
- **Node `.mjs` thay cho `check-ssr.sh` (curl) của plan**: các bước sau cần cookie jar, đọc `_csrf` trong HTML, so với DB; viết bằng `fetch` + Prisma gọn và dễ đọc hơn chuỗi lệnh curl + grep. Cách kiểm vẫn là request HTTP thật tới server đang chạy.
- **Đối chiếu bằng câu SQL viết tay** (ILIKE, `strpos`, `EXISTS`, `to_tsvector`, `similarity`), không dùng lại code của app → nếu logic truy vấn của app sai, script bắt được.
- Bản ghi thử có tiền tố "[TEST B8]", xoá ở cuối; script in lại số dòng để thấy DB block7 trở về như cũ.

**Lỗi phát hiện trong lúc làm (của script, không phải của app):** lần chạy đầu 46/48 — phần B tạo nguyên liệu "[TEST B8] Lá é" qua ô thêm nhanh và chỉ dọn ở cuối, phần C tạo lại đúng tên đó nên app chặn trùng tên (đúng hành vi). Sửa: phần C dùng tên khác. Chạy lại 48/48.

**Đã kiểm tra:** `node scripts/check-ssr.mjs` → **48/48 ĐẠT**; số món của 11 bộ điều kiện thực đơn khớp SQL (1.200; "bún" 59; "100%" 1; "_" 1; Món nước 0–60.000đ còn bán 97; tạm hết 180; giá 0: 4; nguyên liệu "tôm" 149; đầu bếp "Mai" 122; toàn văn 62; gần đúng 6); admin "lẩu" 61 món, đầu bếp "lẩu" 6, nguyên liệu "kg" 187. Sau khi dọn: 1200 / 60 / 250 / 16.

**Mốc:** nền SSR theo block7 (thực đơn + 3 trang quản trị) chạy đủ chức năng block7 trừ Tải thêm / Cuộn vô hạn (đã chốt bỏ).

## Bước 7 — Thêm 5 bảng xác thực vào DB block7
**Đã làm:**
- `prisma/schema.prisma`: enum `Role` (viewer, editor, admin), `UserStatus` (pending, active), `ChallengePurpose` (activation); model `User` (`users`), `ActivationChallenge` (`activation_challenges`), `PasswordReset` (`password_resets`), `Session` (`sessions`), `RateLimit` (`rate_limits`). Sửa comment đầu file: block8 dùng chung DB block7, từ nay chỉ `db push` từ block8.
- `prisma/sql/block8-auth-tables.sql`: SQL sinh bằng `prisma migrate diff --from-config-datasource --to-schema` **trước** khi push, để nhóm xem.
- `prisma db push` lên DB block7.

**Quyết định và lý do:**
- **Chỉ thêm**: SQL gồm 3 `CREATE TYPE`, 5 `CREATE TABLE`, 5 `CREATE INDEX`, 3 khoá ngoại tới `users` (Cascade). Không có `DROP`, không câu nào chạm 7 bảng của block7 — đã `grep` kiểm tra trước khi push.
- `Role` có sẵn `editor` dù block8 chỉ dùng `viewer` (mặc định) — block9 (RBAC) cần, khai sẵn để block9 không phải đổi enum trên DB dùng chung.
- `ActivationChallenge.userId` là khoá chính (= một dòng mỗi tài khoản pending, plan 3.1). `Session.userId` là cột riêng (có index) để xoá mọi phiên của một user khi đặt lại mật khẩu.

**Đã kiểm tra:**
- Host trước khi push: `aws-0-ap-southeast-1.pooler.supabase.com` (DB block7). `prisma validate` hợp lệ.
- Sau push: 12 bảng; 7 bảng cũ giữ nguyên số dòng (1200 / 60 / 250 / 16 / 2106 / 106 / 5357); 5 bảng mới rỗng.
- API block7 (`Week5/block7/api`, cổng 3001) vẫn trả `/api/dishes`, `/api/chefs` bình thường; repo block7 không có thay đổi.

## Bước 8 — Seed thêm tài khoản
**Đã làm:**
- Cài `argon2@0.45.1`, `validator@13.15.35` (ghim chính xác). `src/auth/password.js` (Argon2id, hash giả cho email không có, quy tắc 8–64 ký tự), `src/auth/email.js` (một hàm chuẩn hoá email dùng mọi nơi, kiểm định dạng bằng `validator.isEmail`).
- `prisma/seed.js`: `TRUNCATE` thêm 5 bảng xác thực; tạo 2 tài khoản `active` có `emailVerifiedAt` (viewer, admin) từ `SEED_VIEWER_EMAIL`, `SEED_ADMIN_EMAIL`, `SEED_USER_PASSWORD`. Thiếu / sai biến → dừng **trước** khi xoá dữ liệu. Băm mật khẩu trước, ngoài transaction.
- `.env.example` đủ biến của block8 (APP_ORIGIN, SESSION_SECRET, OTP_PEPPER, SEED_*, MAIL_*, SMTP_*, RECAPTCHA_*), có hướng dẫn tạo.
- `.env` (không commit): sinh ngẫu nhiên `SESSION_SECRET` (48 byte), `OTP_PEPPER` (32 byte), `SEED_USER_PASSWORD`; không in giá trị ra log.

**Giả định tạm, nhóm cần thay trước khi demo:**
- `SEED_VIEWER_EMAIL=viewer@example.com`, `SEED_ADMIN_EMAIL=admin@example.com`: tên miền `example.com` dành riêng cho ví dụ, thư không tới ai. Plan 12.2.c chốt Gmail của nhóm có dấu `+` — nhóm điền rồi chạy lại seed.
- `RECAPTCHA_*`: cặp **key thử công khai** của Google (luôn trả hợp lệ) cho tới khi nhóm tạo key v2 thật; `RECAPTCHA_HOSTNAMES=localhost,testkey.google.com`. Không dùng khi demo, không làm bằng chứng chặn bot (plan 12.2.b).
- `MAIL_TRANSPORT=file`: thư ghi vào `.mail-outbox/` cho tới khi có Gmail App Password.

**Đã kiểm tra:**
- Host khi seed: `aws-0-ap-southeast-1.pooler.supabase.com` (DB block7).
- **Dấu vân tay md5 của 7 bảng block7** (mọi cột trừ `createdAt`, sắp theo khoá) **trước và sau seed giống hệt** — seed tất định tạo lại đúng dữ liệu block7. Thống kê seed: 1.200 món, 60 đầu bếp, 250 nguyên liệu, 16 tag; 2.106 món–tag, 106 đầu bếp–tag, 5.357 món–nguyên liệu; 4 món giá 0, 180 món tạm hết; 0 món sai chuyên môn; 2 tài khoản active.
- `users`: id 1 viewer, id 2 admin, `status=active`, `passwordHash` dạng `$argon2id$v=19$m=65536,p=4,t=3$…`. Sequence id đã về 1 (`RESTART IDENTITY`) sau các lần thử ở bước 4–6.

## Bước 9 — Session lưu ở DB, khôi phục người dùng, CSRF
**Đã làm:**
- Cài `express-session@1.19.0`. `src/auth/session-store.js`: `PrismaSessionStore` (get / set / destroy / touch trên bảng `sessions`; `userId` tách cột riêng), `destroyUserSessions`.
- `src/auth/load-user.js`: mọi request, `req.session.userId` → đọc user; chỉ nhận user còn tồn tại, `active`, phiên chưa quá 12 giờ kể từ lúc đăng nhập → `res.locals.currentUser`; không đạt → phiên về ẩn danh.
- `src/auth/csrf.js`: token đồng bộ 32 byte mỗi phiên, so bằng `timingSafeEqual`; header `Origin` (nếu có) phải bằng `APP_ORIGIN`; sai → `403`.
- `src/auth/cleanup.js`: xoá phiên hết hạn, bộ đếm hết cửa sổ — khi khởi động và mỗi 30 phút.
- `src/app.js`: thứ tự `static → urlencoded → body ??= {} → session → loadUser → csrf → methodOverride → flash → routes`; thiếu `SESSION_SECRET` / `OTP_PEPPER` / `APP_ORIGIN` → không khởi động. Không bật `trust proxy`.
- `_csrf` vào **cả 7 form POST** (thêm/sửa, xác nhận xoá của 3 trang admin; trang xoá đầu bếp có 2 form). `403.ejs`.

**Quyết định và lý do:**
- **Template gọi `csrf()` thay vì token tính sẵn**: `res.render` sao chép `res.locals` (getter bị gọi ngay) → nếu gắn sẵn, mọi trang (kể cả thực đơn khách) đều tạo phiên. Gọi hàm trong form → phiên ẩn danh chỉ sinh ra khi trang có form ghi dữ liệu.
- **Cookie**: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 2 giờ gia hạn mỗi request (`rolling`); `Secure` chỉ khi `NODE_ENV=production` vì express-session không đặt cookie `Secure` qua http localhost.
- **CSRF kiểm tra trước `method-override`**: form xoá gửi POST `?_method=DELETE`; kiểm tra trên method gốc → không có đường vòng nào bỏ qua được.
- **Phương án đã bỏ:** `csurf` (ngừng bảo trì); `connect-pg-simple` (bảng của thư viện không có cột `userId` → huỷ phiên theo user phải truy vấn trong JSON; plan 12.6).

**Đã kiểm tra (server thật): 9/9 ĐẠT**
- Khách mở `/dishes` → không có `Set-Cookie`.
- Mở form ghi → `Set-Cookie: sid=s%3A…; Path=/; Expires=<+2 giờ>; HttpOnly; SameSite=Lax` (không `Secure` ở localhost); bảng `sessions` thêm 1 dòng `userId` rỗng, có `csrfToken`.
- POST thiếu `_csrf`, `_csrf` sai, đúng token nhưng `Origin: https://evil.example`, token của phiên khác, `?_method=DELETE` thiếu token → **403, DB không đổi**. Đúng token + đúng Origin → 303.
- `check-ssr.mjs` (client tự gửi `_csrf` như trình duyệt): **48/48 ĐẠT**.

## Bước 10 — Đăng nhập, đăng xuất, chặn `/admin`, khu tài khoản
**Đã làm:**
- `src/routes/auth/login.js`: `GET/POST /login`, `POST /logout`. `src/auth/require-login.js`: `requireLogin` (gắn `app.use("/admin", requireLogin)`), `safeNext`. `src/auth/photos.js`: ảnh món cho từng trang tài khoản (đọc `imageUrl`, `imageCredit` từ DB).
- Giao diện theo **Figma vòng 2 đã duyệt** (làm luôn ở bước này, bước 17 chỉ còn đối chiếu): `views/auth/_start.ejs` / `_end.ejs` (hướng A: ảnh + lời chào trái, form phải; 240px / 196px ở 820 / 375), `_field.ejs` (nhãn luôn hiện, ô 48px chữ 16px, link cạnh nhãn, nút Hiện mật khẩu, gợi ý, lỗi + `aria-describedby`), `_banner.ejs`, `login.ejs`. Header: email + "Đăng xuất" (form POST) khi đã đăng nhập; điện thoại tách thành hàng thứ hai.
- `ui.js`: nút Hiện / Ẩn mật khẩu. CSS khu tài khoản + trang tài khoản.
- `scripts/check-auth.mjs` (`npm run check:auth`) phần D; `scripts/lib/server.mjs` (script tự chạy / dừng server thật ở cổng 3100); `scripts/lib/auth.mjs` đăng nhập bằng tài khoản seed → `check-ssr.mjs` dùng được sau khi `/admin` bị khoá.

**Quyết định và lý do:**
- **Thứ tự trong `POST /login`**: tìm user → `verifyPassword` (email không có vẫn chạy với hash giả) → sai: một câu chung "Email hoặc mật khẩu không đúng." → đúng nhưng `pending`: không tạo session, báo cần kích hoạt (chỉ người đã biết mật khẩu mới thấy) → `active`: `session.regenerate` (sid mới, phiên ẩn danh cũ bị xoá) → `userId`, `loginAt` → `save` xong mới `303`.
- **Đăng xuất**: `session.destroy` (xoá bản ghi ở server) trước, rồi `clearCookie`, `303 /login?msg=logged-out`. Chỉ POST + `_csrf`.
- **`requireLogin`**: GET → `303 /login?next=<url>`; method khác → `303 /login`. `Cache-Control: no-store` cho trang admin. `safeNext` chỉ nhận đường dẫn bắt đầu bằng `/`, không `//`, không `\`, không `/login…`.
- Lỗi nhập ở form tài khoản trả **200** + `data-error-code` (plan 12.1 mục 11); thông báo `?msg=` của trang đăng nhập tra bảng riêng.
- **Script tự chạy server**: ca "khởi động lại server" là dừng tiến trình thật rồi chạy lại, không phải giả lập.

**Đã kiểm tra:**
- `check-auth.mjs D`: **25/25 ĐẠT** — khách xem thực đơn không có `Set-Cookie`; 14 route GET `/admin` → `303 /login?next=…`; 9 request POST/PATCH/DELETE không đăng nhập (có `_csrf` hợp lệ) → `303 /login`, số dòng DB không đổi; cookie bịa → 303; sai mật khẩu và email không có → cùng 200, cùng nội dung; form giữ email, không giữ mật khẩu; đăng nhập đúng (email viết hoa + khoảng trắng) → 303, `HttpOnly; SameSite=Lax`; sid đổi, phiên cũ bị xoá; phiên mới có `userId`; `/admin/dishes` 200 + `no-store` + email + nút Đăng xuất; `next` nội bộ giữ, 3 kiểu `next` ra ngoài bị bỏ; pending đúng mật khẩu → `ACCOUNT_NOT_ACTIVATED`, không có phiên; CSRF thiếu / sai / Origin lạ / `?_method=DELETE` → 403; **dừng + chạy lại server → cookie cũ vẫn đăng nhập**; đăng xuất → bản ghi phiên bị xoá, bản sao sid cũ → 303; `GET /logout` → 404.
- `check-ssr.mjs` (đăng nhập bằng tài khoản seed): **48/48 ĐẠT**.
- Ảnh trang đăng nhập 1280 / 820 / 375 khớp Figma vòng 2 (ảnh Phở + ghi công thật từ DB; ở 375 dòng ghi công xuống 2 dòng vì dài hơn bản nháp).

## Bước 11 — Gửi email, sinh mã
**Đã làm:**
- Cài `nodemailer@10.3.1`. `src/auth/mailer.js`: `MAIL_TRANSPORT=smtp` (Gmail `smtp.gmail.com:465`, App Password) hoặc `file` (dựng thư MIME đầy đủ rồi ghi `.eml` vào `source-code/.mail-outbox/`, đã có trong `.gitignore`); `sendLater` gửi bất đồng bộ; 3 mẫu thư (mã kích hoạt, link đặt lại, báo đã đổi mật khẩu), văn bản + HTML cùng màu ứng dụng; header `X-Mail-Kind` để script lọc.
- `src/auth/secrets.js`: `generateOtp` (`crypto.randomInt`, 6 chữ số), `hashOtp` (HMAC-SHA256 với `OTP_PEPPER`), `generateToken` (32 byte base64url), `sha256`, `sameHex` (`timingSafeEqual`).
- `scripts/lib/outbox.mjs`: đọc thư mới nhất gửi tới một địa chỉ, giải quoted-printable, lấy mã / link (từ chối chạy khi `NODE_ENV=production`).

**Lỗi phát hiện trong lúc làm:** bản đầu `sendMail` là hàm thường; khi `MAIL_TRANSPORT=smtp` mà thiếu `SMTP_PASS`, `getTransport()` ném lỗi **đồng bộ** → `.catch` trong `sendLater` không bắt được → tiến trình server sập ngay trong `setImmediate`. Sửa: `sendMail` thành `async` (mọi lỗi thành promise bị từ chối). Bằng chứng sau khi sửa: chạy `sendLater` với SMTP thiếu mật khẩu → log `[mail] Gửi thư "activation" thất bại lúc …: Error`, tiến trình vẫn chạy.

**Đã kiểm tra:**
- 2.000 mã sinh thử đều đúng 6 chữ số, có mã bắt đầu bằng `0` (không mất số 0 đầu). HMAC là 64 ký tự hex, cùng mã → cùng hash, `sameHex` đúng / sai đúng. Token 43 ký tự base64url.
- Thư kích hoạt ghi vào outbox, đọc lại đúng mã; tên người gửi có dấu được mã hoá đúng (`=?UTF-8?Q?Nhà_hàng?=`).
- `sendLater` trả về ngay (50ms đầu chưa có thư), sau đó link đặt lại đọc được đúng.
- Log khi gửi lỗi: **0 dòng** chứa mã hoặc địa chỉ người nhận.
- Gmail SMTP **chưa kiểm được**: cần App Password của nhóm (`.env`: `MAIL_TRANSPORT=smtp`, `SMTP_USER`, `SMTP_PASS`).

## Bước 12 — Bộ đếm giới hạn, reCAPTCHA, trang 429 / 503
**Đã làm:**
- `src/auth/rate-limit.js`: `hit` (một câu `INSERT … ON CONFLICT (key) DO UPDATE … RETURNING`: đếm trong cửa sổ, đủ `lockAt` lần thì khoá `lockMs`, khoá còn hạn thì giữ), `peek`, `reset`, `limit` (đếm request, quá `max` → bị giới hạn + `retryAfter`).
- `src/auth/recaptcha.js`: `siteverify` tại backend (timeout 5 giây), chỉ cho qua khi `success === true` **và** `hostname` thuộc `RECAPTCHA_HOSTNAMES`; không gọi được → `unavailable`.
- `views/auth/result.ejs` (khối kết quả theo Figma: biểu tượng tròn + tiêu đề + nội dung + nút + link), `src/auth/pages.js`: `tooMany` (429 + `Retry-After`), `captchaUnavailable` (503). `views/auth/_captcha.ejs` + `ui.js` `renderCaptcha` (Google `render=explicit`; màn < 360px dùng bản `compact`).

**Quyết định và lý do:**
- **Một câu SQL cho mỗi lần đếm**: PostgreSQL khoá dòng của key trong lúc `ON CONFLICT DO UPDATE` → các request song song xếp hàng, không đọc-rồi-ghi đè lên nhau.
- **`render=explicit`** thay cho tự dựng: Google gọi `renderCaptcha` sau khi script tải; chọn `compact` theo độ rộng màn hình trước khi vẽ (ghi chú Figma vòng 2: 304px không vừa 280px ở màn 320px).
- Trang 429 / 503 dùng chung khối kết quả của khu tài khoản (plan đặt tên `429.ejs` / `503.ejs`; gộp thành `auth/result.ejs` + status vì cùng một bố cục).

**Đã kiểm tra:**
- 20 lần `hit` **song song** cùng một key → các giá trị trả về là đúng 1..20 không trùng, DB còn 20.
- `lockAt 3, lockMs 5 phút`: lần 1–2 chưa khoá, lần 3 khoá ~5 phút; dời `windowStart` lùi 2 phút → lần sau đếm lại từ 1, khoá vẫn giữ.
- `limit max 3`: lần 4 bị giới hạn, `retryAfter ≤ 60`; `reset` xoá bộ đếm.
- reCAPTCHA (gọi `siteverify` thật): thiếu token → `missing-input-response`; **key thử công khai của Google → hợp lệ, `hostname = testkey.google.com`**; cùng token nhưng `RECAPTCHA_HOSTNAMES=localhost` → từ chối `hostname:testkey.google.com`; secret sai → `invalid-input-response`; fetch lỗi (giả lập mất mạng) → `unavailable` (route trả 503, không cho qua).
- Chưa kiểm với key thật (cần nhóm tạo key v2 cho `localhost`).

## Bước 13 — Đăng ký, kích hoạt bằng mã, gửi lại mã
**Đã làm:**
- `src/routes/auth/register.js`: `GET/POST /register`, `GET/POST /activate`, `POST /activate/resend`.
- View `auth/register.ejs` (email, mật khẩu + quy tắc nói trước, nhập lại, reCAPTCHA), `auth/activate.ejs` (một form hai nút: "Kích hoạt" → `/activate`, "Gửi lại mã" → `formaction="/activate/resend"`), `auth/_captcha.ejs`.
- `ui.js`: 6 ô mã vẽ trên **một** ô nhập thật (trong suốt, vẫn nhận gõ / dán / tự điền); đếm ngược "Gửi lại mã sau 0:42"; nút "Đang …" theo đúng nút vừa bấm (`event.submitter`).
- `check-auth.mjs` phần A (đăng ký + kích hoạt), B (CAPTCHA ở đăng ký + giới hạn IP); `scripts/lib/server.mjs` giữ log của server để kiểm tra log không chứa mã.

**Luồng (plan 5.2, 5.3):**
- Đăng ký: giới hạn 10 / giờ theo IP → **reCAPTCHA trước** khi băm / tạo / gửi → kiểm tra dữ liệu (không đọc `role`) → **luôn băm mật khẩu** → email mới: tạo user `pending` + mã (một lệnh lồng nhau) và gửi thư bất đồng bộ; đang pending: không ghi đè mật khẩu, coi như gửi lại theo giới hạn (quá thì lặng lẽ bỏ qua); đã active: không làm gì. Cả ba → `303 /activate`.
- Kích hoạt: giới hạn IP → đang khoá (bản ghi mã, hoặc bộ đếm theo email nếu không có tài khoản pending) → 429 → so HMAC bằng `timingSafeEqual` → một transaction: `updateMany` có điều kiện (pending, `activation`, chưa dùng, chưa hết hạn, `attempts < 5`, không khoá, hash khớp) đặt `usedAt`, `count = 1` thì đặt `active` + `emailVerifiedAt` → `303 /login?msg=activated` (không tự đăng nhập). Sai vì bất kỳ lý do gì → cùng `INVALID_OTP`, `attempts + 1`; đủ 5 → khoá 15 phút.
- Gửi lại: chờ 60 giây + tối đa 5 / giờ theo email (cả email không có tài khoản) → mã mới ghi đè `otpHash`, hạn, `usedAt`; **giữ `attempts`, `lockedUntil`**.

**Lỗi phát hiện trong lúc làm:**
1. *(Rò rỉ, phát hiện khi đọc lại code, trước khi chạy)* Trang nhập mã có đếm ngược dựa trên `session.otpSentAt`; bản đầu chỉ đặt giá trị này khi thật sự gửi thư → trang sau đăng ký của email mới có đếm ngược, của email đã active thì không → **lộ email nào đã đăng ký**. Sửa: đặt `otpSentAt` ở mọi nhánh. Bằng chứng: ca "Trang sau đăng ký giống hệt nhau cho email mới / pending / đã active" ĐẠT (so từng dòng: chỉ khác CSRF token, email đã gõ và số giây đếm ngược 57 / 60 do thời điểm bấm).
2. *(Của script)* Lần chạy đầu 29/31: ca so trang chưa bỏ số giây đếm ngược; ca hostname nhận 429 vì phần A + B đã đăng ký 11 lần từ cùng IP (giới hạn 10/giờ hoạt động đúng). Sửa script, chạy lại đạt hết.
3. *(Của script)* `scripts/lib/server.mjs` cộng dồn log qua các lần chạy → khi khởi động lại, dòng "Server chạy tại" của lần trước làm hàm trả về trước khi server mới lên. Sửa: chỉ xét log của lần chạy hiện tại.

**Đã kiểm tra — `check-auth.mjs`: 56/56 ĐẠT** (A 25, B 6, D 25):
- A: đăng ký kèm `role=admin` → pending, `viewer`; mật khẩu Argon2id, mã HMAC 64 hex; mã có trong thư, không có trong response / trang; pending đăng nhập → không có phiên; mã kích hoạt làm mật khẩu → từ chối; đăng ký lại email pending không ghi đè mật khẩu; email đã active → không đổi gì, không gửi thư; 3 trang sau đăng ký giống nhau; dữ liệu sai → `VALIDATION_FAILED`, không tạo user; 3 lần mã sai → cùng `INVALID_OTP`, `attempts = 3`; gửi lại → mã mới, `attempts` vẫn 3; mã cũ bị từ chối; lần sai thứ 5 → khoá; đang khoá mã đúng → 429 + `Retry-After`; hết khoá, mã đúng → active, `emailVerifiedAt`, `usedAt`, không tự đăng nhập; dùng lại mã → `INVALID_OTP`; **2 request cùng mã đúng song song → một 303 + một `INVALID_OTP`**; mã hết hạn → `INVALID_OTP`; gửi lại 2 lần trong 60 giây → 429 (cả email không có tài khoản); email không có tài khoản: 5 lần sai rồi 429; log server không chứa mã hay mật khẩu.
- B: thiếu CAPTCHA → `CAPTCHA_REQUIRED`, không tạo user, không gửi thư; tự khai `captchaPassed=true` → vẫn từ chối; trang có site key, không có secret; server chạy với secret sai (Google trả không hợp lệ) và với `RECAPTCHA_HOSTNAMES=localhost` (hostname `testkey.google.com` không được phép) → `INVALID_CAPTCHA`; 11 lần đăng ký từ một IP → lần 11 nhận 429.
- Ảnh: đăng ký 1280px (widget reCAPTCHA thật của Google, đang là key thử), nhập mã 375px (6 ô) khớp Figma.
- **Chưa kiểm được với key reCAPTCHA thật**: ca "token thật dùng lại / hết hạn" cần bấm tay (checklist ở bước 16).

## Bước 14 — Chống brute force ở đăng nhập
**Đã làm:** `src/routes/auth/login.js` thêm theo đúng thứ tự plan 5.4:
1. `login:ip:<ip>` — 30 lần gửi form / 15 phút (đếm mọi lần, kể cả thiếu dữ liệu, CAPTCHA sai) → 429.
2. `login-fail:email:<email>` đang khoá → 429 "Tạm khoá đăng nhập" (nút "Đặt lại mật khẩu"), không xét CAPTCHA / mật khẩu.
3. Bộ đếm theo email ≥ 3 trong 15 phút → bắt buộc reCAPTCHA **trước** khi so mật khẩu; thiếu → `CAPTCHA_REQUIRED`, sai → `INVALID_CAPTCHA`, Google không trả lời → 503; không so mật khẩu, không tăng bộ đếm email.
4. Sai mật khẩu → `hit` bộ đếm email (đủ 10 → khoá 5 phút, trả 429 ngay); lần sai thứ 3 thì form trả về đã có CAPTCHA.
5. Đăng nhập thành công → `reset` bộ đếm email (không đụng bộ đếm IP) → `regenerate` …
- `GET /login` hiện sẵn CAPTCHA khi email vừa gõ (nhớ trong phiên ẩn danh) đang ở ngưỡng.
- `check-auth.mjs` phần C.

**Quyết định và lý do:**
- Quyết định "có cần CAPTCHA" dựa trên **email trong request + bộ đếm ở DB**, không dựa vào form hay cookie → bỏ trường CAPTCHA, xoá cookie, gửi curl thẳng đều không lách được.
- Email không có tài khoản có bộ đếm như email thật → việc bị đòi CAPTCHA / bị khoá không tiết lộ email nào tồn tại.
- Lần sai thứ 10 trả 429 ngay (không đợi lần 11) để người dùng biết và đi tới "Đặt lại mật khẩu".
- Tài khoản pending đúng mật khẩu: không có phiên, **không** xoá bộ đếm (chỉ đăng nhập thành công mới xoá — theo ghi chú của đề).

**Đã kiểm tra — `check-auth.mjs C D`: 37/37 ĐẠT** (C 12, D 25):
2 lần sai chưa có CAPTCHA (bộ đếm 2); lần 3 → form có CAPTCHA; mở lại `/login` vẫn có CAPTCHA; đủ ngưỡng + bỏ trường CAPTCHA + mật khẩu **đúng** → `CAPTCHA_REQUIRED`, không đăng nhập, bộ đếm giữ 3; CAPTCHA đúng + mật khẩu sai → bộ đếm 4; client mới (không cookie) → vẫn `CAPTCHA_REQUIRED`; lần sai 10 → 429 + `Retry-After`, `lockedUntil` +5 phút; đang khoá + mật khẩu đúng + CAPTCHA đúng → 429, không có phiên; hết khoá, cửa sổ còn → vẫn cần CAPTCHA; đúng + CAPTCHA → 303, xoá bộ đếm email, còn bộ đếm IP; email không tồn tại: 3 lần sai rồi `CAPTCHA_REQUIRED`; 31 lần gửi từ một IP → lần 31 nhận 429.

## Bước 15 — Quên mật khẩu, đặt lại mật khẩu
**Đã làm:** `src/routes/auth/password-reset.js` (`GET/POST /forgot`, `GET/POST /reset`), view `auth/forgot.ejs`, `auth/reset.ejs`; "đã gửi" và "link không dùng được" dùng khối kết quả `auth/result.ejs`. `check-auth.mjs` phần E (quên / đặt lại) và F (hồi quy nhanh).

**Luồng:**
- `POST /forgot`: giới hạn 10 / giờ theo IP → kiểm định dạng email → giới hạn 3 / giờ theo email (cả email không có) → **trả `303 /forgot?msg=forgot-sent` ngay**; việc tìm user, vô hiệu token cũ + tạo token mới (một transaction), gửi thư chạy **sau** khi trả lời (`setImmediate`). Link dựng từ `APP_ORIGIN`.
- `GET /reset?token=`: `Referrer-Policy: no-referrer`, giới hạn 20 / 15 phút theo IP; token hợp lệ → form (token trong ô ẩn), **không ghi DB**; không hợp lệ → một trang chung "Link không dùng được".
- `POST /reset`: token còn hợp lệ → kiểm mật khẩu mới → một transaction: `updateMany` token (`usedAt` rỗng, chưa hết hạn) → `count = 1` thì đổi `passwordHash`, vô hiệu token khác, **xoá mọi phiên của user** → thư "Mật khẩu đã được đổi" → `303 /login?msg=password-reset`. Không tự đăng nhập, không đổi `status`.

**Quyết định và lý do:**
- **Ghi DB + gửi thư sau khi trả lời**: nếu làm trước, email có tài khoản tốn thêm vài vòng mạng tới Supabase → thời gian phản hồi lộ email nào đã đăng ký (đề: nội dung, status **và thời gian** không được phân biệt). Lỗi nền chỉ ghi `[forgot] … mã lỗi`.
- Token hết hạn / đã dùng / sai / bịa → cùng một trang (không cho biết token từng tồn tại).
- Xoá phiên bằng cột `sessions.userId` (bước 7) trong cùng transaction với đổi mật khẩu.

**Lỗi phát hiện trong lúc làm (của script):** lần chạy đầu E 19/20 — ca "4 yêu cầu cùng email" nhận 429 ngay từ lần 1 vì cả phần E đã gửi 11 yêu cầu từ một IP (giới hạn 10 / giờ theo IP hoạt động đúng). Sửa: xoá bộ đếm IP trước ca đó.

**Đã kiểm tra — `check-auth.mjs` toàn bộ: 92/92 ĐẠT** (A 25, B 6, C 12, D 25, E 20, F 4). Phần E:
email có / không có → cùng 303, cùng trang, thời gian gần nhau (chênh < 400ms); thư chứa `APP_ORIGIN/reset?token=…`, DB chỉ có SHA-256, hạn 15 phút; `GET /reset` hợp lệ → form, `usedAt` rỗng, `Referrer-Policy: no-referrer`; mật khẩu mới không khớp → `VALIDATION_FAILED`, token chưa dùng; đăng nhập ở tab 1, đặt lại ở tab 2 → 303 `/login`, không tự đăng nhập, **sid của tab 1 bị từ chối**, user còn 0 phiên, có thư báo đã đổi; mật khẩu cũ bị từ chối, mới đăng nhập được; dùng lại token → "Link không dùng được", mật khẩu không đổi; token cũ sau yêu cầu mới → từ chối; token hết hạn → từ chối (GET và POST); token bịa → cùng trang; **2 request cùng token song song → một 303 + một từ chối**; reset token dùng làm mã kích hoạt / mật khẩu / cookie sid → đều bị từ chối; đặt lại cho tài khoản pending → vẫn pending; 4 yêu cầu `/forgot` cùng email (có / không có tài khoản) → lần 4 nhận 429; log không chứa reset token.
