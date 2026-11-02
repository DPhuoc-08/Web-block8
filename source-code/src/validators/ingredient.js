import { has, requiredText, optionalText } from "./common.js";

// Cùng khuôn với validateDish: POST kiểm tra đủ, PATCH chỉ kiểm tra trường được gửi.
// Trả `data` chỉ gồm cột của Ingredient (không đưa nguyên body vào Prisma) và `errors`.
export function validateIngredient(body, { partial = false } = {}) {
  const data = {};
  const errors = {};

  if (!partial || has(body, "name")) {
    const r = requiredText(body.name, "Tên nguyên liệu không được để trống.");
    if (r.error) errors.name = r.error;
    else data.name = r.value;
  }

  if (has(body, "unit")) {
    const r = optionalText(body.unit);
    if (r.error) errors.unit = r.error;
    else data.unit = r.value;
  }

  return { data, errors };
}
