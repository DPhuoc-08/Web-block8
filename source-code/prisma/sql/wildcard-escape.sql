-- Lỗi đã phát hiện ở bước 7 (BUILD_LOG "Lỗi đã phát hiện"): ký tự người dùng nhập bị hiểu là wildcard.
-- Tái hiện ở mức PostgreSQL, đúng dạng câu Prisma sinh cho `contains` + `mode: "insensitive"`:
--     "name" ILIKE ('%' || $1 || '%')
-- Chạy: `node scripts/run-sql.js prisma/sql/wildcard-escape.sql`

-- ===== TRƯỚC KHI SỬA: $1 là chuỗi người dùng gõ, đưa nguyên vào ILIKE =====
-- Kỳ vọng: 1200 — "%" là "chuỗi bất kỳ" → khớp mọi món.
SELECT 'q=%  (chưa escape)' AS truong_hop, count(*) AS so_mon FROM dishes WHERE name ILIKE ('%' || '%' || '%');
-- Kỳ vọng: 1200 — "_" là "một ký tự bất kỳ" → khớp mọi tên có ít nhất 1 ký tự.
SELECT 'q=_  (chưa escape)' AS truong_hop, count(*) AS so_mon FROM dishes WHERE name ILIKE ('%' || '_' || '%');
-- Kỳ vọng: 23 — "Trà_" khớp mọi "Trà" + một ký tự (vd. "Trà matcha sữa"), không chỉ "Trà_sữa nhà làm".
-- (Bước 7 đo được 24 trên seed lúc đó; bước 8 bỏ các tên lặp chữ trong bộ sinh nên seed hiện tại còn 23.)
SELECT 'q=Trà_  (chưa escape)' AS truong_hop, count(*) AS so_mon FROM dishes WHERE name ILIKE ('%' || 'Trà_' || '%');

-- ===== SAU KHI SỬA: API gọi escapeLike (src/validators/list-query.js) trước khi đưa vào ILIKE =====
-- escapeLike: \ → \\, % → \%, _ → \_ (một lượt). Dấu \ là ký tự escape mặc định của LIKE/ILIKE trong PostgreSQL.
-- Kỳ vọng: 1 dòng — id 560 "Combo 100% bò" (món duy nhất có dấu % trong tên).
SELECT 'q=%  (đã escape)' AS truong_hop, id, name FROM dishes WHERE name ILIKE ('%' || '\%' || '%');
-- Kỳ vọng: 1 dòng — id 700 "Trà_sữa nhà làm".
SELECT 'q=_  (đã escape)' AS truong_hop, id, name FROM dishes WHERE name ILIKE ('%' || '\_' || '%');
-- Kỳ vọng: 1 dòng — id 700 "Trà_sữa nhà làm".
SELECT 'q=Trà_  (đã escape)' AS truong_hop, id, name FROM dishes WHERE name ILIKE ('%' || 'Trà\_' || '%');
-- Kỳ vọng: 1 dòng — id 960 "Cơm \ cháo tuỳ chọn" (dấu \ người dùng gõ cũng là ký tự thường).
SELECT 'q=\  (đã escape)' AS truong_hop, id, name FROM dishes WHERE name ILIKE ('%' || '\\' || '%');
