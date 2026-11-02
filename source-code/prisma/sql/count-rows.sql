-- Số bản ghi từng bảng của block7 — bằng chứng "dữ liệu thật trong Supabase, ≥ 1.000 món" (plan mục 9).
-- Chạy: `node scripts/run-sql.js prisma/sql/count-rows.sql` hoặc dán vào Supabase → SQL Editor.
-- Kỳ vọng (seed tất định `npx prisma db seed`): dishes 1200, chefs 60, ingredients 250, tags 16,
-- dish_tags 2106, chef_tags 106, dish_ingredients 5357.
SELECT 'dishes' AS bang, count(*) AS so_dong FROM dishes
UNION ALL SELECT 'chefs', count(*) FROM chefs
UNION ALL SELECT 'ingredients', count(*) FROM ingredients
UNION ALL SELECT 'tags', count(*) FROM tags
UNION ALL SELECT 'dish_tags', count(*) FROM dish_tags
UNION ALL SELECT 'chef_tags', count(*) FROM chef_tags
UNION ALL SELECT 'dish_ingredients', count(*) FROM dish_ingredients;

-- Một vài con số dùng trong kịch bản demo (kichban.html).
-- Kỳ vọng: tong 1200, tam_het 180, gia_0 4, id_nho_nhat 1, id_lon_nhat 1200.
SELECT count(*) AS tong,
       count(*) FILTER (WHERE NOT available) AS tam_het,
       count(*) FILTER (WHERE price = 0) AS gia_0,
       min(id) AS id_nho_nhat, max(id) AS id_lon_nhat
FROM dishes;

-- Món theo tag (một món có thể nhiều tag nên tổng > 1200).
-- Kỳ vọng: Hải sản 386, Món nước 224, Miền Nam 169, Món cơm 165, … Lẩu 61, Món cuốn 60.
SELECT t.name AS tag, count(*) AS so_mon
FROM tags t JOIN dish_tags dt ON dt."tagId" = t.id
GROUP BY t.name ORDER BY so_mon DESC, t.name;
