import { has, requiredText } from "./common.js";
import { tagIdList } from "./tag.js";

// Cùng khuôn với validateDish: POST kiểm tra đủ, PATCH chỉ kiểm tra trường được gửi.
// Trả `data` chỉ gồm cột của Chef (không đưa nguyên body vào Prisma), `tagIds` và `errors`.
// Chuyên môn là danh sách tag (thay cho chuỗi `specialty` của block6), bắt buộc ≥ 1 tag (nhóm chốt):
// POST thiếu/rỗng, hoặc PATCH gửi [] đều là VALIDATION_FAILED.
export function validateChef(body, { partial = false } = {}) {
  const data = {};
  const errors = {};
  let tagIds;

  if (!partial || has(body, "name")) {
    const r = requiredText(body.name, "Tên đầu bếp không được để trống.");
    if (r.error) errors.name = r.error;
    else data.name = r.value;
  }

  if (!partial || has(body, "tagIds")) {
    const r = tagIdList(body.tagIds);
    if (r.error) errors.tagIds = r.error;
    else tagIds = r.value;
  }

  return { data, tagIds, errors };
}
