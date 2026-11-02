// Tìm GẦN GIỐNG (gõ sai) bằng pg_trgm (plan mục 5.4, 3.3, 14).
// - similarity(tên, q): độ giống theo các nhóm 3 ký tự của CẢ tên (không phải word_similarity trên một đoạn tên).
// - Toán tử `%` giữ dòng có similarity ≥ ngưỡng; ngưỡng công bố của bài tập là 0.3.
// - Ngưỡng đặt bằng set_config(..., is_local = true) — tương đương SET LOCAL — trong CÙNG transaction với câu tìm:
//   app dùng connection pool, đặt cho cả session sẽ "rò" sang request khác dùng lại kết nối đó.
// - Không bỏ dấu: "pho bo" không khớp "Phở bò" (similarity ~0.2) — giới hạn đã nêu trong plan.
// - Thứ tự: similarity (làm tròn 3 chữ số trong SQL, như fulltext.js) giảm dần rồi id tăng dần.
import { Prisma } from "../../generated/prisma/client.ts";

export const FUZZY_THRESHOLD = 0.3;

// Phần "chọn id + điểm" của từng kiểu tìm. Tên bảng/cột là HẰNG viết sẵn ở đây (route chọn theo khoá cố định),
// không bao giờ lấy từ input; chỉ q là tham số bind. Mỗi câu trả đúng một dòng cho mỗi id.
export const FUZZY_MATCHERS = {
  // Món theo tên món (như trước bước 28).
  dishName: (q) => Prisma.sql`
    SELECT d.id, round(similarity(d.name, ${q})::numeric, 3) AS score
    FROM dishes d WHERE d.name % ${q}`,
  // Món theo nguyên liệu: một món có thể có nhiều nguyên liệu khớp ("Tôm xú" ~ Tôm sú, Tôm thẻ…) →
  // GROUP BY món, điểm = nguyên liệu giống nhất. Không GROUP BY thì một món xuất hiện nhiều lần, total sai.
  dishIngredient: (q) => Prisma.sql`
    SELECT di."dishId" AS id, round(max(similarity(i.name, ${q}))::numeric, 3) AS score
    FROM dish_ingredients di JOIN ingredients i ON i.id = di."ingredientId"
    WHERE i.name % ${q}
    GROUP BY di."dishId"`,
  // Món theo đầu bếp phụ trách: mọi món của một đầu bếp cùng điểm → xếp theo id.
  dishChef: (q) => Prisma.sql`
    SELECT d.id, round(similarity(c.name, ${q})::numeric, 3) AS score
    FROM dishes d JOIN chefs c ON c.id = d."chefId"
    WHERE c.name % ${q}`,
  // Trang admin đầu bếp, nguyên liệu: theo tên.
  chefName: (q) => Prisma.sql`
    SELECT c.id, round(similarity(c.name, ${q})::numeric, 3) AS score
    FROM chefs c WHERE c.name % ${q}`,
  ingredientName: (q) => Prisma.sql`
    SELECT i.id, round(similarity(i.name, ${q})::numeric, 3) AS score
    FROM ingredients i WHERE i.name % ${q}`,
};

// Một câu SQL trả cả `total` và id + điểm của trang (cùng ảnh chụp dữ liệu, một vòng mạng), như fulltext.js.
export async function fuzzyPage(prisma, matcher, q, skip, take) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(FUZZY_THRESHOLD)}, true)`;
      const [row] = await tx.$queryRaw`
        WITH matched AS (${FUZZY_MATCHERS[matcher](q)})
        SELECT (SELECT count(*) FROM matched)::int AS total,
               coalesce((
                 SELECT json_agg(json_build_object('id', p.id, 'score', p.score) ORDER BY p.score DESC, p.id ASC)
                 FROM (SELECT id, score FROM matched ORDER BY score DESC, id ASC LIMIT ${take} OFFSET ${skip}) p
               ), '[]'::json) AS hits`;
      return { total: row.total, hits: row.hits };
    },
    // Như danh sách basic/advanced: lần đầu sau khi pool nguội có thể quá 2s mặc định (P2028).
    { maxWait: 10_000, timeout: 15_000 },
  );
}
