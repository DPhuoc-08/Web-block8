// Ảnh món cho phần ảnh của các trang tài khoản (Figma vòng 2, hướng A): mỗi màn một món thật của thực đơn.
// Ảnh và dòng ghi công đọc từ chính bản ghi món (imageUrl, imageCredit) — không ghi cứng link ảnh trong template.
// Đọc một lần rồi giữ trong bộ nhớ (5 món, chỉ để trang trí); món bị xoá / hết ảnh → phần ảnh chỉ còn nền màu.
import { prisma } from "../db.js";

const DISH_FOR = { login: 1, register: 2, activate: 6, forgot: 8, reset: 3 }; // Phở, Bún chả, Cơm tấm, Cá kho tộ, Bún bò Huế
let cache = null;

async function load() {
  const dishes = await prisma.dish.findMany({ where: { id: { in: Object.values(DISH_FOR) } }, select: { id: true, name: true, imageUrl: true, imageCredit: true } });
  return new Map(dishes.map((d) => [d.id, d]));
}

export async function photoFor(page) {
  cache ??= load().catch((err) => ((cache = null), Promise.reject(err)));
  const dish = (await cache).get(DISH_FOR[page]);
  return dish?.imageUrl ? { url: dish.imageUrl, name: dish.name, credit: dish.imageCredit } : null;
}
