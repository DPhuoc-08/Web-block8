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
