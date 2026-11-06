// Kiểm tra hồi quy thực đơn + quản trị SSR (plan block8 bước 6). Server phải đang chạy (npm start), DB là DB block7.
//   node scripts/check-ssr.mjs            → chạy mọi phần
//   node scripts/check-ssr.mjs A C        → chỉ chạy phần A và C
// A: thực đơn — mã trạng thái, số trang so với câu SQL viết tay (độc lập với code của app).
// B: admin món — danh sách so với SQL, thêm / sửa / xoá qua form thật, đọc lại DB.
// C: admin đầu bếp, nguyên liệu — thêm / sửa, trùng tên, xoá kèm chuyển món, xoá bị chặn 409.
// D: tìm không dấu (plan 12.3) — mọi kiểu tìm, thực đơn và quản trị; từ khoá có dấu giữ nguyên kết quả như block7.
// E: quản trị tag (plan 12.4). F: lọc danh sách món + đổi nhanh tình trạng (plan 12.4).
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
const cardIds = (html) => [...new Set([...(html.split('class="menu-cards"')[1]?.split("</section>")[0] ?? "").matchAll(/href="\/dishes\/(\d+)/g)].map((m) => Number(m[1])))];
// Số món hiển thị (qua số trang + trang cuối) phải bằng số đếm bằng SQL viết tay. Trả số món.
async function menuCount(r, c, label, qs, sql) {
  const n = await count(sql);
  const q = new URLSearchParams(qs).toString();
  const first = await c.get(`/dishes${q ? "?" + q : ""}`);
  const pages = totalPages(first.text);
  const last = pages > 1 ? await c.get(`/dishes?${q ? q + "&" : ""}page=${pages}`) : first;
  const shown = Math.max(pages - 1, 0) * 12 + cards(last.text); // không có kết quả: 0 trang, 0 món
  r.ok(first.status === 200 && shown === n && pages === Math.ceil(n / 12), `${label}: ${n} món theo SQL`, `trang hiển thị ${shown} món / ${pages} trang`);
  return n;
}

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
  for (const [label, qs, sql] of cases) await menuCount(r, c, label, qs, sql);
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

if (run("F")) {
  const r = reporter("F. Danh sách món: lọc + đổi nhanh tình trạng (plan 12.4)");
  const c = await adminClient();
  const chef = await prisma.chef.findFirst({ where: { dishes: { some: { available: false } } }, orderBy: { id: "asc" } });
  const nOff = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE NOT available`);
  const nChef = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE "chefId" = ${chef.id}`);
  const nBoth = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE NOT available AND "chefId" = ${chef.id}`);
  const nLau = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE NOT available AND (d.name ILIKE '%lẩu%' OR EXISTS (SELECT 1 FROM dish_tags dt JOIN tags t ON t.id = dt."tagId" WHERE dt."dishId" = d.id AND t.name ILIKE '%lẩu%'))`);
  const has = async (url, n, label) => {
    const res = await c.get(url);
    // Không có kết quả thì trang không có dòng "trong N món" mà báo không khớp.
    const shown = n === 0 ? res.text.includes("Không có món nào khớp") : res.text.includes(`trong ${n} món`);
    r.ok(res.status === 200 && shown, `${label}: ${n} món theo SQL`);
    return res;
  };
  await has("/admin/dishes?available=false", nOff, "Tạm hết");
  await has(`/admin/dishes?chef=${chef.id}`, nChef, `Đầu bếp #${chef.id}`);
  const both = await has(`/admin/dishes?available=false&chef=${chef.id}`, nBoth, "Tạm hết + đầu bếp");
  await has(`/admin/dishes?q=${encodeURIComponent("lẩu")}&available=false`, nLau, "Từ khoá “lẩu” + Tạm hết");
  r.ok(both.text.includes(`<option value="${chef.id}" selected>`) && both.text.includes('<option value="false" selected>'), "Ô lọc giữ giá trị đang chọn");
  // Toàn văn, gần đúng: bộ lọc nằm trong câu SQL xếp điểm nên total đúng.
  const ftOff = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE NOT d.available AND to_tsvector('simple', unaccent(coalesce(d.name,'') || ' ' || coalesce(d.description,''))) @@ plainto_tsquery('simple', 'pho')`);
  await has("/admin/dishes?q=pho&mode=fulltext&available=false", ftOff, "Toàn văn “pho” + Tạm hết");
  const fzOff = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE NOT d.available AND similarity(unaccent(d.name), 'bun bo') >= 0.3`);
  const fzAll = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE similarity(unaccent(d.name), 'bun bo') >= 0.3`);
  await has("/admin/dishes?q=bun+bo&mode=fuzzy&available=false", fzOff, "Gần đúng “bun bo” + Tạm hết");
  await has("/admin/dishes?q=bun+bo&mode=fuzzy", fzAll, "Gần đúng “bun bo”, không lọc");
  r.ok(fzAll > fzOff, "Bộ lọc thật sự thu hẹp kết quả gần đúng", `${fzAll} → ${fzOff}`);
  const injected = await c.get(`/admin/dishes?chef=${encodeURIComponent("1 OR 1=1")}`);
  r.ok(injected.status === 400 && injected.text.includes("Đầu bếp lọc không tồn tại."), "chef=1 OR 1=1 → 400, không chạm SQL");
  for (const [url, label] of [["/admin/dishes?available=abc", "available sai"], ["/admin/dishes?available=true&available=false", "available lặp"], ["/admin/dishes?chef=999999", "đầu bếp không có"], ["/admin/dishes?chef=1&chef=2", "chef lặp"]]) {
    r.ok((await c.get(url)).status === 400, `${label} → 400`);
  }
  const clean = await c.get("/admin/dishes?q=&mode=basic&available=&chef=");
  r.ok(clean.status === 302 && clean.location === "/admin/dishes", "Form GET có ô trống → 302 về URL gọn");
  // Số trang giữ bộ lọc.
  const off = await c.get("/admin/dishes?available=false");
  if (nOff > 20) r.ok(off.text.includes('href="/admin/dishes?available=false&amp;page=2'), "Link số trang giữ bộ lọc");

  // Đổi nhanh: dùng món thử để không chạm dữ liệu seed.
  const [ing] = await prisma.ingredient.findMany({ take: 1, orderBy: { id: "asc" } });
  const tag = await prisma.tag.findFirst({ orderBy: { id: "asc" } });
  const d = await prisma.dish.create({ data: { name: `${P} đổi nhanh`, price: 1000, available: true, chefId: chef.id, tags: { create: [{ tagId: tag.id }] }, ingredients: { create: [{ ingredientId: ing.id }] } } });
  const listUrl = `/admin/dishes?${new URLSearchParams({ q: P })}`; // đúng dạng URL gọn, không bị 302
  const page = await c.get(listUrl);
  r.ok(page.text.includes(`/admin/dishes/${d.id}/availability?_method=PATCH`) && page.text.includes("Đặt tạm hết"), "Danh sách có nút đổi nhanh dạng form POST");
  let res = await c.post(`/admin/dishes/${d.id}/availability?_method=PATCH`, [["available", "false"], ["back", listUrl]], { csrf: false });
  r.ok(res.status === 403 && (await prisma.dish.findUnique({ where: { id: d.id } })).available === true, "Thiếu _csrf → 403, không đổi");
  res = await c.post(`/admin/dishes/${d.id}/availability?_method=PATCH`, [["available", "abc"]]);
  r.ok(res.status === 400 && (await prisma.dish.findUnique({ where: { id: d.id } })).available === true, "Giá trị sai → 400, không đổi");
  await c.get(listUrl);
  res = await c.post(`/admin/dishes/${d.id}/availability?_method=PATCH`, [["available", "false"], ["back", listUrl]]);
  const after = await prisma.dish.findUnique({ where: { id: d.id } });
  r.ok(res.status === 303 && res.location.includes("msg=dish-availability") && res.location.includes(`saved=${d.id}`) && res.location.startsWith("/admin/dishes?q=") && after.available === false, "Đặt tạm hết → 303 về đúng danh sách, DB đổi", res.location);
  r.ok(after.name === d.name && after.price === d.price && after.chefId === d.chefId && (await prisma.dishIngredient.count({ where: { dishId: d.id } })) === 1, "Chỉ đổi tình trạng, các cột và liên kết khác giữ nguyên");
  const shown = await c.get(res.location);
  r.ok(shown.text.includes("Đã đổi tình trạng của món.") && shown.text.includes("just-saved") && shown.text.includes("Mở phục vụ"), "Trang sau khi đổi: có thông báo, tô dòng, nút thành Mở phục vụ");
  await c.get(listUrl);
  res = await c.post(`/admin/dishes/${d.id}/availability?_method=PATCH`, [["available", "false"], ["back", listUrl]]);
  r.ok(res.status === 303 && (await prisma.dish.findUnique({ where: { id: d.id } })).available === false, "Gửi lại cùng giá trị (hai tab) → vẫn Tạm hết, không bị đảo");
  res = await c.post(`/admin/dishes/${d.id}/availability?_method=PATCH`, [["available", "true"], ["back", "https://evil.example/"]]);
  r.ok(res.location?.startsWith("/admin/dishes?msg=") && (await prisma.dish.findUnique({ where: { id: d.id } })).available === true, "back trỏ ra ngoài → về /admin/dishes");
  r.ok((await c.post("/admin/dishes/999999/availability?_method=PATCH", [["available", "true"]])).status === 404, "Món không có → 404");
  r.ok((await c.get(`/dishes/${d.id}`)).text.includes("Đang phục vụ"), "Trang khách thấy tình trạng mới");
  await prisma.dish.delete({ where: { id: d.id } });
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

if (run("E")) {
  const r = reporter("E. Quản trị tag (plan 12.4)");
  const c = await adminClient();
  const list = await c.get("/admin/tags");
  const nTags = await prisma.tag.count();
  const nUsed = await count(prisma.$queryRaw`SELECT count(*) n FROM dish_tags WHERE "tagId" = (SELECT id FROM tags WHERE name = 'Món nước')`);
  r.ok(list.status === 200 && list.text.includes(`${nTags} tag`) && list.text.includes(`${nUsed} món`), `Danh sách: ${nTags} tag, “Món nước” dùng trong ${nUsed} món theo SQL`);
  r.ok(list.text.includes('href="/admin/tags" class="current"'), "Thanh quản trị có mục Tag, đang được chọn");
  for (const [url, status] of [["/admin/tags/abc/edit", 404], ["/admin/tags/999999/edit", 404], ["/admin/tags/999999/delete", 404]]) {
    r.ok((await c.get(url)).status === status, `${url} → ${status}`);
  }

  await c.get("/admin/tags/new");
  let res = await c.post("/admin/tags", [["name", "   "]]);
  r.ok(res.status === 400 && res.text.includes("Tên tag không được để trống."), "Tên trống → 400, lỗi cạnh ô");
  res = await c.post("/admin/tags", [["name", "MÓN NƯỚC"]]);
  r.ok(res.status === 400 && res.text.includes("Đã có tag tên này.") && res.text.includes('value="MÓN NƯỚC"'), "Trùng tên (khác hoa thường) → 400, giữ giá trị đã gõ");
  res = await c.post("/admin/tags", [["name", `${P} Tag <b>`]]);
  const id = savedIdOf(res.location);
  r.ok(res.status === 303 && res.location.startsWith("/admin/tags?msg=tag-created") && Boolean(await prisma.tag.findUnique({ where: { id } })), "Thêm tag → 303 + thông báo", res.location);
  const shown = await c.get(res.location);
  r.ok(shown.text.includes("[TEST B8] Tag &lt;b&gt;") && !shown.text.includes("[TEST B8] Tag <b>") && shown.text.includes("just-saved"), "Tên có thẻ HTML được escape; dòng vừa lưu được tô");

  await c.get(`/admin/tags/${id}/edit`);
  res = await c.post(`/admin/tags/${id}?_method=PATCH`, [["name", `${P} Tag sửa`]]);
  r.ok(res.status === 303 && (await prisma.tag.findUnique({ where: { id } })).name === `${P} Tag sửa`, "Sửa tên → 303, DB đổi");
  res = await c.post(`/admin/tags/${id}?_method=PATCH`, [["name", `${P} tag SỬA`]]);
  r.ok(res.status === 303, "Đổi hoa thường của chính tag đó → 303 (không tự trùng với mình)");
  res = await c.post(`/admin/tags/999999?_method=PATCH`, [["name", `${P} không có`]]);
  r.ok(res.status === 404, "Sửa tag không có → 404");

  const art = await prisma.tag.findFirst({ where: { name: "Lẩu" } });
  r.ok((await c.get(`/admin/tags/${art.id}/edit`)).text.includes("hình minh hoạ riêng") && !(await c.get(`/admin/tags/${id}/edit`)).text.includes("hình minh hoạ riêng"), "Tag loại món có cảnh báo khi đổi tên; tag thường thì không");

  // Xoá: tag đang dùng → 409, liên kết còn nguyên; GET xác nhận không xoá; tag rảnh → 303.
  const beforeLinks = await prisma.dishTag.count({ where: { tagId: art.id } });
  const blockedPage = await c.get(`/admin/tags/${art.id}/delete`);
  r.ok(blockedPage.status === 200 && !blockedPage.text.includes("?_method=DELETE"), "Tag đang dùng: trang xoá không có nút xoá");
  res = await c.post(`/admin/tags/${art.id}?_method=DELETE`);
  r.ok(res.status === 409 && Boolean(await prisma.tag.findUnique({ where: { id: art.id } })) && (await prisma.dishTag.count({ where: { tagId: art.id } })) === beforeLinks, "Gửi thẳng lệnh xoá tag đang dùng → 409, tag và liên kết còn nguyên");
  await c.get(`/admin/tags/${id}/delete`);
  r.ok(Boolean(await prisma.tag.findUnique({ where: { id } })), "GET trang xác nhận xoá không xoá");
  res = await c.post(`/admin/tags/${id}?_method=DELETE`);
  r.ok(res.status === 303 && !(await prisma.tag.findUnique({ where: { id } })), "Xoá tag không ai dùng → 303");
  r.ok((await c.post(`/admin/tags/${id}?_method=DELETE`)).status === 404, "Xoá lần hai → 404");
  results.push(r.counts);
}

if (run("D")) {
  const r = reporter("D. Tìm tiếng Việt không dấu (plan 12.3)");
  const c = client();
  const seafood = await prisma.tag.findFirst({ where: { name: "Hải sản" } });

  // Thực đơn, cơ bản: không dấu so với tên đã bỏ dấu, có dấu giữ nguyên như block7.
  const noAccent = await menuCount(r, c, "cơ bản “pho”", "q=pho", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE unaccent(name) ILIKE '%pho%'`);
  const upper = await menuCount(r, c, "cơ bản “PHO” (không phân biệt hoa thường)", "q=PHO", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE unaccent(name) ILIKE '%pho%'`);
  const accent = await menuCount(r, c, "cơ bản “phở” (có dấu: như block7)", "q=phở", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE name ILIKE '%phở%'`);
  r.ok(accent === 54 && noAccent >= accent && upper === noAccent, "“phở” vẫn 54 món như block7; “pho” có ít nhất từng ấy món", `${accent} / ${noAccent}`);
  const bo = await menuCount(r, c, "cơ bản “bo” (gồm cả bò, bơ…)", "q=bo", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE unaccent(name) ILIKE '%bo%'`);
  const beef = await menuCount(r, c, "cơ bản “bò” (có dấu: không lẫn bơ)", "q=bò", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE name ILIKE '%bò%'`);
  const butter = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE name ILIKE '%bơ%' AND name NOT ILIKE '%bò%'`);
  r.ok(butter > 0 && bo >= beef + butter, "“bo” rộng hơn “bò”: món có “bơ” chỉ ra khi gõ không dấu", `bo ${bo}, bò ${beef}, bơ ${butter}`);
  const bean = await menuCount(r, c, "cơ bản “dau” (đ → d)", "q=dau", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE unaccent(name) ILIKE '%dau%'`);
  const beanAccent = await count(prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE name ILIKE '%đậu%'`);
  r.ok(beanAccent > 0 && bean >= beanAccent, "“dau” khớp cả tên có chữ “đậu”", `dau ${bean}, đậu ${beanAccent}`);
  await menuCount(r, c, "cơ bản “ph_” (_ vẫn là ký tự thường)", "q=ph_", prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE strpos(lower(unaccent(name)), 'ph_') > 0`);
  const page1 = await prisma.$queryRaw`SELECT id FROM dishes WHERE unaccent(name) ILIKE '%pho%' ORDER BY id LIMIT 12`;
  r.ok(cardIds((await c.get("/dishes?q=pho")).text).join() === page1.map((x) => x.id).join(), "“pho” trang 1: đúng danh sách id, id tăng dần");
  const phoExact = await prisma.$queryRaw`SELECT id FROM dishes WHERE name ILIKE '%phở%' ORDER BY id LIMIT 12`;
  r.ok(cardIds((await c.get(`/dishes?q=${encodeURIComponent("phở")}`)).text).join() === phoExact.map((x) => x.id).join(), "“phở” trang 1: đúng danh sách id như câu ILIKE của block7");

  // Nâng cao: q không dấu kết hợp bộ lọc và sắp xếp.
  const adv = `mode=advanced&q=goi&tag=${seafood.id}&minPrice=50000&maxPrice=150000&available=true&sort=gia-tang`;
  await menuCount(r, c, "nâng cao “goi” + Hải sản + 50–150 nghìn + còn bán", adv,
    prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE unaccent(d.name) ILIKE '%goi%' AND price BETWEEN 50000 AND 150000 AND available AND EXISTS (SELECT 1 FROM dish_tags t WHERE t."dishId" = d.id AND t."tagId" = ${seafood.id})`);
  const advIds = await prisma.$queryRaw`SELECT d.id FROM dishes d WHERE unaccent(d.name) ILIKE '%goi%' AND price BETWEEN 50000 AND 150000 AND available AND EXISTS (SELECT 1 FROM dish_tags t WHERE t."dishId" = d.id AND t."tagId" = ${seafood.id}) ORDER BY price, d.id LIMIT 12`;
  r.ok(cardIds((await c.get(`/dishes?${adv}`)).text).join() === advIds.map((x) => x.id).join(), "Nâng cao “goi”: sắp xếp giá tăng dần rồi id, đúng danh sách");

  // Tìm theo nguyên liệu, đầu bếp.
  await menuCount(r, c, "theo nguyên liệu “tom”", "by=ingredient&q=tom",
    prisma.$queryRaw`SELECT count(DISTINCT di."dishId") n FROM dish_ingredients di JOIN ingredients i ON i.id = di."ingredientId" WHERE unaccent(i.name) ILIKE '%tom%'`);
  await menuCount(r, c, "theo đầu bếp “tran thi”", "by=chef&q=tran thi",
    prisma.$queryRaw`SELECT count(*) n FROM dishes d JOIN chefs c ON c.id = d."chefId" WHERE unaccent(c.name) ILIKE '%tran thi%'`);

  // Toàn văn: document bỏ dấu khi từ khoá không dấu; có dấu như block7.
  const ft = (q) => prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE to_tsvector('simple', unaccent(coalesce(name,'') || ' ' || coalesce(description,''))) @@ plainto_tsquery('simple', ${q})`;
  await menuCount(r, c, "toàn văn “pho”", "mode=fulltext&q=pho", ft("pho"));
  await menuCount(r, c, "toàn văn “nuoc dung xuong”", "mode=fulltext&q=nuoc dung xuong", ft("nuoc dung xuong"));
  await menuCount(r, c, "toàn văn “phở” (có dấu: như block7)", "mode=fulltext&q=phở",
    prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')) @@ plainto_tsquery('simple', 'phở')`);
  const hue = await prisma.dish.findFirst({ where: { name: "Bún bò Huế" }, select: { id: true } });
  r.ok(cardIds((await c.get("/dishes?mode=fulltext&q=bun+bo+hue")).text)[0] === hue.id, "Toàn văn “bun bo hue”: món đầu là Bún bò Huế");

  // Gần đúng: gõ không dấu và sai chữ vẫn ra.
  const fz = (q) => prisma.$queryRaw`SELECT count(*) n FROM dishes WHERE similarity(unaccent(name), ${q}) >= 0.3`;
  await menuCount(r, c, "gần đúng “bo luc lat”", "mode=fuzzy&q=bo luc lat", fz("bo luc lat"));
  const lac = await prisma.dish.findFirst({ where: { name: "Bò lúc lắc" }, select: { id: true } });
  r.ok(cardIds((await c.get("/dishes?mode=fuzzy&q=bo+luc+lat")).text)[0] === lac.id, "Gần đúng “bo luc lat”: món đầu là Bò lúc lắc");
  await menuCount(r, c, "gần đúng theo nguyên liệu “tom xu”", "mode=fuzzy&by=ingredient&q=tom xu",
    prisma.$queryRaw`SELECT count(DISTINCT di."dishId") n FROM dish_ingredients di JOIN ingredients i ON i.id = di."ingredientId" WHERE similarity(unaccent(i.name), 'tom xu') >= 0.3`);
  await menuCount(r, c, "gần đúng theo đầu bếp “tran thi bit”", "mode=fuzzy&by=chef&q=tran thi bit",
    prisma.$queryRaw`SELECT count(*) n FROM dishes d JOIN chefs c ON c.id = d."chefId" WHERE similarity(unaccent(c.name), 'tran thi bit') >= 0.3`);

  // Quản trị: trang hiện "trong N …".
  const a = await adminClient();
  const adminCount = async (label, url, noun, sql) => {
    const n = await count(sql);
    const res = await a.get(url);
    r.ok(res.status === 200 && res.text.includes(`trong ${n} ${noun}`), `Quản trị ${label}: ${n} ${noun} theo SQL`);
  };
  await adminCount("món “lau” (tên hoặc tag)", "/admin/dishes?q=lau", "món",
    prisma.$queryRaw`SELECT count(*) n FROM dishes d WHERE unaccent(d.name) ILIKE '%lau%' OR EXISTS (SELECT 1 FROM dish_tags dt JOIN tags t ON t.id = dt."tagId" WHERE dt."dishId" = d.id AND unaccent(t.name) ILIKE '%lau%')`);
  await adminCount("món toàn văn “pho”", "/admin/dishes?q=pho&mode=fulltext", "món", ft("pho"));
  await adminCount("món gần đúng “bo luc lat”", "/admin/dishes?q=bo+luc+lat&mode=fuzzy", "món", fz("bo luc lat"));
  await adminCount("đầu bếp “tran thi”", "/admin/chefs?q=tran+thi", "đầu bếp", prisma.$queryRaw`SELECT count(*) n FROM chefs WHERE unaccent(name) ILIKE '%tran thi%'`);
  await adminCount("đầu bếp “lau” (chuyên môn)", "/admin/chefs?q=lau", "đầu bếp",
    prisma.$queryRaw`SELECT count(*) n FROM chefs c WHERE unaccent(c.name) ILIKE '%lau%' OR EXISTS (SELECT 1 FROM chef_tags ct JOIN tags t ON t.id = ct."tagId" WHERE ct."chefId" = c.id AND unaccent(t.name) ILIKE '%lau%')`);
  await adminCount("đầu bếp gần đúng “tran thi bit”", "/admin/chefs?q=tran+thi+bit&mode=fuzzy", "đầu bếp", prisma.$queryRaw`SELECT count(*) n FROM chefs WHERE similarity(unaccent(name), 'tran thi bit') >= 0.3`);
  await adminCount("nguyên liệu “tom”", "/admin/ingredients?q=tom", "nguyên liệu", prisma.$queryRaw`SELECT count(*) n FROM ingredients WHERE unaccent(name) ILIKE '%tom%' OR unaccent(unit) ILIKE '%tom%'`);
  await adminCount("nguyên liệu gần đúng “tom xu”", "/admin/ingredients?q=tom+xu&mode=fuzzy", "nguyên liệu", prisma.$queryRaw`SELECT count(*) n FROM ingredients WHERE similarity(unaccent(name), 'tom xu') >= 0.3`);
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
