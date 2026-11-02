// Kiểm tra xác thực theo bảng nghiệm thu của đề (plan block8 mục 10.1). Script TỰ chạy server thật ở cổng 3100
// (MAIL_TRANSPORT=file → thư ghi vào .mail-outbox/), nên dừng / chạy lại server được. DB là DB block7.
//   node scripts/check-auth.mjs          → chạy mọi phần
//   node scripts/check-auth.mjs D        → chỉ phần D
// D: session + đăng nhập + đăng xuất + chặn CRUD + CSRF.
// Bản ghi thử (tài khoản *@check.example, "[TEST B8]") được xoá ở cuối; bộ đếm giới hạn của tài khoản thử cũng xoá.
import "dotenv/config";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { client, reporter } from "./lib/client.mjs";
import { login } from "./lib/auth.mjs";
import { startServer, stopServer } from "./lib/server.mjs";

const only = process.argv.slice(2).map((s) => s.toUpperCase());
const run = (part) => only.length === 0 || only.includes(part);
const A = process.env.SEED_ADMIN_EMAIL;
const PW = process.env.SEED_USER_PASSWORD;
const T = "check.example"; // tên miền của tài khoản thử
const results = [];
const sidOf = (c) => decodeURIComponent(c.jar.get("sid") ?? "").slice(2).split(".")[0];
const strip = (t) => t.replace(/name="_csrf" value="[^"]+"/g, "").replace(/value="[^"]*@[^"]*"/g, "");

await startServer({ MAIL_TRANSPORT: "file" });
try {
  if (run("D")) await partD();
} finally {
  await stopServer();
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${T}` } } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: `@${T}` } } });
  await prisma.ingredient.deleteMany({ where: { name: { startsWith: "[TEST B8]" } } });
}
const pass = results.reduce((s, x) => s + x.pass, 0);
const fail = results.reduce((s, x) => s + x.fail, 0);
console.log(`\nTỔNG: ${pass} ĐẠT, ${fail} CHƯA ĐẠT`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);

async function partD() {
  const r = reporter("D. Đăng nhập, đăng xuất, chặn CRUD, CSRF");
  const counts = async () => (await Promise.all([prisma.dish.count(), prisma.chef.count(), prisma.ingredient.count()])).join("/");

  // Chưa đăng nhập: MỌI route của cụm CRUD → 303 /login, dữ liệu không đổi (cả request gửi thẳng như curl).
  const anon = client();
  const guest = await anon.get("/dishes");
  r.ok(guest.status === 200 && !guest.headers.get("set-cookie"), "Khách xem thực đơn: 200, không có Set-Cookie (không tạo phiên)");
  const before = await counts();
  const gets = ["/admin", "/admin/dishes", "/admin/dishes?page=2", "/admin/dishes/new", "/admin/dishes/1/edit", "/admin/dishes/1/delete", "/admin/chefs", "/admin/chefs/new", "/admin/chefs/1/edit", "/admin/chefs/1/delete", "/admin/ingredients", "/admin/ingredients/new", "/admin/ingredients/1/edit", "/admin/ingredients/1/delete"];
  const badGets = [];
  for (const u of gets) {
    const res = await anon.get(u);
    if (!(res.status === 303 && res.location === `/login?${new URLSearchParams({ next: u })}`)) badGets.push(`${u} ${res.status}`);
  }
  r.ok(badGets.length === 0, `${gets.length} route GET của /admin khi chưa đăng nhập → 303 /login?next=<trang>`, badGets.join(", "));
  await anon.get("/login"); // _csrf hợp lệ của phiên ẩn danh → bị chặn vì chưa đăng nhập, không phải vì CSRF
  const writes = [["/admin/dishes", []], ["/admin/dishes/1?_method=PATCH", [["name", "x"]]], ["/admin/dishes/1?_method=DELETE", []], ["/admin/chefs", [["name", "x"]]], ["/admin/chefs/1?_method=PATCH", [["name", "x"]]], ["/admin/chefs/1?_method=DELETE", []], ["/admin/ingredients", [["name", "x"]]], ["/admin/ingredients/1?_method=PATCH", [["name", "x"]]], ["/admin/ingredients/1?_method=DELETE", []]];
  const badWrites = [];
  for (const [u, f] of writes) {
    const res = await anon.post(u, f);
    if (!(res.status === 303 && res.location === "/login")) badWrites.push(`${u} ${res.status}`);
  }
  r.ok(badWrites.length === 0 && (await counts()) === before, `${writes.length} request POST / PATCH / DELETE khi chưa đăng nhập → 303 /login, dữ liệu không đổi`, badWrites.join(", "));
  const forged = client();
  forged.jar.set("sid", "s%3Abia-dat.chu-ky-gia");
  r.ok((await forged.get("/admin/dishes")).status === 303, "Cookie sid bịa → 303 /login (không lỗi 500)");

  // Sai mật khẩu và email không có → cùng một thông báo, cùng status; form giữ email, không giữ mật khẩu.
  const c1 = client(); await c1.get("/login");
  const wrongPw = await c1.post("/login", [["email", A], ["password", "sai-mat-khau-123"]]);
  const c2 = client(); await c2.get("/login");
  const noUser = await c2.post("/login", [["email", `khong-co@${T}`], ["password", "sai-mat-khau-123"]]);
  r.ok(wrongPw.status === 200 && noUser.status === 200 && wrongPw.text.includes('data-error-code="INVALID_CREDENTIALS"') && strip(wrongPw.text) === strip(noUser.text), "Sai mật khẩu / email không có → cùng 200, cùng nội dung");
  r.ok(wrongPw.text.includes(`value="${A}"`) && !wrongPw.text.includes("sai-mat-khau-123"), "Form giữ email, không điền lại mật khẩu");
  r.ok((await prisma.session.findUnique({ where: { sid: sidOf(c1) } }))?.userId == null, "Sai mật khẩu → không có phiên đăng nhập");

  // Đăng nhập đúng: 303 + Set-Cookie, sid MỚI (phiên ẩn danh cũ bị xoá), bản ghi phiên có userId.
  const c = client(); await c.get("/login");
  const sidBefore = sidOf(c);
  const ok = await c.post("/login", [["email", `  ${A.toUpperCase()}`], ["password", PW]]);
  const sidAfter = sidOf(c);
  const setCookie = ok.headers.get("set-cookie") ?? "";
  r.ok(ok.status === 303 && ok.location === "/admin/dishes" && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), "Đăng nhập đúng (email viết hoa + khoảng trắng) → 303, Set-Cookie sid HttpOnly SameSite=Lax", setCookie.replace(/sid=[^;]+/, "sid=…"));
  r.ok(Boolean(sidBefore) && sidBefore !== sidAfter && !(await prisma.session.findUnique({ where: { sid: sidBefore } })), "sid trước ≠ sid sau đăng nhập; phiên cũ bị xoá (chống session fixation)");
  const admin = await prisma.user.findUnique({ where: { email: A } });
  r.ok((await prisma.session.findUnique({ where: { sid: sidAfter } }))?.userId === admin.id, "Bản ghi phiên mới có userId của tài khoản");
  const page = await c.get("/admin/dishes");
  r.ok(page.status === 200 && page.headers.get("cache-control") === "no-store" && page.text.includes(A) && page.text.includes('action="/logout"'), "Vào /admin/dishes: 200, Cache-Control no-store, header có email + Đăng xuất (form POST)");
  r.ok((await c.get("/login")).status === 303, "Đã đăng nhập mà mở /login → 303");

  // next: về đúng trang định mở; next trỏ ra ngoài bị bỏ qua.
  const n1 = client(); await n1.get("/login");
  r.ok((await n1.post("/login", [["email", A], ["password", PW], ["next", "/admin/chefs?page=2"]])).location === "/admin/chefs?page=2", "next=/admin/chefs?page=2 → về đúng trang đó");
  const badNext = [];
  for (const bad of ["//evil.example/x", "https://evil.example", "/\\evil.example"]) {
    const n = client(); await n.get("/login");
    const loc = (await n.post("/login", [["email", A], ["password", PW], ["next", bad]])).location;
    if (loc !== "/admin/dishes") badNext.push(`${bad} → ${loc}`);
  }
  r.ok(badNext.length === 0, "next trỏ ra ngoài (//host, https://, /\\host) → bỏ qua, về /admin/dishes", badNext.join(", "));

  // Tài khoản pending đúng mật khẩu → không có phiên đăng nhập, vẫn bị chặn ở /admin.
  await prisma.user.create({ data: { email: `pending@${T}`, emailInput: `pending@${T}`, passwordHash: await hashPassword("mat-khau-pending-1") } });
  const p = client(); await p.get("/login");
  const pend = await p.post("/login", [["email", `pending@${T}`], ["password", "mat-khau-pending-1"]]);
  r.ok(pend.status === 200 && pend.text.includes('data-error-code="ACCOUNT_NOT_ACTIVATED"') && (await prisma.session.findUnique({ where: { sid: sidOf(p) } }))?.userId == null, "Pending đúng mật khẩu → 200, báo chưa kích hoạt, không có phiên đăng nhập");
  r.ok((await p.get("/admin/dishes")).status === 303, "Pending vẫn bị chặn ở /admin");

  // CSRF (biện pháp nhóm công bố: SameSite=Lax + token đồng bộ + Origin).
  await c.get("/admin/ingredients/new");
  const nIng = await prisma.ingredient.count();
  let res = await c.post("/admin/ingredients", [["name", "[TEST B8] csrf"]], { csrf: false });
  r.ok(res.status === 403 && (await prisma.ingredient.count()) === nIng, "Đã đăng nhập, POST thiếu _csrf → 403, không ghi");
  res = await c.post("/admin/ingredients", [["_csrf", "sai"], ["name", "[TEST B8] csrf"]], { csrf: false });
  r.ok(res.status === 403 && (await prisma.ingredient.count()) === nIng, "_csrf sai → 403, không ghi");
  res = await c.post("/admin/ingredients", [["name", "[TEST B8] csrf"]], { headers: { origin: "https://evil.example" } });
  r.ok(res.status === 403 && (await prisma.ingredient.count()) === nIng, "Form gửi từ trang khác (Origin lạ) → 403, không ghi");
  res = await c.post("/admin/dishes/1?_method=DELETE", [], { csrf: false });
  r.ok(res.status === 403 && Boolean(await prisma.dish.findUnique({ where: { id: 1 } })), "?_method=DELETE thiếu _csrf → 403 (kiểm tra trước method-override)");

  // Khởi động lại server: cùng cookie vẫn đăng nhập (phiên nằm trong DB, không trong bộ nhớ tiến trình).
  await stopServer();
  await startServer({ MAIL_TRANSPORT: "file" });
  const afterRestart = await c.get("/admin/dishes");
  r.ok(afterRestart.status === 200 && afterRestart.text.includes(A) && Boolean(await prisma.session.findUnique({ where: { sid: sidAfter } })), "Dừng + chạy lại server, dùng lại cookie → vẫn đăng nhập, bản ghi phiên còn trong DB");

  // Đăng xuất: huỷ phiên ở server rồi xoá cookie; bản sao sid cũ bị từ chối; GET /logout không đăng xuất được.
  const copy = c.jar.get("sid");
  const out = await c.post("/logout");
  r.ok(out.status === 303 && out.location === "/login?msg=logged-out" && /sid=;/.test(out.headers.get("set-cookie") ?? ""), "Đăng xuất → 303 /login, Set-Cookie xoá sid");
  r.ok(!(await prisma.session.findUnique({ where: { sid: sidAfter } })), "Bản ghi phiên đã bị xoá ở server");
  const thief = client();
  thief.jar.set("sid", copy);
  r.ok((await thief.get("/admin/dishes")).status === 303, "Dùng lại bản sao sid cũ sau khi đăng xuất → 303 /login");
  r.ok((await client().get("/logout")).status === 404, "GET /logout → 404 (đăng xuất chỉ bằng POST)");
  results.push(r.counts);
}
