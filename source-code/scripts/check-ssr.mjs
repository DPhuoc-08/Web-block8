// Kiểm tra hồi quy thực đơn + quản trị SSR (plan block8 bước 6). Server phải đang chạy (npm start), DB là DB block7.
//   node scripts/check-ssr.mjs            → chạy cả A, B, C
//   node scripts/check-ssr.mjs A C        → chỉ chạy phần A và C
// A: thực đơn — mã trạng thái, số trang so với câu SQL viết tay (độc lập với code của app).
// B: admin món — danh sách so với SQL, thêm / sửa / xoá qua form thật, đọc lại DB.
// C: admin đầu bếp, nguyên liệu — thêm / sửa, trùng tên, xoá kèm chuyển món, xoá bị chặn 409.
// Mọi bản ghi thử có tiền tố "[TEST B8]" và được xoá ở cuối; DB trở lại 1.200 món / 60 đầu bếp / 250 nguyên liệu / 16 tag.
import { prisma } from "../src/db.js";
import { client, reporter, savedIdOf } from "./lib/client.mjs";
import { adminClient } from "./lib/auth.mjs";

const P = "[TEST B8]";
const only = process.argv.slice(2).map((s) => s.toUpperCase());
const run = (part) => only.length === 0 || only.includes(part);
const results = [];
const count = async (sql) => Number((await sql)[0].n);
const totalPages = (html) => Number(html.match(/Trang \d+\/(\d+)/)?.[1] ?? (html.includes('class="menu-cards"') ? 1 : 0));
const cards = (html) => (html.split('class="menu-cards"')[1]?.split("</section>")[0] ?? "").match(/class="dish-card/g)?.length ?? 0;

if (run("A")) {
  const r = reporter("A. Thực đơn /dishes");
  const c = client();
  for (const [url, status] of [["/dishes", 200], ["/dishes?page=999", 200], ["/dishes?page=0", 400], ["/dishes?mode=fuzzy", 400], ["/dishes?q=a&q=b", 400],
    ["/dishes?mode=advanced&tag=999999", 400], ["/dishes?mode=advanced&minPrice=abc", 400], ["/dishes?mode=xyz", 400], ["/dishes/1", 200], ["/dishes/abc", 404], ["/dishes/999999", 404]]) {
    r.ok((await c.get(url)).status === status, `${url} → ${status}`);
  }
  const redirect = await c.get("/dishes?q=&by=name&mode=basic&tag=&minPrice=&maxPrice=&available=");
  r.ok(redirect.status === 302 && redirect.location === "/dishes", "Form GET có ô trống → 302 về URL gọn /dishes");

  // Số món của mỗi bộ điều kiện = đếm bằng SQL viết tay; trang cuối có đúng phần dư.
  const tag = await prisma.tag.findFirst({ where: { name: "Món nước" } });
  const cases = [
    ["(mặc định)", "", prisma.$queryRaw`SELECT count(*) n FROM dishes`],
    ["q=bún", "q=bún", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE name ILIKE '%bún%'`],
    ["q=100% (ký tự % là chữ thường)", "q=100%25", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE strpos(lower(name), '100%') > 0`],
    ["q=_ (ký tự _ là chữ thường)", "q=_", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE strpos(name, '_') > 0`],
    ["nâng cao: Món nước, 0–60.000đ, còn bán", `mode=advanced&tag=${tag.id}&minPrice=0&maxPrice=60000&available=true`,
      prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE price BETWEEN 0 AND 60000 AND available AND EXISTS (SELECT 1 FROM dish_tags t WHERE t."dishId" = d.id AND t."tagId" = ${tag.id})`],
    ["nâng cao: tạm hết", "mode=advanced&available=false", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE NOT available`],
    ["nâng cao: giá 0", "mode=advanced&minPrice=0&maxPrice=0", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE price = 0`],
    ["theo nguyên liệu “tôm”", "by=ingredient&q=tôm",
      prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE EXISTS (SELECT 1 FROM dish_ingredients di JOIN ingredients i ON i.id = di."ingredientId" WHERE di."dishId" = d.id AND i.name ILIKE '%tôm%')`],
    ["theo đầu bếp “Mai”", "by=chef&q=Mai", prisma.$queryRaw`SELECT count(*) n FROM dishes d JOIN chefs c ON c.id = d."chefId" WHERE c.name ILIKE '%mai%'`],
    ["toàn văn “nước dùng xương”", "mode=fulltext&q=nước dùng xương",
      prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')) @@ plainto_tsquery('simple', 'nước dùng xương')`],
    ["gần đúng “bò lúc lắt”", "mode=fuzzy&q=bò lúc lắt", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE similarity(name, 'bò lúc lắt') > 0.3`],
  ];
  for (const [label, qs, sql] of cases) {
    const n = await count(sql);
    const q = new URLSearchParams(qs).toString();
    const first = await c.get(`/dishes${q ? "?" + q : ""}`);
    const pages = totalPages(first.text);
    const last = pages > 1 ? await c.get(`/dishes?${q ? q + "&" : ""}page=${pages}`) : first;
    const shown = (pages - 1) * 12 + cards(last.text);
    r.ok(first.status === 200 && shown === n && pages === Math.ceil(n / 12), `${label}: ${n} món theo SQL`, `trang hiển thị ${shown} món / ${pages} trang`);
  }
  results.push(r.counts);
}

if (run("B")) {
  const r = reporter("B. Quản trị món /admin/dishes");
  const c = await adminClient();
  const list = await c.get("/admin/dishes?q=lẩu".replace("lẩu", encodeURIComponent("lẩu")));
  const n = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE d.name ILIKE '%lẩu%' OR EXISTS (SELECT 1 FROM dish_tags dt JOIN tags t ON t.id = dt."tagId" WHERE dt."dishId" = d.id AND t.name ILIKE '%lẩu%')`);
  r.ok(list.text.includes(`trong ${n} món`), `Tìm “lẩu” (tên hoặc tag) = ${n} món theo SQL`);
  for (const [url, status] of [["/admin/dishes?page=61", 200], ["/admin/dishes?mode=fuzzy", 400], ["/admin/dishes?mode=advanced", 400], ["/admin/dishes/abc/edit", 404], ["/admin/dishes/999999/delete", 404]]) {
    r.ok((await c.get(url)).status === status, `${url} → ${status}`);
  }
  const tag = await prisma.tag.findFirst({ where: { name: "Món nước" } });
  const chef = await prisma.chef.findFirst({ orderBy: { id: "asc" } });
  const [i1, i2] = await prisma.ingredient.findMany({ take: 2, orderBy: { id: "asc" } });
  const before = await prisma.dish.count();
  await c.get("/admin/dishes/new");
  let res = await c.post("/admin/dishes", [["name", ""], ["price", "1.5"], ["imageUrl", "javascript:alert(1)"]]);
  r.ok(res.status === 400 && res.text.includes("Tên món không được để trống.") && res.text.includes("Giá phải là số nguyên") && res.text.includes("Link ảnh phải bắt đầu") && (await prisma.dish.count()) === before, "Form sai → 400, lỗi cạnh ô, không ghi");
  res = await c.post("/admin/dishes", [["name", `${P} Phở`], ["price", "45000"], ["tagIds", String(tag.id)], ["chefId", String(chef.id)], ["ingredientIds", String(i1.id)], ["ingredientIds", String(i2.id)], ["available", "on"], ["role", "admin"]]);
  const id = savedIdOf(res.location);
  const d = await prisma.dish.findUnique({ where: { id }, include: { ingredients: true } });
  r.ok(res.status === 303 && res.location.startsWith("/admin/dishes?msg=dish-created") && d?.price === 45000 && d.ingredients.length === 2, "Thêm món → 303 trang 1 + thông báo", res.location);
  res = await c.post("/admin/dishes", [["name", `${P} Món mới`], ["price", "1"], ["newTags", `${P} Tag A, ${P} tag a`], ["chefId", "new"], ["newChef", `${P} Bếp`], ["newIngredients", `${P} Lá é`]]);
  const d2 = await prisma.dish.findUnique({ where: { id: savedIdOf(res.location) }, include: { tags: true, chef: { include: { tags: true } } } });
  r.ok(res.status === 303 && d2?.tags.length === 1 && d2.chef.name === `${P} Bếp` && d2.chef.tags.length === 1, "Thêm nhanh tag / nguyên liệu / đầu bếp khi lưu (bỏ trùng hoa thường)");
  res = await c.post("/admin/dishes", [["name", `${P} trùng`], ["price", "1"], ["newTags", "món nước"], ["chefId", String(chef.id)], ["ingredientIds", String(i1.id)]]);
  r.ok(res.status === 400 && res.text.includes("Đã có tag: món nước"), "Tag mới trùng tag đã có → 400");
  await c.get(`/admin/dishes/${id}/edit`);
  res = await c.post(`/admin/dishes/${id}?_method=PATCH`, [["back", "/admin/dishes?page=3"], ["name", `${P} Phở sửa`], ["price", "0"], ["tagIds", String(tag.id)], ["chefId", String(chef.id)], ["ingredientIds", String(i2.id)]]);
  const u = await prisma.dish.findUnique({ where: { id } });
  r.ok(res.status === 303 && res.location === `/admin/dishes?page=3&msg=dish-updated&saved=${id}` && u.price === 0 && !u.available, "Sửa → 303 về đúng trang, giá 0, bỏ tick còn phục vụ", res.location);
  res = await c.post(`/admin/dishes/${id}?_method=PATCH`, [["back", "https://evil.example/"], ["name", `${P} Phở sửa`], ["price", "1"], ["tagIds", String(tag.id)], ["chefId", String(chef.id)], ["ingredientIds", String(i2.id)]]);
  r.ok(res.location?.startsWith("/admin/dishes?msg="), "back trỏ ra ngoài → về /admin/dishes");
  await c.get(`/admin/dishes/${id}/delete`);
  r.ok(Boolean(await prisma.dish.findUnique({ where: { id } })), "GET trang xác nhận xoá không xoá");
  res = await c.post(`/admin/dishes/${id}?_method=DELETE`, [["back", "/admin/dishes?page=2"]]);
  r.ok(res.status === 303 && res.location === "/admin/dishes?page=2&msg=dish-deleted" && !(await prisma.dish.findUnique({ where: { id } })), "Xoá → 303 về trang 2");
  r.ok((await c.post(`/admin/dishes/${id}?_method=DELETE`)).status === 404, "Xoá lần hai → 404");
  results.push(r.counts);
}

if (run("C")) {
  const r = reporter("C. Quản trị đầu bếp, nguyên liệu");
  const c = await adminClient();
  const tag = await prisma.tag.findFirst({ where: { name: "Lẩu" } });
  const first = await prisma.chef.findFirst({ orderBy: { id: "asc" } });
  const nChefs = await count(prisma.$queryRaw`SELECT count(*) n FROM chefs c WHERE c.name ILIKE '%lẩu%' OR EXISTS (SELECT 1 FROM chef_tags ct JOIN tags t ON t.id = ct."tagId" WHERE ct."chefId" = c.id AND t.name ILIKE '%lẩu%')`);
  r.ok((await c.get(`/admin/chefs?q=${encodeURIComponent("lẩu")}`)).text.includes(`trong ${nChefs} đầu bếp`), `Tìm đầu bếp “lẩu” (tên hoặc chuyên môn) = ${nChefs} theo SQL`);
  const nIng = await count(prisma.$queryRaw`SELECT count(*) n FROM ingredients WHERE name ILIKE '%kg%' OR unit ILIKE '%kg%'`);
  r.ok((await c.get("/admin/ingredients?q=kg")).text.includes(`trong ${nIng} nguyên liệu`), `Tìm nguyên liệu “kg” (tên hoặc đơn vị) = ${nIng} theo SQL`);

  await c.get("/admin/chefs/new");
  let res = await c.post("/admin/chefs", [["name", first.name.toUpperCase()], ["tagIds", String(tag.id)]]);
  r.ok(res.status === 400 && res.text.includes("Đã có đầu bếp tên này."), "Đầu bếp trùng tên (khác hoa thường) → 400");
  res = await c.post("/admin/chefs", [["name", `${P} Bếp A`], ["tagIds", String(tag.id)], ["newTags", `${P} Lẩu nấm`]]);
  const a = savedIdOf(res.location);
  r.ok(res.status === 303 && (await prisma.chefTag.count({ where: { chefId: a } })) === 2, "Thêm đầu bếp + tag mới → 2 chuyên môn");
  res = await c.post("/admin/chefs", [["name", `${P} Bếp B`], ["tagIds", String(tag.id)]]);
  const b = savedIdOf(res.location);
  const borrowed = await prisma.dish.findMany({ take: 2, orderBy: { id: "asc" }, select: { id: true, chefId: true } });
  await prisma.dish.updateMany({ where: { id: { in: borrowed.map((x) => x.id) } }, data: { chefId: a } });
  await c.get(`/admin/chefs/${a}/delete`);
  res = await c.post(`/admin/chefs/${a}?_method=DELETE`);
  r.ok(res.status === 409 && Boolean(await prisma.chef.findUnique({ where: { id: a } })), "Xoá đầu bếp còn món, chưa chọn người nhận → 409");
  res = await c.post(`/admin/chefs/${a}?_method=DELETE`, [["transferTo", String(b)]]);
  r.ok(res.status === 303 && (await prisma.dish.count({ where: { chefId: b } })) === 2 && !(await prisma.chef.findUnique({ where: { id: a } })), "Chuyển 2 món sang người nhận + xoá (một transaction) → 303");
  for (const x of borrowed) await prisma.dish.update({ where: { id: x.id }, data: { chefId: x.chefId } });

  await c.get("/admin/ingredients/new");
  res = await c.post("/admin/ingredients", [["name", "TÔM SÚ"], ["unit", ""]]);
  r.ok(res.status === 400 && res.text.includes("Đã có nguyên liệu tên này."), "Nguyên liệu trùng tên → 400");
  res = await c.post("/admin/ingredients", [["name", `${P} Lá lốt C`], ["unit", ""]]);
  const ing = savedIdOf(res.location);
  r.ok(res.status === 303 && (await prisma.ingredient.findUnique({ where: { id: ing } }))?.unit === null, "Thêm nguyên liệu, đơn vị trống lưu null");
  const used = await prisma.dishIngredient.findFirst();
  await c.get(`/admin/ingredients/${used.ingredientId}/delete`);
  res = await c.post(`/admin/ingredients/${used.ingredientId}?_method=DELETE`);
  r.ok(res.status === 409 && Boolean(await prisma.ingredient.findUnique({ where: { id: used.ingredientId } })), "Xoá nguyên liệu đang dùng → 409");
  res = await c.post(`/admin/ingredients/${ing}?_method=DELETE`);
  r.ok(res.status === 303, "Xoá nguyên liệu chưa dùng → 303");
  results.push(r.counts);
}

// Dọn dữ liệu thử (DB dùng chung với block7).
await prisma.dish.deleteMany({ where: { name: { startsWith: P } } });
await prisma.chef.deleteMany({ where: { name: { startsWith: P } } });
await prisma.ingredient.deleteMany({ where: { name: { startsWith: P } } });
await prisma.tag.deleteMany({ where: { name: { startsWith: P } } });
const after = await Promise.all([prisma.dish.count(), prisma.chef.count(), prisma.ingredient.count(), prisma.tag.count()]);
console.log(`\nSau khi dọn: ${after[0]} món / ${after[1]} đầu bếp / ${after[2]} nguyên liệu / ${after[3]} tag`);
const pass = results.reduce((s, x) => s + x.pass, 0);
const fail = results.reduce((s, x) => s + x.fail, 0);
console.log(`TỔNG: ${pass} ĐẠT, ${fail} CHƯA ĐẠT`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
