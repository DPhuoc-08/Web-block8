// Kiểm tra xác thực theo bảng nghiệm thu của đề (plan block8 mục 10.1). Script TỰ chạy server thật ở cổng 3100
// (MAIL_TRANSPORT=file → thư ghi vào .mail-outbox/), nên dừng / chạy lại server được. DB là DB block7.
//   node scripts/check-auth.mjs          → chạy mọi phần
//   node scripts/check-auth.mjs D        → chỉ phần D
// A: đăng ký + mã kích hoạt + gửi lại. B: CAPTCHA ở đăng ký + giới hạn IP. C: chống brute force ở đăng nhập.
// D: session + đăng nhập + đăng xuất + chặn CRUD + CSRF. E: quên / đặt lại mật khẩu. F: hồi quy nhanh (thực đơn, CRUD sau đăng nhập).
// Bản ghi thử (tài khoản *@check.example, "[TEST B8]") được xoá ở cuối; bộ đếm giới hạn của tài khoản thử cũng xoá.
import "./lib/test-env.mjs"; // .env + key thử reCAPTCHA từ .env.test
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { client, reporter } from "./lib/client.mjs";
import { login } from "./lib/auth.mjs";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";
import { waitMail, otpIn, resetLinkIn, clearOutbox } from "./lib/outbox.mjs";
import { sha256 } from "../src/auth/secrets.js";

const only = process.argv.slice(2).map((s) => s.toUpperCase());
const run = (part) => only.length === 0 || only.includes(part);
const A = process.env.SEED_ADMIN_EMAIL;
const PW = process.env.SEED_USER_PASSWORD;
const T = "check.example"; // tên miền của tài khoản thử
const results = [];
const sidOf = (c) => decodeURIComponent(c.jar.get("sid") ?? "").slice(2).split(".")[0];
// So hai trang: bỏ phần khác nhau theo phiên / thời điểm (CSRF token, email đã gõ, số giây đếm ngược của "Gửi lại mã").
const strip = (t) => t.replace(/name="_csrf" value="[^"]+"/g, "").replace(/value="[^"]*@[^"]*"/g, "").replace(/data-cooldown="\d+"/g, "data-cooldown");

// ---------- tiện ích cho A, B ----------
let seq = 0;
const newEmail = (tag) => `${tag}-${Date.now()}-${++seq}@${T}`;
const TOKEN = [["g-recaptcha-response", "token-thu"]]; // key thử của Google: mọi token đều hợp lệ (chỉ dùng cho script)
async function register(c, email, password = "mat-khau-thu-123", extra = []) {
  await c.get("/register");
  return c.post("/register", [["email", email], ["password", password], ["passwordConfirm", password], ...TOKEN, ...extra]);
}
async function activate(c, email, otp) {
  await c.get("/activate");
  return c.post("/activate", [["email", email], ["otp", otp]]);
}
async function resend(c, email) {
  await c.get("/activate");
  return c.post("/activate/resend", [["email", email]]);
}
// Bỏ thời gian chờ 60 giây giữa hai lần gửi (dời mốc thời gian của bộ đếm thử) — thay cho việc ngồi chờ.
const skipCooldown = (email) => prisma.rateLimit.updateMany({ where: { key: `otp-cooldown:email:${email}` }, data: { windowStart: new Date(Date.now() - 120_000) } });
const challengeOf = async (email) => (await prisma.user.findUnique({ where: { email }, include: { activation: true } }))?.activation;
const code = (res) => res.text.match(/data-error-code="([A-Z_]+)"/)?.[1] ?? null;


const cleanLimits = () => prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${T}` } }, { key: { contains: ":ip:" } }] } });
await cleanLimits(); // bộ đếm theo IP của lần chạy trước (cùng máy) không làm lệch kết quả lần này
await clearOutbox();
await startServer({ MAIL_TRANSPORT: "file" });
try {
  if (run("A")) await partA();
  if (run("B")) await partB();
  if (run("C")) await partC();
  if (run("D")) await partD();
  if (run("E")) await partE();
  if (run("F")) await partF();
} finally {
  await stopServer();
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${T}` } } });
  await cleanLimits();
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
  // Như curl trần: không cookie, không _csrf (lỗi bước 18: trước đây nhận 403 của CSRF thay vì 303 /login).
  const bare = [];
  for (const [u, f] of writes) {
    const res = await client().post(u, f, { csrf: false });
    if (!(res.status === 303 && res.location === "/login")) bare.push(`${u} ${res.status}`);
  }
  r.ok(bare.length === 0 && (await counts()) === before, `${writes.length} request ghi KHÔNG cookie, KHÔNG _csrf (curl trần) → cũng 303 /login, dữ liệu không đổi`, bare.join(", "));
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
  res = await c.post("/admin/ingredients", [["name", "[TEST B8] csrf"]], { headers: { origin: "null" } });
  r.ok(res.status === 403 && (await prisma.ingredient.count()) === nIng, "Origin: null (trang lạ đặt no-referrer / iframe sandbox) ở route quản trị → 403");
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

async function partA() {
  const r = reporter("A. Đăng ký và kích hoạt");
  // Đăng ký kèm role=admin → tài khoản pending, role viewer; mã chỉ đi qua email.
  const e1 = newEmail("dk"), c1 = client(), t0 = Date.now();
  let res = await register(c1, e1, "mat-khau-thu-123", [["role", "admin"]]);
  const u1 = await prisma.user.findUnique({ where: { email: e1 }, include: { activation: true } });
  r.ok(res.status === 303 && res.location === "/activate?msg=registered" && u1?.status === "pending" && u1.role === "viewer", "Đăng ký (kèm role=admin) → 303 /activate, user pending, role viewer");
  r.ok(u1.passwordHash.startsWith("$argon2id$") && !u1.passwordHash.includes("mat-khau-thu-123") && /^[0-9a-f]{64}$/.test(u1.activation.otpHash) && u1.activation.purpose === "activation", "Mật khẩu lưu Argon2id; mã lưu HMAC (64 hex), purpose activation");
  const mail1 = await waitMail(e1, "activation", { after: t0 });
  const otp1 = otpIn(mail1);
  const page1 = await c1.get("/activate?msg=registered");
  r.ok(Boolean(otp1) && !res.text.includes(otp1) && !page1.text.includes(otp1), "Mã 6 số có trong email, KHÔNG có trong response / trang");
  const p1 = client(); await p1.get("/login");
  res = await p1.post("/login", [["email", e1], ["password", "mat-khau-thu-123"]]);
  r.ok(code(res) === "ACCOUNT_NOT_ACTIVATED" && (await prisma.session.findUnique({ where: { sid: sidOf(p1) } }))?.userId == null, "Tài khoản pending đăng nhập đúng mật khẩu → không cấp session");
  res = await p1.post("/login", [["email", e1], ["password", otp1]]);
  r.ok(code(res) === "INVALID_CREDENTIALS", "Dùng mã kích hoạt làm mật khẩu ở /login → bị từ chối");

  // Email đang pending đăng ký lại (mật khẩu khác) → không ghi đè mật khẩu; email đã active → không đổi gì.
  const c2 = client();
  res = await register(c2, e1, "mat-khau-KHAC-456");
  r.ok(res.status === 303 && (await prisma.user.findUnique({ where: { email: e1 } })).passwordHash === u1.passwordHash, "Đăng ký lại email đang pending → cùng 303, KHÔNG ghi đè mật khẩu");
  const admin = await prisma.user.findUnique({ where: { email: A } });
  const c3 = client(), t3 = Date.now();
  res = await register(c3, A, "mat-khau-KHAC-456");
  const adminAfter = await prisma.user.findUnique({ where: { email: A } });
  r.ok(res.status === 303 && res.location === "/activate?msg=registered" && adminAfter.passwordHash === admin.passwordHash && adminAfter.status === "active" && !(await waitMail(A, null, { after: t3, timeout: 800 })), "Đăng ký email đã active → cùng 303, không đổi gì, không gửi thư");
  const pages = await Promise.all([c1, c2, c3].map((c) => c.get("/activate?msg=registered")));
  r.ok(pages.every((p) => p.status === 200 && p.text.includes("data-cooldown=")) && new Set(pages.map((p) => strip(p.text))).size === 1, "Trang sau đăng ký giống hệt nhau cho email mới / pending / đã active (chỉ khác số giây đếm ngược)");

  // Dữ liệu sai → 200 VALIDATION_FAILED, không tạo user.
  const nUsers = await prisma.user.count();
  const cv = client(); await cv.get("/register");
  res = await cv.post("/register", [["email", "khong-phai-email"], ["password", "ngan"], ["passwordConfirm", "khac"], ...TOKEN]);
  r.ok(res.status === 200 && code(res) === "VALIDATION_FAILED" && res.text.includes("Email chưa đúng định dạng") && res.text.includes("ít nhất 8 ký tự") && (await prisma.user.count()) === nUsers, "Email sai, mật khẩu ngắn → 200 VALIDATION_FAILED, lỗi cạnh ô, không tạo user");
  res = await cv.post("/register", [["email", newEmail("x")], ["password", "mat-khau-thu-123"], ["passwordConfirm", "mat-khau-thu-124"], ...TOKEN]);
  r.ok(code(res) === "VALIDATION_FAILED" && res.text.includes("Hai mật khẩu chưa khớp") && (await prisma.user.count()) === nUsers, "Nhập lại mật khẩu không khớp → VALIDATION_FAILED");

  // Mã sai / thử nhiều lần / gửi lại.
  const ca = client();
  const wrong = [];
  for (const bad of ["000000", "12ab56", ""]) wrong.push(await activate(ca, e1, bad === "000000" && otp1 === "000000" ? "111111" : bad));
  let ch = await challengeOf(e1);
  r.ok(wrong.every((w) => w.status === 200 && code(w) === "INVALID_OTP") && new Set(wrong.map((w) => strip(w.text))).size === 1 && ch.attempts === 3 && !ch.usedAt, "3 lần mã sai (sai số, có chữ, trống) → cùng INVALID_OTP, attempts = 3, vẫn pending");
  await skipCooldown(e1);
  const t4 = Date.now();
  res = await resend(ca, e1);
  const otp2 = otpIn(await waitMail(e1, "activation", { after: t4 }));
  ch = await challengeOf(e1);
  r.ok(res.status === 303 && otp2 && otp2 !== otp1 && ch.attempts === 3, "Gửi lại mã → mã mới, attempts KHÔNG về 0 (vẫn 3)");
  res = await activate(ca, e1, otp1);
  r.ok(code(res) === "INVALID_OTP" && (await challengeOf(e1)).attempts === 4, "Mã cũ sau khi gửi lại → bị từ chối (attempts 4)");
  res = await activate(ca, e1, otp1 === "999999" ? "888888" : "999999");
  ch = await challengeOf(e1);
  r.ok(code(res) === "INVALID_OTP" && ch.lockedUntil > new Date(), "Lần sai thứ 5 → khoá kích hoạt 15 phút");
  res = await activate(ca, e1, otp2);
  r.ok(res.status === 429 && res.headers.get("retry-after") && (await prisma.user.findUnique({ where: { email: e1 } })).status === "pending", "Đang khoá: mã ĐÚNG cũng → 429 (Retry-After), vẫn pending");
  await prisma.activationChallenge.update({ where: { userId: u1.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
  res = await activate(ca, e1, otp2);
  const done = await prisma.user.findUnique({ where: { email: e1 }, include: { activation: true } });
  r.ok(res.status === 303 && res.location === "/login?msg=activated" && done.status === "active" && done.emailVerifiedAt && done.activation.usedAt, "Hết khoá, mã mới đúng → 303 /login, active, có emailVerifiedAt, usedAt");
  r.ok((await prisma.session.findUnique({ where: { sid: sidOf(ca) } }))?.userId == null && (await ca.get("/admin/dishes")).status === 303, "Kích hoạt xong KHÔNG tự đăng nhập (phiên không có userId, /admin → 303)");
  res = await activate(ca, e1, otp2);
  r.ok(code(res) === "INVALID_OTP" && (await challengeOf(e1)).usedAt.getTime() === done.activation.usedAt.getTime(), "Dùng lại mã đã dùng → INVALID_OTP, bản ghi không đổi");
  const li = client(); await li.get("/login");
  r.ok((await li.post("/login", [["email", e1], ["password", "mat-khau-thu-123"]])).location === "/admin/dishes", "Tài khoản vừa kích hoạt đăng nhập được (bước riêng)");

  // Hai request xác nhận cùng một mã đúng gửi CÙNG LÚC → chỉ một request kích hoạt được.
  const e2 = newEmail("songsong"), t5 = Date.now();
  await register(client(), e2);
  const otp3 = otpIn(await waitMail(e2, "activation", { after: t5 }));
  const [x, y] = [client(), client()];
  await Promise.all([x.get("/activate"), y.get("/activate")]);
  const both = await Promise.all([x, y].map((c) => c.post("/activate", [["email", e2], ["otp", otp3]])));
  const statuses = both.map((b) => (b.status === 303 ? "303" : code(b))).sort();
  r.ok(JSON.stringify(statuses) === JSON.stringify(["303", "INVALID_OTP"]), "2 request cùng mã đúng song song → một 303, một INVALID_OTP", statuses.join(" + "));

  // Mã hết hạn → cùng INVALID_OTP, vẫn pending.
  const e3 = newEmail("hethan"), t6 = Date.now();
  await register(client(), e3);
  const otp4 = otpIn(await waitMail(e3, "activation", { after: t6 }));
  const u3 = await prisma.user.findUnique({ where: { email: e3 } });
  await prisma.activationChallenge.update({ where: { userId: u3.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  res = await activate(client(), e3, otp4);
  r.ok(code(res) === "INVALID_OTP" && (await prisma.user.findUnique({ where: { email: e3 } })).status === "pending", "Mã đúng nhưng hết hạn → INVALID_OTP, vẫn pending");

  // Giới hạn gửi: gửi lại hai lần liền → lần hai 429; email không có tài khoản cũng vậy (không lộ tài khoản).
  for (const [label, email] of [["có tài khoản pending", e3], ["không có tài khoản", newEmail("khongco")]]) {
    const g = client();
    await skipCooldown(email);
    const first = await resend(g, email);
    const second = await resend(g, email);
    r.ok(first.status === 303 && second.status === 429 && code(second) === "RATE_LIMITED", `Gửi lại 2 lần trong 60 giây (${label}) → 303 rồi 429`);
  }
  // Nhập mã sai cho email không có tài khoản → cũng bị khoá sau 5 lần (giống email có tài khoản).
  const ghost = newEmail("ma"), g2 = client();
  const ghostRes = [];
  for (let i = 0; i < 6; i++) ghostRes.push((await activate(g2, ghost, "123456")).status);
  r.ok(JSON.stringify(ghostRes) === JSON.stringify([200, 200, 200, 200, 200, 429]), "Email không có tài khoản: 5 lần sai rồi 429 (như email có tài khoản)", ghostRes.join(","));

  r.ok(!serverLog().includes(otp1) && !serverLog().includes(otp2) && !serverLog().includes("mat-khau-thu-123"), "Log server không chứa mã OTP hay mật khẩu");
  results.push(r.counts);
}

async function partB() {
  const r = reporter("B. CAPTCHA (đăng ký) và giới hạn đăng ký theo IP");
  const clearRegisterIp = () => prisma.rateLimit.deleteMany({ where: { key: { startsWith: "register:ip:" } } });
  await clearRegisterIp(); // phần A đã đăng ký nhiều lần từ cùng IP
  const nUsers = await prisma.user.count();
  const c = client(), t0 = Date.now();
  await c.get("/register");
  const e = newEmail("captcha");
  let res = await c.post("/register", [["email", e], ["password", "mat-khau-thu-123"], ["passwordConfirm", "mat-khau-thu-123"]]);
  r.ok(res.status === 200 && code(res) === "CAPTCHA_REQUIRED" && (await prisma.user.count()) === nUsers && !(await waitMail(e, null, { after: t0, timeout: 800 })), "Đăng ký thiếu CAPTCHA → 200 CAPTCHA_REQUIRED, không tạo user, không gửi mã");
  res = await c.post("/register", [["email", e], ["password", "mat-khau-thu-123"], ["passwordConfirm", "mat-khau-thu-123"], ["captchaPassed", "true"]]);
  r.ok(code(res) === "CAPTCHA_REQUIRED" && (await prisma.user.count()) === nUsers, "Gửi kèm captchaPassed=true (tự khai) → vẫn bị từ chối");
  r.ok(res.text.includes('class="g-recaptcha"') && res.text.includes(`data-sitekey="${process.env.RECAPTCHA_SITE_KEY}"`) && !res.text.includes(process.env.RECAPTCHA_SECRET_KEY), "Trang có widget với site key; secret key KHÔNG xuất hiện trong trang");

  // Token bị Google từ chối (server chạy lại với secret sai) và hostname không được phép.
  for (const [label, env] of [["secret sai → Google trả token không hợp lệ", { RECAPTCHA_SECRET_KEY: "secret-sai" }], ["hostname của token không nằm trong RECAPTCHA_HOSTNAMES", { RECAPTCHA_HOSTNAMES: "localhost" }]]) {
    await stopServer();
    await startServer({ MAIL_TRANSPORT: "file", ...env });
    await clearRegisterIp();
    res = await register(client(), newEmail("captcha"));
    r.ok(res.status === 200 && code(res) === "INVALID_CAPTCHA" && (await prisma.user.count()) === nUsers, `CAPTCHA ${label} → INVALID_CAPTCHA, không tạo user`);
  }
  await stopServer();
  await startServer({ MAIL_TRANSPORT: "file" });

  // Giới hạn 10 lần đăng ký / giờ theo IP (đếm cả lần lỗi) → lần vượt nhận 429.
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "register:ip:" } } });
  const statuses = [];
  for (let i = 0; i < 11; i++) statuses.push((await register(client(), newEmail("ip"), "ngan")).status);
  r.ok(statuses.slice(0, 10).every((s) => s === 200) && statuses[10] === 429, "11 lần đăng ký từ một IP trong 1 giờ → lần thứ 11 nhận 429", statuses.join(","));
  results.push(r.counts);
}

async function partC() {
  const r = reporter("C. Chống brute force ở đăng nhập");
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "login:ip:" } } });
  const email = newEmail("bf"), pw = "mat-khau-dung-123";
  await prisma.user.create({ data: { email, emailInput: email, passwordHash: await hashPassword(pw), status: "active", emailVerifiedAt: new Date() } });
  const key = `login-fail:email:${email}`;
  const fails = async () => (await prisma.rateLimit.findUnique({ where: { key } }))?.count ?? 0;
  const c = client();
  const attempt = async (password, { token = false, who = c } = {}) => {
    await who.get("/login");
    return who.post("/login", [["email", email], ["password", password], ...(token ? TOKEN : [])]);
  };

  let res = await attempt("sai-1");
  res = await attempt("sai-2");
  r.ok(code(res) === "INVALID_CREDENTIALS" && !res.text.includes('class="g-recaptcha"') && (await fails()) === 2, "2 lần sai: thông báo chung, chưa có CAPTCHA, bộ đếm 2");
  res = await attempt("sai-3");
  r.ok(code(res) === "INVALID_CREDENTIALS" && res.text.includes('class="g-recaptcha"') && (await fails()) === 3, "Lần sai thứ 3: form sau có CAPTCHA, bộ đếm 3");
  r.ok((await c.get("/login")).text.includes('class="g-recaptcha"'), "Mở lại /login: vẫn hiện CAPTCHA (server nhớ email vừa gõ)");
  res = await attempt(pw);
  r.ok(code(res) === "CAPTCHA_REQUIRED" && (await fails()) === 3 && (await prisma.session.findUnique({ where: { sid: sidOf(c) } }))?.userId == null, "Đủ ngưỡng, bỏ trường CAPTCHA, mật khẩu ĐÚNG → chặn trước bước so mật khẩu, không đăng nhập, bộ đếm không đổi");
  res = await attempt("sai-4", { token: true });
  r.ok(code(res) === "INVALID_CREDENTIALS" && (await fails()) === 4, "Giải đúng CAPTCHA nhưng sai mật khẩu → bộ đếm tiếp tục tăng (4)");
  const fresh = client();
  res = await attempt(pw, { who: fresh });
  r.ok(code(res) === "CAPTCHA_REQUIRED" && (await fails()) === 4, "Xoá cookie / phiên ẩn danh mới → vẫn phải CAPTCHA (bộ đếm theo email ở DB)");
  for (let i = 5; i <= 9; i++) await attempt(`sai-${i}`, { token: true });
  res = await attempt("sai-10", { token: true });
  r.ok(res.status === 429 && res.headers.get("retry-after") && (await prisma.rateLimit.findUnique({ where: { key } })).lockedUntil > new Date(), "Lần sai thứ 10 → 429 Tạm khoá (Retry-After), khoá 5 phút");
  res = await attempt(pw, { token: true });
  r.ok(res.status === 429 && (await prisma.session.findUnique({ where: { sid: sidOf(c) } }))?.userId == null, "Đang khoá, gửi mật khẩu ĐÚNG + CAPTCHA đúng → vẫn 429, không có phiên");
  // Hết khoá nhưng cửa sổ 15 phút còn: vẫn phải CAPTCHA; đăng nhập đúng → xoá bộ đếm theo email.
  await prisma.rateLimit.update({ where: { key }, data: { lockedUntil: new Date(Date.now() - 1000) } });
  res = await attempt(pw);
  r.ok(code(res) === "CAPTCHA_REQUIRED", "Hết thời gian khoá, cửa sổ đếm còn hiệu lực → vẫn cần CAPTCHA");
  res = await attempt(pw, { token: true });
  r.ok(res.status === 303 && !(await prisma.rateLimit.findUnique({ where: { key } })) && (await prisma.rateLimit.count({ where: { key: { startsWith: "login:ip:" } } })) === 1, "Đăng nhập đúng (có CAPTCHA) → 303, xoá bộ đếm theo email, KHÔNG xoá giới hạn IP");

  // Email không tồn tại: cùng quy tắc (không tạo kênh dò tài khoản).
  const ghost = newEmail("khongco"), g = client();
  const ghostCodes = [];
  for (let i = 0; i < 3; i++) { await g.get("/login"); ghostCodes.push(code(await g.post("/login", [["email", ghost], ["password", "bat-ky-123"]]))); }
  await g.get("/login");
  ghostCodes.push(code(await g.post("/login", [["email", ghost], ["password", "bat-ky-123"]])));
  r.ok(JSON.stringify(ghostCodes) === JSON.stringify(["INVALID_CREDENTIALS", "INVALID_CREDENTIALS", "INVALID_CREDENTIALS", "CAPTCHA_REQUIRED"]), "Email không tồn tại: 3 lần sai rồi bị đòi CAPTCHA, như email có thật", ghostCodes.join(","));

  // Giới hạn theo IP: 30 lần gửi / 15 phút (kể cả lần thiếu dữ liệu) → lần 31 nhận 429.
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "login:ip:" } } });
  const ipc = client(); await ipc.get("/login");
  const st = [];
  for (let i = 0; i < 31; i++) st.push((await ipc.post("/login", [["email", ""], ["password", ""]])).status);
  r.ok(st.slice(0, 30).every((x) => x === 200) && st[30] === 429, "31 lần gửi form từ một IP trong 15 phút → lần 31 nhận 429");
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "login:ip:" } } });
  results.push(r.counts);
}

async function partE() {
  const r = reporter("E. Quên mật khẩu, đặt lại mật khẩu");
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "forgot:ip:" } } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "reset:ip:" } } });
  const mkUser = async (tag, status = "active") => {
    const email = newEmail(tag);
    await prisma.user.create({ data: { email, emailInput: email, passwordHash: await hashPassword("mat-khau-cu-123"), status, emailVerifiedAt: status === "active" ? new Date() : null } });
    return email;
  };
  const forgot = async (email) => {
    const c = client(); await c.get("/forgot");
    const t = Date.now(), res = await c.post("/forgot", [["email", email]]);
    return { res, ms: Date.now() - t, page: await c.get(res.location ?? "/forgot"), c };
  };
  const tokenOf = (link) => new URL(link).searchParams.get("token");

  // Email có và không có: cùng 303, cùng trang, thời gian gần nhau; chỉ email có mới nhận thư.
  const u = await mkUser("quen"), t0 = Date.now();
  const yes = await forgot(u), no = await forgot(newEmail("khongco"));
  r.ok(yes.res.status === 303 && no.res.status === 303 && yes.res.location === no.res.location && strip(yes.page.text) === strip(no.page.text), "Email có / không có → cùng 303, cùng trang “Kiểm tra email của bạn”");
  r.ok(Math.abs(yes.ms - no.ms) < 400, "Thời gian phản hồi gần nhau (việc ghi DB + gửi thư chạy sau khi trả lời)", `${yes.ms}ms / ${no.ms}ms`);
  const link1 = resetLinkIn(await waitMail(u, "reset", { after: t0 }));
  const tok1 = tokenOf(link1);
  const row1 = await prisma.passwordReset.findFirst({ where: { user: { email: u } }, orderBy: { id: "desc" } });
  r.ok(link1?.startsWith(`${process.env.APP_ORIGIN}/reset?token=`) && row1.tokenHash === sha256(tok1) && row1.tokenHash !== tok1 && Math.round((row1.expiresAt - row1.createdAt) / 60000) === 15, "Email chứa link APP_ORIGIN/reset?token=…; DB chỉ lưu SHA-256, hạn 15 phút");

  // GET /reset chỉ hiện form, không tiêu thụ token; có Referrer-Policy: no-referrer.
  const c2 = client();
  const g = await c2.get(new URL(link1).pathname + new URL(link1).search);
  r.ok(g.status === 200 && g.text.includes('name="token"') && g.headers.get("referrer-policy") === "no-referrer" && (await prisma.passwordReset.findUnique({ where: { id: row1.id } })).usedAt === null, "GET /reset với token hợp lệ: chỉ hiện form, usedAt vẫn rỗng, Referrer-Policy no-referrer");
  let res = await c2.post("/reset", [["token", tok1], ["password", "mat-khau-moi-123"], ["passwordConfirm", "khac-hoan-toan"]]);
  r.ok(code(res) === "VALIDATION_FAILED" && (await prisma.passwordReset.findUnique({ where: { id: row1.id } })).usedAt === null, "Mật khẩu mới không khớp → VALIDATION_FAILED, token chưa bị dùng");

  // Đăng nhập ở "tab 1", đặt lại ở "tab 2" → sid của tab 1 bị từ chối; không tự đăng nhập.
  const tab1 = client(); await tab1.get("/login");
  await tab1.post("/login", [["email", u], ["password", "mat-khau-cu-123"]]);
  r.ok((await tab1.get("/admin/dishes")).status === 200, "Tab 1 đã đăng nhập bằng mật khẩu cũ");
  const before = await prisma.user.findUnique({ where: { email: u } });
  const t1 = Date.now();
  // Origin: null — đúng thứ Chrome gửi từ trang có Referrer-Policy: no-referrer (lỗi bước 18).
  res = await c2.post("/reset", [["token", tok1], ["password", "mat-khau-moi-123"], ["passwordConfirm", "mat-khau-moi-123"]], { headers: { origin: "null" } });
  const after = await prisma.user.findUnique({ where: { email: u } });
  r.ok(res.status === 303 && res.location === "/login?msg=password-reset" && after.passwordHash !== before.passwordHash && (await c2.get("/admin/dishes")).status === 303, "Đặt lại thành công → 303 /login, đổi passwordHash, KHÔNG tự đăng nhập");
  r.ok((await tab1.get("/admin/dishes")).status === 303 && (await prisma.session.count({ where: { userId: after.id } })) === 0, "Sid cũ của tab 1 bị từ chối; mọi phiên của user đã bị xoá");
  r.ok(Boolean(await waitMail(u, "password-changed", { after: t1 })), "Có thư báo “Mật khẩu đã được đổi” (không chứa mật khẩu)");
  const l1 = client(); await l1.get("/login");
  const oldPw = await l1.post("/login", [["email", u], ["password", "mat-khau-cu-123"]]);
  const newPw = await l1.post("/login", [["email", u], ["password", "mat-khau-moi-123"]]);
  r.ok(code(oldPw) === "INVALID_CREDENTIALS" && newPw.status === 303, "Mật khẩu cũ bị từ chối, mật khẩu mới đăng nhập được");
  const hashNow = after.passwordHash;
  res = await client().get(`/reset?token=${tok1}`);
  const again = await c2.post("/reset", [["token", tok1], ["password", "mat-khau-thu-ba-123"], ["passwordConfirm", "mat-khau-thu-ba-123"]]);
  r.ok(code(res) === "INVALID_RESET_TOKEN" && code(again) === "INVALID_RESET_TOKEN" && (await prisma.user.findUnique({ where: { email: u } })).passwordHash === hashNow, "Dùng lại token đã dùng (GET và POST) → “Link không dùng được”, mật khẩu không đổi");

  // Token cũ sau khi có yêu cầu mới; token hết hạn; token bịa.
  const v = await mkUser("cu"), t2 = Date.now();
  await forgot(v);
  const tokA = tokenOf(resetLinkIn(await waitMail(v, "reset", { after: t2 })));
  const t3 = Date.now();
  await forgot(v);
  const tokB = tokenOf(resetLinkIn(await waitMail(v, "reset", { after: t3 })));
  const hv = (await prisma.user.findUnique({ where: { email: v } })).passwordHash;
  res = await client().post("/reset", [["token", tokA], ["password", "mat-khau-moi-123"], ["passwordConfirm", "mat-khau-moi-123"]], { csrf: false });
  const cA = client(); await cA.get(`/reset?token=${tokB}`);
  const oldTok = await cA.post("/reset", [["token", tokA], ["password", "mat-khau-moi-123"], ["passwordConfirm", "mat-khau-moi-123"]]);
  r.ok(tokA !== tokB && code(oldTok) === "INVALID_RESET_TOKEN" && (await prisma.user.findUnique({ where: { email: v } })).passwordHash === hv, "Token cũ (đã có yêu cầu mới hơn) → bị từ chối, mật khẩu không đổi");
  await prisma.passwordReset.updateMany({ where: { tokenHash: sha256(tokB) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const exG = await client().get(`/reset?token=${tokB}`);
  const exP = await cA.post("/reset", [["token", tokB], ["password", "mat-khau-moi-123"], ["passwordConfirm", "mat-khau-moi-123"]]);
  r.ok(code(exG) === "INVALID_RESET_TOKEN" && code(exP) === "INVALID_RESET_TOKEN" && (await prisma.user.findUnique({ where: { email: v } })).passwordHash === hv, "Token hết hạn → GET / POST đều “Link không dùng được”, mật khẩu không đổi");
  const fake = await client().get("/reset?token=token-bia-dat-khong-ton-tai-12345");
  r.ok(code(fake) === "INVALID_RESET_TOKEN" && strip(fake.text) === strip(exG.text), "Token bịa → cùng một trang với token hết hạn / đã dùng");

  // Hai request cùng một token gửi cùng lúc → chỉ một request đổi được mật khẩu.
  const w = await mkUser("songsong"), t4 = Date.now();
  await forgot(w);
  const tokW = tokenOf(resetLinkIn(await waitMail(w, "reset", { after: t4 })));
  const [p1, p2] = [client(), client()];
  await Promise.all([p1.get(`/reset?token=${tokW}`), p2.get(`/reset?token=${tokW}`)]);
  const both = await Promise.all([[p1, "song-song-mot-123"], [p2, "song-song-hai-123"]].map(([c, pw]) => c.post("/reset", [["token", tokW], ["password", pw], ["passwordConfirm", pw]])));
  const outcome = both.map((b) => (b.status === 303 ? "303" : code(b))).sort();
  r.ok(JSON.stringify(outcome) === JSON.stringify(["303", "INVALID_RESET_TOKEN"]), "2 request cùng token song song → một 303, một “Link không dùng được”", outcome.join(" + "));

  // Reset token không dùng được ở route khác.
  const z = await mkUser("khacroute"), t5 = Date.now();
  await forgot(z);
  const tokZ = tokenOf(resetLinkIn(await waitMail(z, "reset", { after: t5 })));
  const asOtp = await activate(client(), z, tokZ);
  const asPw = client(); await asPw.get("/login");
  const asPwRes = await asPw.post("/login", [["email", z], ["password", tokZ]]);
  const asSid = client(); asSid.jar.set("sid", tokZ);
  r.ok(code(asOtp) === "INVALID_OTP" && code(asPwRes) === "INVALID_CREDENTIALS" && (await asSid.get("/admin/dishes")).status === 303, "Reset token dùng làm mã kích hoạt / mật khẩu / cookie sid → đều bị từ chối");

  // Đặt lại mật khẩu không kích hoạt tài khoản pending.
  const pnd = await mkUser("pending", "pending"), t6 = Date.now();
  await forgot(pnd);
  const tokP = tokenOf(resetLinkIn(await waitMail(pnd, "reset", { after: t6 })));
  const cp = client(); await cp.get(`/reset?token=${tokP}`);
  res = await cp.post("/reset", [["token", tokP], ["password", "mat-khau-moi-123"], ["passwordConfirm", "mat-khau-moi-123"]]);
  r.ok(res.status === 303 && (await prisma.user.findUnique({ where: { email: pnd } })).status === "pending", "Đặt lại mật khẩu tài khoản pending → đổi được mật khẩu nhưng vẫn pending");

  // Giới hạn /forgot: 3 lần / giờ theo email (cả email không có tài khoản) → lần 4 nhận 429.
  for (const [label, email] of [["có tài khoản", await mkUser("gioihan")], ["không có tài khoản", newEmail("gioihan")]]) {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "forgot:ip:" } } }); // tách khỏi giới hạn 10 / giờ theo IP
    const st = [];
    for (let i = 0; i < 4; i++) st.push((await forgot(email)).res.status);
    r.ok(JSON.stringify(st) === JSON.stringify([303, 303, 303, 429]), `4 yêu cầu /forgot cùng email (${label}) trong 1 giờ → lần 4 nhận 429`, st.join(","));
  }
  r.ok(!serverLog().includes(tok1) && !serverLog().includes(tokW), "Log server không chứa reset token");
  results.push(r.counts);
}

async function partF() {
  const r = reporter("F. Hồi quy nhanh: thực đơn, CRUD sau khi đăng nhập");
  const guest = client();
  r.ok((await guest.get("/dishes?q=" + encodeURIComponent("phở"))).status === 200 && (await guest.get("/dishes/1")).status === 200, "Khách xem thực đơn, tìm món, chi tiết món không cần đăng nhập");
  const c = client(); await login(c, A, PW);
  await c.get("/admin/ingredients/new");
  let res = await c.post("/admin/ingredients", [["name", "[TEST B8] hồi quy"], ["unit", "kg"]]);
  const id = Number(new URL(res.location, "http://x").searchParams.get("saved"));
  r.ok(res.status === 303 && Boolean(await prisma.ingredient.findUnique({ where: { id } })), "Đã đăng nhập: thêm nguyên liệu → 303");
  await c.get(`/admin/ingredients/${id}/delete`);
  res = await c.post(`/admin/ingredients/${id}?_method=DELETE`);
  r.ok(res.status === 303 && !(await prisma.ingredient.findUnique({ where: { id } })), "Đã đăng nhập: xoá nguyên liệu → 303");
  const used = await prisma.dishIngredient.findFirst();
  await c.get(`/admin/ingredients/${used.ingredientId}/delete`);
  r.ok((await c.post(`/admin/ingredients/${used.ingredientId}?_method=DELETE`)).status === 409, "Xoá nguyên liệu đang dùng vẫn bị chặn 409");
  results.push(r.counts);
}
