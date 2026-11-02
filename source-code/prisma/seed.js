// Nạp dữ liệu mẫu cho cả 7 bảng. Chạy: `npx prisma db seed` (lệnh khai báo trong prisma.config.js).
// CẢNH BÁO: xoá TOÀN BỘ dữ liệu của database mà DATABASE_URL đang trỏ tới → in host ra trước để kiểm tra.
// Dữ liệu tất định (không random): chạy lại luôn ra đúng dữ liệu cũ, id bắt đầu lại từ 1.
import { prisma } from "../src/db.js";
import { buildSeed } from "./seed-data/generate.js";

// 16 tag, 60 đầu bếp, 250 nguyên liệu, 1.200 món (xem seed-data/generate.js và plan mục 4).
const { tags: TAGS, chefs: CHEFS, ingredients: INGREDIENTS, dishes: DISHES } = buildSeed();

async function main() {
  const db = new URL(process.env.DATABASE_URL);
  console.log(`Seed vào: ${db.hostname} (user ${db.username}) — dữ liệu cũ sẽ bị xoá.`);

  // Mọi lệnh trong một transaction: lỗi giữa chừng → không để lại database nửa cũ nửa mới.
  await prisma.$transaction(
    async (tx) => {
      // Xoá dữ liệu cũ VÀ đặt lại bộ đếm id về 1. Câu SQL cố định (không chứa dữ liệu người dùng).
      await tx.$executeRaw`TRUNCATE TABLE "dish_tags", "chef_tags", "dish_ingredients", "dishes", "chefs", "ingredients", "tags" RESTART IDENTITY`;

      // createManyAndReturn: ghi theo lô và nhận lại id → dựng bảng tra tên → id để nối các bảng liên kết.
      const tags = await tx.tag.createManyAndReturn({ data: TAGS.map((name) => ({ name })) });
      const tagId = Object.fromEntries(tags.map((t) => [t.name, t.id]));

      const chefs = await tx.chef.createManyAndReturn({ data: CHEFS.map(({ name }) => ({ name })) });
      const chefId = Object.fromEntries(chefs.map((c) => [c.name, c.id]));
      await tx.chefTag.createMany({
        data: CHEFS.flatMap((c) => c.tags.map((t) => ({ chefId: chefId[c.name], tagId: tagId[t] }))),
      });

      const ingredients = await tx.ingredient.createManyAndReturn({ data: INGREDIENTS.map(([name, unit]) => ({ name, unit })) });
      const ingredientId = Object.fromEntries(ingredients.map((i) => [i.name, i.id]));

      // createManyAndReturn trả về đúng thứ tự đã gửi → món thứ i trong DISHES có id = dishes[i].id.
      const dishes = await tx.dish.createManyAndReturn({
        data: DISHES.map((d) => ({
          name: d.name,
          description: d.description,
          price: d.price,
          available: d.available ?? true,
          imageUrl: d.imageUrl,
          imageCredit: d.imageCredit,
          chefId: chefId[d.chef],
        })),
        select: { id: true },
      });
      await tx.dishTag.createMany({
        data: DISHES.flatMap((d, i) => d.tags.map((t) => ({ dishId: dishes[i].id, tagId: tagId[t] }))),
      });
      await tx.dishIngredient.createMany({
        data: DISHES.flatMap((d, i) => d.ingredients.map((n) => ({ dishId: dishes[i].id, ingredientId: ingredientId[n] }))),
      });
    },
    // maxWait mặc định 2s không đủ để mở kết nối tới pooler ở Sydney (ap-southeast-2) → P2028.
    { maxWait: 30_000, timeout: 120_000 },
  );

  await printStats();
}

// Thống kê sau khi seed — để đối chiếu với plan (mục 4) và ghi vào BUILD_LOG.
async function printStats() {
  const [dishes, chefs, ingredients, tags, dishTags, chefTags, links, free, soldOut] = await Promise.all([
    prisma.dish.count(),
    prisma.chef.count(),
    prisma.ingredient.count(),
    prisma.tag.count(),
    prisma.dishTag.count(),
    prisma.chefTag.count(),
    prisma.dishIngredient.count(),
    prisma.dish.count({ where: { price: 0 } }),
    prisma.dish.count({ where: { available: false } }),
  ]);
  console.log(
    `Seed xong: ${dishes} món, ${chefs} đầu bếp, ${ingredients} nguyên liệu, ${tags} tag; ` +
      `${dishTags} món–tag, ${chefTags} đầu bếp–tag, ${links} món–nguyên liệu; ${free} món giá 0, ${soldOut} món tạm hết.`,
  );

  // Món có đầu bếp không cùng chuyên môn → seed sai quy tắc (đầu bếp phụ trách món luôn có tag trùng với món).
  const [{ mismatched }] = await prisma.$queryRaw`
    SELECT count(*)::int AS mismatched FROM dishes d
    WHERE NOT EXISTS (
      SELECT 1 FROM dish_tags dt JOIN chef_tags ct ON ct."tagId" = dt."tagId"
      WHERE dt."dishId" = d.id AND ct."chefId" = d."chefId"
    )`;
  console.log(`Món có đầu bếp không đúng chuyên môn: ${mismatched}`);

  const [load] = await prisma.$queryRaw`
    SELECT min(n)::int AS min, max(n)::int AS max, count(*) FILTER (WHERE n = 0)::int AS idle
    FROM (SELECT c.id, count(d.id) AS n FROM chefs c LEFT JOIN dishes d ON d."chefId" = c.id GROUP BY c.id) t`;
  const [{ unusedIngredients }] = await prisma.$queryRaw`
    SELECT count(*)::int AS "unusedIngredients" FROM ingredients i
    WHERE NOT EXISTS (SELECT 1 FROM dish_ingredients di WHERE di."ingredientId" = i.id)`;
  const perTag = await prisma.$queryRaw`
    SELECT t.name, count(dt."dishId")::int AS n FROM tags t LEFT JOIN dish_tags dt ON dt."tagId" = t.id GROUP BY t.id ORDER BY t.id`;
  console.log(`Món mỗi đầu bếp: ${load.min}–${load.max} (${load.idle} đầu bếp chưa phụ trách món nào); nguyên liệu chưa món nào dùng: ${unusedIngredients}.`);
  console.log(`Món mỗi tag: ${perTag.map((t) => `${t.name} ${t.n}`).join(", ")}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
