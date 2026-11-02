-- Truy vấn mẫu của 4 chế độ search trên bảng dishes của block7 — bằng chứng "query thực hiện tại PostgreSQL".
-- Cùng cách làm với file block7-search-examples.sql của giảng viên (bảng books), nhưng chạy trên dữ liệu seed thật.
-- Chạy: dán vào Supabase → SQL Editor, hoặc `npx prisma db execute --file prisma/sql/search-examples.sql`
-- (lệnh này chỉ báo chạy được hay không, không in kết quả).
-- Các dòng "Kỳ vọng" tính từ seed tất định (`npx prisma db seed`): seed lại thì kết quả không đổi.
-- BEGIN/ROLLBACK: không lưu hàm tạm, PREPARE hay ngưỡng pg_trgm.
BEGIN;

-- ===== 1. basic: literal contains trên tên, không phân biệt hoa thường =====
-- API escape \ % _ trước khi đưa vào ILIKE (src/validators/list-query.js → escapeLike), vì Prisma không tự escape.
-- Ký tự escape mặc định của LIKE/ILIKE trong PostgreSQL là dấu \.
CREATE FUNCTION pg_temp.literal_pattern(q text) RETURNS text
LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

PREPARE basic_search(text) AS
SELECT id, name FROM dishes WHERE name ILIKE pg_temp.literal_pattern($1) ORDER BY id ASC;

EXECUTE basic_search('Trà_');
-- Kỳ vọng id: 700 ("Trà_sữa nhà làm"). Dấu _ người dùng nhập là ký tự thường.
-- (Nếu KHÔNG escape: _ là "một ký tự bất kỳ" → khớp thêm mọi "Trà …" — lỗi đã gặp ở bước 7, BUILD_LOG.)
EXECUTE basic_search('100%');
-- Kỳ vọng id: 560 ("Combo 100% bò").
EXECUTE basic_search('LÚC LẮC');
-- Kỳ vọng id: 9,110,255,509,607,610,625,835,886,957 (không phân biệt hoa thường, giữ dấu).
EXECUTE basic_search('khongcomonnay');
-- Kỳ vọng: không có dòng nào (API trả ok: true, items: [], total: 0 — không phải NOT_FOUND).

-- ===== 2. advanced: nhiều tiêu chí nối bằng AND; NULL = tiêu chí không được gửi =====
-- Thứ tự tham số: pattern q, tagId, minPrice, maxPrice, available.
PREPARE advanced_search(text, int, int, int, boolean) AS
SELECT d.id, d.name, d.price
FROM dishes d
WHERE ($1 IS NULL OR d.name ILIKE pg_temp.literal_pattern($1))
  AND ($2 IS NULL OR EXISTS (SELECT 1 FROM dish_tags dt WHERE dt."dishId" = d.id AND dt."tagId" = $2))
  AND ($3 IS NULL OR d.price >= $3)
  AND ($4 IS NULL OR d.price <= $4)
  AND ($5 IS NULL OR d.available = $5)
ORDER BY d.id ASC;

EXECUTE advanced_search('lẩu', 16, 200000, 300000, true);
-- Kỳ vọng id: 135,352,675,1107,1169 (tên có "lẩu", tag Miền Nam (id 16), giá 200.000–300.000, còn phục vụ).
EXECUTE advanced_search(NULL, NULL, 0, 0, NULL);
-- Kỳ vọng id: 300,420,830,1100 — 0 là tiêu chí có hiệu lực, khác NULL.
EXECUTE advanced_search('lẩu', NULL, NULL, NULL, NULL);
-- Kỳ vọng 60 dòng: tên chứa "lẩu". Tag Lẩu có 61 món — "Combo 100% bò" có tag Lẩu nhưng tên không chứa "lẩu".

-- ===== 3. fulltext: cấu hình simple, document = tên (trọng số A) + mô tả (trọng số D) =====
PREPARE fulltext_search(text) AS
WITH input AS (SELECT plainto_tsquery('simple', $1) AS query),
docs AS (
  SELECT d.id, d.name,
         setweight(to_tsvector('simple', coalesce(d.name, '')), 'A') ||
         setweight(to_tsvector('simple', coalesce(d.description, '')), 'D') AS document
  FROM dishes d
)
SELECT docs.id, docs.name, round(ts_rank(docs.document, input.query)::numeric, 3) AS score
FROM docs CROSS JOIN input
WHERE docs.document @@ input.query
ORDER BY score DESC, docs.id ASC;

EXECUTE fulltext_search('cá kho tộ');
-- Kỳ vọng 11 dòng; 5 dòng đầu: 8 "Cá kho tộ", 80, 109, 201, 342 — cùng điểm 1.000 nên xếp theo id.
EXECUTE fulltext_search('nước dùng xương');
-- Kỳ vọng: mọi dòng chứa đủ 3 từ ở tên hoặc mô tả, không cần liền nhau; món có "xương" trong TÊN đứng đầu (trọng số A).
EXECUTE fulltext_search('pho');
-- Kỳ vọng: không có dòng nào — simple không bỏ dấu, "pho" ≠ "phở".

-- ===== 4. fuzzy: pg_trgm, similarity của cả tên, ngưỡng 0.3 đặt cục bộ trong transaction =====
-- set_config(..., true) = SET LOCAL: chỉ có hiệu lực tới hết transaction (an toàn với connection pool).
SELECT set_config('pg_trgm.similarity_threshold', '0.3', true);

PREPARE fuzzy_search(text) AS
SELECT id, name, round(similarity(name, $1)::numeric, 3) AS score
FROM dishes
WHERE name % $1
ORDER BY score DESC, id ASC;

EXECUTE fuzzy_search('Bò lúc lắt');
-- Kỳ vọng thứ tự id: 9 (0.667), 957 (0.5), 610 (0.4), 255 (0.381), 625 (0.333), 216 "Lẩu bò" (0.308).
SELECT set_config('pg_trgm.similarity_threshold', '0.6', true);
EXECUTE fuzzy_search('Bò lúc lắt');
-- Kỳ vọng chỉ có id 9 — ngưỡng cao bỏ cả các món "Cơm bò lúc lắc".
SELECT set_config('pg_trgm.similarity_threshold', '0.3', true);
EXECUTE fuzzy_search('pho bo tai');
-- Kỳ vọng: không có dòng nào (similarity với "Phở bò tái" ≈ 0.222 < 0.3) — không hỗ trợ tìm không dấu.

-- ===== 5. total và một trang dùng CÙNG điều kiện, trong một câu (một ảnh chụp dữ liệu) =====
WITH matched AS (SELECT id FROM dishes WHERE name ILIKE pg_temp.literal_pattern('lẩu'))
SELECT (SELECT count(*) FROM matched) AS total,
       ARRAY(SELECT id FROM matched ORDER BY id LIMIT 3 OFFSET 0) AS page1,
       ARRAY(SELECT id FROM matched ORDER BY id LIMIT 3 OFFSET 3) AS page2;
-- Kỳ vọng: total = 60, page1 = {37,44,55}, page2 = {77,130,135}.

DEALLOCATE basic_search;
DEALLOCATE advanced_search;
DEALLOCATE fulltext_search;
DEALLOCATE fuzzy_search;
ROLLBACK;
