// Cột id kiểu Int của PostgreSQL, giá trị lớn nhất 2^31 - 1.
const MAX_INT = 2147483647;

// `req.params.id` luôn là chuỗi. Chỉ nhận số nguyên dương viết bằng chữ số ("2"),
// loại "abc", "2.5", "02", "-1"... để route trả 404 ngay mà không cần truy vấn DB.
// Trả về số nếu hợp lệ, `null` nếu không.
export function parseId(raw) {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_INT ? id : null;
}
