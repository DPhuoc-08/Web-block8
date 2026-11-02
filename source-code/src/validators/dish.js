import { MAX_INT, has, isBlank, isIdNumber, requiredText, optionalText, idList } from "./common.js";
import { tagIdList, allTagsExist, TAG_MISSING } from "./tag.js";

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Kiểm tra body JSON của món. Không truy cập DB (việc kiểm tra id có thật nằm ở checkDishRefs).
// - partial = false (POST): mọi trường bắt buộc phải có.
// - partial = true (PATCH): chỉ kiểm tra các trường được gửi; trường không gửi giữ nguyên trong DB.
// Trả về:
// - data:          chỉ các cột được phép, đã chuẩn hoá → đưa vào Prisma. Không bao giờ đưa nguyên body
//                  (body có thể chứa trường lạ như id, createdAt).
// - ingredientIds: mảng id nguyên liệu đã bỏ trùng (undefined nếu PATCH không gửi).
// - tagIds:        mảng id tag đã bỏ trùng (undefined nếu PATCH không gửi). Thay cho `category` của block6:
//                  một món có nhiều tag (loại món, đặc điểm, vùng miền).
// - errors:        { tênTrường: thông báo }, khoá trùng tên ô nhập trên form của SPA.
export function validateDish(body, { partial = false } = {}) {
  const data = {};
  const errors = {};
  let ingredientIds;
  let tagIds;
  const check = (key) => !partial || has(body, key);

  if (check("name")) {
    const r = requiredText(body.name, "Tên món không được để trống.");
    if (r.error) errors.name = r.error;
    else data.name = r.value;
  }

  if (check("price")) {
    const p = body.price;
    if (isBlank(p)) errors.price = "Giá không được để trống.";
    // Number.isInteger loại cả chuỗi "50000", số lẻ 1.5, NaN.
    else if (!Number.isInteger(p) || p < 0 || p > MAX_INT) {
      errors.price = "Giá phải là số nguyên không âm (đơn vị đồng), ví dụ 50000.";
    } else data.price = p;
  }

  if (check("tagIds")) {
    const r = tagIdList(body.tagIds);
    if (r.error) errors.tagIds = r.error;
    else tagIds = r.value;
  }

  if (has(body, "description")) {
    const r = optionalText(body.description);
    if (r.error) errors.description = r.error;
    else data.description = r.value;
  }

  // Ảnh minh hoạ (mở rộng giữ từ block5), không bắt buộc. Link được đặt vào <img src> ở SPA →
  // chỉ nhận http(s): chặn `javascript:`, `data:`...
  if (has(body, "imageUrl")) {
    const r = optionalText(body.imageUrl);
    if (r.error) errors.imageUrl = r.error;
    else if (r.value !== null && (!isHttpUrl(r.value) || r.value.length > 1000)) {
      errors.imageUrl = "Link ảnh phải bắt đầu bằng http:// hoặc https:// (tối đa 1000 ký tự).";
    } else data.imageUrl = r.value;
  }

  if (has(body, "imageCredit")) {
    const r = optionalText(body.imageCredit);
    if (r.error) errors.imageCredit = r.error;
    else if (r.value !== null && r.value.length > 200) errors.imageCredit = "Ghi công ảnh tối đa 200 ký tự.";
    else data.imageCredit = r.value;
  }

  if (has(body, "available")) {
    if (typeof body.available !== "boolean") errors.available = "Tình trạng phải là true hoặc false.";
    else data.available = body.available;
  } else if (!partial) {
    data.available = true;
  }

  if (check("chefId")) {
    if (isBlank(body.chefId)) errors.chefId = "Vui lòng chọn đầu bếp phụ trách.";
    else if (!isIdNumber(body.chefId)) errors.chefId = "Mã đầu bếp không hợp lệ.";
    else data.chefId = body.chefId;
  }

  if (check("ingredientIds")) {
    const r = idList(
      body.ingredientIds,
      "Vui lòng chọn ít nhất một nguyên liệu.",
      "Danh sách nguyên liệu phải là mảng mã nguyên liệu (số nguyên).",
    );
    if (r.error) errors.ingredientIds = r.error;
    else ingredientIds = r.value;
  }

  return { data, ingredientIds, tagIds, errors };
}

// Id đầu bếp / nguyên liệu / tag gửi lên phải có thật trong DB (request có thể gửi id bịa).
// Thêm lỗi vào `errors` thay vì để Prisma báo lỗi khoá ngoại thành 500.
export async function checkDishRefs(prisma, { data, ingredientIds, tagIds, errors }) {
  if (tagIds !== undefined && !(await allTagsExist(prisma, tagIds))) errors.tagIds = TAG_MISSING;
  if (data.chefId !== undefined) {
    const chef = await prisma.chef.findUnique({ where: { id: data.chefId }, select: { id: true } });
    if (!chef) errors.chefId = "Đầu bếp đã chọn không tồn tại, vui lòng chọn lại.";
  }
  if (ingredientIds !== undefined) {
    const found = await prisma.ingredient.count({ where: { id: { in: ingredientIds } } });
    if (found !== ingredientIds.length) errors.ingredientIds = "Có nguyên liệu không tồn tại, vui lòng chọn lại.";
  }
}
