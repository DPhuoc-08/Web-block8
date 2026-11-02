// Cột Int của PostgreSQL: giá trị lớn nhất 2^31 - 1.
export const MAX_INT = 2147483647;

// Body JSON GIỮ KIỂU (khác form HTML của block5, nơi mọi giá trị là chuỗi):
// giá phải là number, id phải là number, available phải là boolean. Sai kiểu → VALIDATION_FAILED.

// Trường có được gửi lên không (PATCH chỉ kiểm tra các trường được gửi).
export const has = (body, key) => Object.hasOwn(body, key) && body[key] !== undefined;

// Bỏ trống: không gửi, null, hoặc chuỗi toàn khoảng trắng.
export const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

// Id trong body (chefId, ingredientIds, transferTo): số nguyên dương trong giới hạn cột Int.
export const isIdNumber = (v) => Number.isInteger(v) && v > 0 && v <= MAX_INT;

// Danh sách id trong body (ingredientIds, tagIds): mảng số nguyên dương, ít nhất 1 phần tử.
// Id trùng (request bị sửa tay) được gộp lại → không vi phạm khoá chính của bảng liên kết.
// Trả { value } hoặc { error }. Việc id có thật trong DB kiểm tra riêng (cần truy vấn).
export function idList(v, emptyMessage, typeMessage) {
  if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) return { error: emptyMessage };
  if (!Array.isArray(v) || !v.every(isIdNumber)) return { error: typeMessage };
  return { value: [...new Set(v)] };
}

// Trường chữ bắt buộc (name): trả { value } hoặc { error }.
export function requiredText(v, emptyMessage) {
  if (isBlank(v)) return { error: emptyMessage };
  if (typeof v !== "string") return { error: "Giá trị phải là chuỗi ký tự." };
  return { value: v.trim() };
}

// Trường chữ không bắt buộc (description, specialty, unit): chuỗi rỗng / null → lưu null, không lưu "".
export function optionalText(v) {
  if (v === null) return { value: null };
  if (typeof v !== "string") return { error: "Giá trị phải là chuỗi ký tự." };
  return { value: v.trim() || null };
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;

// Query string (?q=...): chỉ nhận khi là chuỗi. `?q=a&q=b` cho ra mảng → coi như không có (tránh lỗi 500 ở Prisma).
export const queryStr = (v) => (typeof v === "string" ? v.trim() : "");
