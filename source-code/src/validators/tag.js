import { requiredText, idList } from "./common.js";

// Form thêm / sửa tag (plan 12.4): chỉ có tên, nên thêm và sửa dùng chung một kiểm tra.
export function validateTag(body) {
  const data = {};
  const errors = {};
  const r = requiredText(body.name, "Tên tag không được để trống.");
  if (r.error) errors.name = r.error;
  else data.name = r.value;
  return { data, errors };
}

// tagIds của món và đầu bếp dùng chung một quy tắc: ≥ 1 tag, mảng số nguyên, bỏ trùng.
export const tagIdList = (v) =>
  idList(v, "Vui lòng chọn ít nhất một tag.", "Danh sách tag phải là mảng mã tag (số nguyên).");

// Mọi id tag gửi lên phải có thật (request có thể gửi id bịa) → lỗi cạnh ô thay vì để khoá ngoại thành 500.
export async function allTagsExist(prisma, tagIds) {
  return (await prisma.tag.count({ where: { id: { in: tagIds } } })) === tagIds.length;
}
export const TAG_MISSING = "Có tag không tồn tại, vui lòng chọn lại.";
