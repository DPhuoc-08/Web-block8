// mode=fulltext: tìm theo TỪ trên tên + mô tả bằng full-text search của PostgreSQL (plan mục 5.4, 3.2).
// - Cấu hình `simple` cho cả document và query: tách từ, viết thường, KHÔNG bỏ dấu, không rút gọn từ
//   (không có bộ phân tích tiếng Việt). "nước dùng xương" khớp mô tả chứa đủ ba từ, không cần liền nhau.
// - Document tính ngay trong câu truy vấn (không thêm cột tsvector — plan mục 3.2); coalesce vì description có thể NULL.
//   Tên nặng hơn mô tả (setweight A / D) → món có từ khoá trong tên xếp trước.
// - plainto_tsquery: chữ người dùng nhập là văn bản thường (không phải cú pháp & | !), các từ nối bằng AND.
// - Thứ tự: điểm giảm dần rồi id tăng dần → thứ tự xác định khi chia trang. Điểm làm tròn 3 chữ số NGAY trong SQL:
//   ts_rank là float4, 10 món "cá kho tộ" chỉ khác nhau ở sai số (đều in ra 1) — xếp theo phần lẻ đó thì người dùng
//   thấy cùng điểm 1.000 mà id lộn xộn. Cùng một giá trị vừa để sắp xếp vừa trả cho SPA (bước 17).
// Một câu SQL trả cả `total` và id + điểm của trang: cùng một ảnh chụp dữ liệu, một vòng mạng.
// Tagged template $queryRaw → q, take, skip là tham số bind, không nối vào chuỗi SQL.
export async function fulltextPage(prisma, q, skip, take) {
  const [row] = await prisma.$queryRaw`
    WITH input AS (SELECT plainto_tsquery('simple', ${q}) AS query),
    docs AS (
      SELECT d.id,
             setweight(to_tsvector('simple', coalesce(d.name, '')), 'A') ||
             setweight(to_tsvector('simple', coalesce(d.description, '')), 'D') AS document
      FROM dishes d
    ),
    matched AS (
      SELECT docs.id, round(ts_rank(docs.document, input.query)::numeric, 3) AS score
      FROM docs CROSS JOIN input
      WHERE docs.document @@ input.query
    )
    SELECT (SELECT count(*) FROM matched)::int AS total,
           coalesce((
             SELECT json_agg(json_build_object('id', p.id, 'score', p.score) ORDER BY p.score DESC, p.id ASC)
             FROM (SELECT id, score FROM matched ORDER BY score DESC, id ASC LIMIT ${take} OFFSET ${skip}) p
           ), '[]'::json) AS hits`;
  return { total: row.total, hits: row.hits };
}
