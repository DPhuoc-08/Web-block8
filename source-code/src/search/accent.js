// Tìm tiếng Việt không dấu (plan 12.3): gõ "pho" ra "Phở". Chỉ bỏ dấu khi từ khoá KHÔNG có dấu; từ khoá có dấu giữ nguyên
// kết quả như block7, nên người đã gõ "bò" không nhận thêm "bơ". Bỏ dấu tại PostgreSQL bằng extension unaccent.
import { escapeLike } from "../validators/list-query.js";

// Tách dấu khỏi chữ (NFD) rồi tìm dấu kết hợp; "đ" không tách được nên kiểm riêng.
export const isUnaccented = (q) => !/[̀-ͯ]|[đĐ]/.test(q.normalize("NFD"));
// Cách so của toàn văn / gần đúng: "exact" như block7, "unaccented" bỏ dấu cột dữ liệu (từ khoá vốn đã không dấu).
export const textForm = (q) => (isUnaccented(q) ? "unaccented" : "exact");

// Cơ bản / nâng cao lọc bằng Prisma `contains`, không gọi được unaccent. Khi từ khoá không dấu: lấy trước id khớp bằng SQL rồi
// route đưa vào `where` (id IN …) — lọc giá / tag, sắp xếp, `total` vẫn chạy trong transaction như cũ, đếm cùng một danh sách id.
// Từ khoá có dấu hoặc không có từ khoá → null: route giữ nguyên câu Prisma của block7.
// Tagged template: chỉ mẫu LIKE là tham số bind; escapeLike giữ nghĩa "chứa đúng chuỗi đã nhập" với % _ \.
const applies = (q) => Boolean(q) && isUnaccented(q);
const pattern = (q) => `%${escapeLike(q)}%`;
const ids = (rows) => rows.map((row) => row.id);

const DISH_IDS = {
  name: (prisma, p) => prisma.$queryRaw`SELECT d.id FROM dishes d WHERE unaccent(d.name) ILIKE ${p}`,
  tag: (prisma, p) => prisma.$queryRaw`
    SELECT dt."dishId" AS id FROM dish_tags dt JOIN tags t ON t.id = dt."tagId" WHERE unaccent(t.name) ILIKE ${p}`,
  ingredient: (prisma, p) => prisma.$queryRaw`
    SELECT di."dishId" AS id FROM dish_ingredients di JOIN ingredients i ON i.id = di."ingredientId" WHERE unaccent(i.name) ILIKE ${p}`,
  chef: (prisma, p) => prisma.$queryRaw`
    SELECT d.id FROM dishes d JOIN chefs c ON c.id = d."chefId" WHERE unaccent(c.name) ILIKE ${p}`,
};

export async function unaccentedDishIds(prisma, { q, by, searchIn }) {
  if (!applies(q)) return null;
  const fields = by === "name" ? searchIn : [by]; // tên món, có thể kèm tên tag (admin); hoặc nguyên liệu; hoặc đầu bếp
  const found = new Set();
  for (const field of fields) for (const id of ids(await DISH_IDS[field](prisma, pattern(q)))) found.add(id);
  return [...found];
}

// Đầu bếp: khớp tên HOẶC tên một chuyên môn; nguyên liệu: khớp tên HOẶC đơn vị — cùng các cột với kiểu tìm có dấu của từng trang.
export async function unaccentedChefIds(prisma, q) {
  if (!applies(q)) return null;
  const p = pattern(q);
  return ids(await prisma.$queryRaw`
    SELECT c.id FROM chefs c WHERE unaccent(c.name) ILIKE ${p}
    UNION
    SELECT ct."chefId" FROM chef_tags ct JOIN tags t ON t.id = ct."tagId" WHERE unaccent(t.name) ILIKE ${p}`);
}

export async function unaccentedIngredientIds(prisma, q) {
  if (!applies(q)) return null;
  const p = pattern(q);
  return ids(await prisma.$queryRaw`SELECT i.id FROM ingredients i WHERE unaccent(i.name) ILIKE ${p} OR unaccent(i.unit) ILIKE ${p}`);
}
