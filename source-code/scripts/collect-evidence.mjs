// Thu bằng chứng nộp (plan block8 mục 11) vào ../evidence/: ảnh giao diện, Network + cookie của Chrome thật,
// request gửi trực tiếp (như curl), bản ghi DB, thư trong hộp thư thử nghiệm — MỌI mật khẩu, mã, token, sid đều đã che.
//   node scripts/collect-evidence.mjs
// Tự chạy server thật ở cổng 3000 (MAIL_TRANSPORT=file, key thử reCAPTCHA từ .env.test) → phải tắt `npm start` trước.
// Tài khoản thử dùng tên miền demo.example và bị xoá ở cuối, cùng bộ đếm giới hạn → DB trở lại như sau seed.
// Ảnh chụp có widget reCAPTCHA của KEY THỬ (dòng chữ "for testing purposes only"): chỉ minh hoạ luồng, không phải
// bằng chứng chặn bot (bằng chứng đó làm tay với key thật — checklist BUILD_LOG bước 16).
import "./lib/test-env.mjs";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { OUTBOX } from "../src/auth/mailer.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { client } from "./lib/client.mjs";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";
import { openBrowser } from "./lib/browser.mjs";
import { mails, waitMail, otpIn, resetLinkIn, clearOutbox } from "./lib/outbox.mjs";

const OUT = new URL("../../evidence/", import.meta.url);
const PORT = "3000";
const BASE = `http://localhost:${PORT}`;
const D = "demo.example";
const ADMIN = process.env.SEED_ADMIN_EMAIL;
const PW = process.env.SEED_USER_PASSWORD;
const USER = `minh.anh@${D}`; // đi hết luồng đăng ký → kích hoạt → đăng nhập → đăng xuất → quên / đặt lại mật khẩu
const USER_PW = "Bep-nha-2026!";
const USER_PW2 = "Bep-moi-2026!";
const LOCKED = `thu.khoa@${D}`; // tài khoản bị dò mật khẩu tới khoá
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- che dữ liệu nhạy cảm ----------
// sid không in ra; thay bằng "vân tay" (8 ký tự đầu SHA-256 của sid) để vẫn so được sid trước / sau đăng nhập.
const print = (v) => createHash("sha256").update(String(v)).digest("hex").slice(0, 8);
// Cookie mang "s:<sid>.<chữ ký>": vân tay tính trên phần <sid> → trùng vân tay của bản ghi sessions (db/, auth-state.sql).
const sidPrint = (cookieValue) => { const v = decodeURIComponent(cookieValue); return print(v.match(/^s:([^.]+)\./)?.[1] ?? v); };
const SECRET_FIELDS = ["_csrf", "password", "passwordConfirm", "otp", "token", "g-recaptcha-response"];
const secrets = [PW, USER_PW, USER_PW2, process.env.SESSION_SECRET, process.env.OTP_PEPPER, process.env.RECAPTCHA_SECRET_KEY, process.env.SMTP_PASS].filter((s) => s && s.length >= 6);
function mask(text) {
  let t = String(text);
  t = t.replace(/sid=([^;\s,&"]+)/g, (_, v) => `sid=<đã che · vân tay ${sidPrint(v)}>`);
  for (const f of SECRET_FIELDS) t = t.replace(new RegExp(`(^|[?&\\s])${f}=[^&\\s]*`, "gm"), `$1${f}=<đã che>`);
  t = t.replace(/(Mã kích hoạt[^\n:]*: )\d{6}/g, "$1<đã che>"); // dòng Subject và thân thư
  for (const s of secrets) t = t.split(s).join("<đã che>");
  return t;
}
const hashHead = (h) => (h ? `${h.slice(0, 6)}…(${h.length} ký tự)` : "—");
// Giữ phần tham số ($argon2id$v=19$m=…,t=…,p=…$) để thấy thuật toán; che salt + hash.
const argonHead = (h) => h.replace(/^(\$argon2id\$v=\d+\$[^$]+\$).*$/, "$1<salt + hash đã che>");
const time = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");

// ---------- ghi file ----------
const files = new Map();
const add = (path, line = "") => files.set(path, (files.get(path) ?? "") + line + "\n");
// Chặn cuối: nếu sau khi che vẫn còn giá trị bí mật đã biết (mật khẩu, mã, token, sid, CSRF token, hash) thì không ghi gì.
const known = new Set([PW, USER_PW, USER_PW2]);
async function save() {
  for (const [path, text] of files) for (const v of known) if (v && mask(text).includes(v)) throw new Error(`Chưa che hết bí mật trong ${path} (giá trị dài ${v.length}, ở vị trí ${mask(text).indexOf(v)}: …${mask(text).slice(Math.max(0, mask(text).indexOf(v) - 60), mask(text).indexOf(v)).replace(/\s+/g, " ")}) — không ghi evidence/.`);
  for (const dir of ["screens", "network", "curl", "db", "mail"]) await mkdir(new URL(dir + "/", OUT), { recursive: true });
  for (const [path, text] of files) await writeFile(new URL(path, OUT), mask(text));
  for (const [path, buf] of shots) await writeFile(new URL(path, OUT), buf);
}
const shots = new Map();

// ---------- request trực tiếp (như curl -i, có cookie jar) ----------
const title = (html) => html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(" · Nhà hàng", "") ?? "";
const codeOf = (html) => html.match(/data-error-code="([^"]+)"/)?.[1] ?? "";
async function call(file, c, method, path, fields, opts = {}) {
  const sent = [...c.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  for (const v of c.jar.values()) known.add(decodeURIComponent(v));
  known.add(c.csrf);
  const t0 = Date.now();
  const res = method === "GET" ? await c.get(path, opts.headers) : await c.post(path, fields ?? [], opts);
  const ms = Date.now() - t0;
  const body = fields?.length ? "  " + new URLSearchParams(opts.csrf === false ? fields : [["_csrf", "x"], ...fields]).toString() : "";
  add(file, `$ ${method} ${path}${opts.note ? `   # ${opts.note}` : ""}`);
  if (opts.headers?.origin) add(file, `  Origin: ${opts.headers.origin}`);
  add(file, `  Cookie: ${sent || "(không có)"}`);
  if (body) add(file, body);
  add(file, `→ ${res.status}${res.location ? `  Location: ${res.location}` : ""}${res.headers.get("retry-after") ? `  Retry-After: ${res.headers.get("retry-after")}` : ""}  (${ms} ms)`);
  for (const sc of res.headers.getSetCookie()) add(file, `  Set-Cookie: ${sc}`);
  if (res.status !== 303 && res.status !== 302) add(file, `  Trang: "${title(res.text)}"${codeOf(res.text) ? `  data-error-code="${codeOf(res.text)}"` : ""}`);
  add(file);
  return res;
}
async function loginClient(email, password) {
  const c = client();
  await c.get("/login");
  const res = await c.post("/login", [["email", email], ["password", password]]);
  if (res.status !== 303) throw new Error(`Không đăng nhập được ${email} (${res.status})`);
  return c;
}

// ---------- Network của Chrome ----------
const REQ_H = ["origin", "content-type", "cookie", "referer"];
const RES_H = ["location", "set-cookie", "cache-control", "referrer-policy", "retry-after", "content-type"];
function network(file, heading, list) {
  add(file, `## ${heading}\n`);
  for (const r of list) {
    const u = new URL(r.url);
    add(file, `### ${r.method} ${u.pathname}${u.search} → ${r.status}\n`);
    add(file, "```");
    add(file, "Request headers");
    for (const [k, v] of Object.entries(r.reqHeaders)) if (REQ_H.includes(k.toLowerCase())) add(file, `  ${k}: ${v}`);
    if (r.postData) { known.add(new URLSearchParams(r.postData).get("_csrf")); add(file, `Form data\n  ${r.postData}`); }
    add(file, "Response headers");
    for (const [k, v] of Object.entries(r.resHeaders)) if (RES_H.includes(k.toLowerCase())) for (const line of String(v).split("\n")) add(file, `  ${k}: ${line}`);
    add(file, "```\n");
  }
}
function cookieTable(file, heading, cookies) {
  add(file, `## ${heading}\n`);
  add(file, "| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |\n| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of cookies) known.add(decodeURIComponent(c.value));
  for (const c of cookies) add(file, `| ${c.name} | sid=${c.value} | ${c.domain} | ${c.path} | ${c.session ? "Session" : time(c.expires * 1000)} | ${c.httpOnly ? "✓" : ""} | ${c.secure ? "✓" : ""} | ${c.sameSite ?? ""} |`);
  if (!cookies.length) add(file, "| (không có cookie) | | | | | | | |");
  add(file);
}

// ---------- bản ghi DB ----------
async function dbSnapshot(file, heading, emails) {
  add(file, `## ${heading}  (lúc ${time(new Date())})\n`);
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, orderBy: { id: "asc" }, include: { activation: true, passwordResets: { orderBy: { id: "asc" } }, sessions: true } });
  for (const u of users) {
    add(file, `users #${u.id}  email=${u.email}  role=${u.role}  status=${u.status}  emailVerifiedAt=${time(u.emailVerifiedAt)}`);
    known.add(u.passwordHash.split("$").at(-1));
    add(file, `  passwordHash = ${argonHead(u.passwordHash)}  (vân tay ${print(u.passwordHash)})`);
    const a = u.activation;
    if (a) known.add(a.otpHash);
    if (a) add(file, `  activation_challenges: purpose=${a.purpose} otpHash=${hashHead(a.otpHash)} hạn=${Math.round((a.expiresAt - a.lastSentAt) / 60000)} phút sau lastSentAt (${time(a.expiresAt)}) attempts=${a.attempts} usedAt=${time(a.usedAt)} lockedUntil=${time(a.lockedUntil)}`);
    for (const p of u.passwordResets) known.add(p.tokenHash);
    for (const p of u.passwordResets) add(file, `  password_resets #${p.id}: tokenHash=${hashHead(p.tokenHash)} hạn=${Math.round((p.expiresAt - p.createdAt) / 60000)} phút (${time(p.expiresAt)}) usedAt=${time(p.usedAt)}`);
    for (const x of u.sessions) known.add(x.sid);
    add(file, `  sessions của user: ${u.sessions.length}${u.sessions.map((s) => `\n    sid vân tay ${print(s.sid)}  expiresAt=${time(s.expiresAt)}  data có khoá: ${Object.keys(s.data).join(", ")}`).join("")}`);
  }
  const limits = await prisma.rateLimit.findMany({ where: { OR: emails.map((e) => ({ key: { endsWith: `:${e}` } })) }, orderBy: { key: "asc" } });
  if (limits.length) add(file, `rate_limits:${limits.map((l) => `\n  ${l.key}  count=${l.count}  windowStart=${time(l.windowStart)}  lockedUntil=${time(l.lockedUntil)}`).join("")}`);
  add(file);
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${D}` } } });
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${D}` } }, { key: { contains: ":ip:" } }, { key: { endsWith: `:${ADMIN}` } }] } });
}

// =====================================================================================================
await cleanup();
await clearOutbox();
await startServer({ PORT, MAIL_TRANSPORT: "file", APP_ORIGIN: BASE });
const b = await openBrowser();
const shot = async (name) => shots.set(`screens/${name}.png`, await b.screenshot());
const NET = "network/network-log.md";
add(NET, `# Network và Application (Cookies) — Chrome thật\n\nThu bằng \`scripts/collect-evidence.mjs\` (Chrome headless, DevTools Protocol). Chỉ ghi request trang (Document) và các header liên quan. Giá trị \`sid\` thay bằng vân tay (8 ký tự đầu SHA-256) để so trước / sau mà không lộ cookie; \`_csrf\`, mật khẩu, mã, token, \`g-recaptcha-response\` đã che.\n`);
try {
  // ---------- 1. Đăng ký có CAPTCHA → trang nhập mã ----------
  for (const w of [1280, 820, 375]) { await b.viewport(w); await b.goto(`${BASE}/register`); await b.waitFor(`document.querySelector('iframe[title="reCAPTCHA"]')`); await sleep(1200); await shot(`01-dang-ky-${w}`); }
  await b.submit("form.auth-form");
  await shot("02-dang-ky-chua-tick-captcha-375"); // CAPTCHA kiểm TRƯỚC mọi thứ khác → chỉ báo lỗi CAPTCHA
  await b.fill("form.auth-form", { email: "minh.anh@", password: "ngan", passwordConfirm: "khac" });
  await b.fillTestCaptcha();
  await b.submit("form.auth-form");
  await shot("02-dang-ky-loi-nhap-375");
  await b.viewport(1280);
  await b.goto(`${BASE}/register`);
  await b.fill("form.auth-form", { email: "  Minh.Anh@Demo.Example ", password: USER_PW, passwordConfirm: USER_PW });
  await b.fillTestCaptcha();
  await shot("03-dang-ky-da-dien-1280");
  b.takeNetwork();
  await b.submit("form.auth-form");
  network(NET, "1. Đăng ký: POST /register → 303 → trang nhập mã (email gõ hoa + khoảng trắng được chuẩn hoá)", b.takeNetwork());
  await shot("04-nhap-ma-sau-dang-ky-1280");
  await b.viewport(375);
  await shot("04-nhap-ma-sau-dang-ky-375");
  await dbSnapshot("db/1-sau-dang-ky.txt", "Sau đăng ký: user pending, role viewer, chỉ lưu Argon2id và HMAC của mã", [USER]);
  const otp = otpIn(await waitMail(USER, "activation"));
  known.add(otp);

  // ---------- 2. Mã sai, đăng nhập khi chưa kích hoạt, mã đúng ----------
  const wrong = otp === "000000" ? "111111" : "000000";
  await b.fill("form.auth-form", { otp: wrong });
  b.takeNetwork();
  await b.submit("form.auth-form");
  network(NET, "2. Nhập mã sai: POST /activate → 200 + INVALID_OTP (lỗi nhập ở form xác thực trả 200 theo đề)", b.takeNetwork());
  await shot("05-ma-sai-375");
  await b.goto(`${BASE}/login`);
  await b.fill("form.auth-form", { email: USER, password: USER_PW });
  await b.submit("form.auth-form");
  await shot("06-dang-nhap-chua-kich-hoat-375");
  cookieTable(NET, "3. Pending đúng mật khẩu: cookie sau khi gửi (phiên ẩn danh giữ CSRF token, KHÔNG có đăng nhập — xem db/2)", await b.cookies());
  await dbSnapshot("db/2-ma-sai-va-dang-nhap-pending.txt", "Sau 1 lần nhập mã sai và 1 lần đăng nhập khi pending: attempts=1, user không có phiên nào", [USER]);
  await b.goto(`${BASE}/activate`);
  await b.fill("form.auth-form", { email: USER, otp });
  b.takeNetwork();
  await b.submit("form.auth-form");
  network(NET, "4. Mã đúng: POST /activate → 303 /login?msg=activated (không tự đăng nhập)", b.takeNetwork());
  await shot("07-kich-hoat-xong-375");
  await dbSnapshot("db/3-sau-kich-hoat.txt", "Sau kích hoạt: active + emailVerifiedAt + usedAt trong một transaction; vẫn 0 phiên đăng nhập", [USER]);

  // ---------- 3. Đăng nhập: sid đổi, cookie HttpOnly / SameSite=Lax ----------
  await b.viewport(1280);
  await b.goto(`${BASE}/admin/dishes`);
  await shot("08-chua-dang-nhap-vao-quan-tri-1280");
  const before = await b.cookies();
  cookieTable(NET, "5. Trước đăng nhập (đã mở /login?next=…): cookie phiên ẩn danh", before);
  await b.fill("form.auth-form", { email: USER, password: USER_PW });
  b.takeNetwork();
  await b.submit("form.auth-form");
  network(NET, "6. Đăng nhập: POST /login → 303 + Set-Cookie sid MỚI (regenerate); request sau gửi Cookie, trang quản trị Cache-Control: no-store", b.takeNetwork());
  const after = await b.cookies();
  cookieTable(NET, "7. Sau đăng nhập: giá trị sid khác hẳn (regenerate) — so vân tay với bảng 5", after);
  add(NET, `Vân tay sid trước: ${sidPrint(before.find((c) => c.name === "sid")?.value)} · sau: ${sidPrint(after.find((c) => c.name === "sid")?.value)} → ${before[0]?.value !== after[0]?.value ? "KHÁC NHAU" : "GIỐNG NHAU (lỗi)"}\n`);
  await shot("09-quan-tri-da-dang-nhap-1280");
  await b.viewport(375);
  await shot("09-quan-tri-da-dang-nhap-375");
  await dbSnapshot("db/4-sau-dang-nhap.txt", "Sau đăng nhập: một bản ghi sessions gắn userId (dữ liệu phiên ở DB, cookie chỉ có sid ký HMAC)", [USER]);

  // ---------- 4. Đăng xuất ----------
  b.takeNetwork();
  await b.submit(".account form");
  network(NET, "8. Đăng xuất: POST /logout (form có _csrf) → xoá phiên ở DB rồi xoá cookie → 303 /login", b.takeNetwork());
  cookieTable(NET, "9. Sau đăng xuất: cookie cũ đã bị xoá; trang /login vừa mở cấp một phiên ẩn danh MỚI (vân tay khác bảng 7) chỉ để giữ CSRF token của form", await b.cookies());
  await shot("10-da-dang-xuat-375");

  // ---------- 5. Quên / đặt lại mật khẩu ----------
  await b.goto(`${BASE}/forgot`);
  await b.fill("form.auth-form", { email: USER });
  await b.submit("form.auth-form");
  await shot("11-quen-mat-khau-da-gui-375");
  const link = resetLinkIn(await waitMail(USER, "reset"));
  known.add(new URL(link).searchParams.get("token"));
  b.takeNetwork();
  await b.goto(link);
  network(NET, "10. Mở link đặt lại: GET /reset?token=… → 200 + Referrer-Policy: no-referrer, KHÔNG ghi usedAt", b.takeNetwork());
  await shot("12-dat-lai-mat-khau-375");
  await dbSnapshot("db/5-quen-mat-khau.txt", "Sau POST /forgot và GET /reset: chỉ lưu SHA-256 của token, hạn 15 phút, usedAt vẫn rỗng", [USER]);
  await b.fill("form.auth-form", { password: USER_PW2, passwordConfirm: USER_PW2 });
  b.takeNetwork();
  await b.submit("form.auth-form");
  network(NET, "11. Đặt mật khẩu mới: POST /reset → 303 /login?msg=password-reset (không tự đăng nhập)", b.takeNetwork());
  await shot("13-dat-lai-xong-375");
  await dbSnapshot("db/6-sau-dat-lai.txt", "Sau đặt lại: token usedAt có giá trị, passwordHash mới, mọi phiên của user bị xoá, status không đổi", [USER]);
  await b.goto(link);
  await shot("14-link-da-dung-375");

  // ---------- 6. Dò mật khẩu: thông báo chung → CAPTCHA → khoá 429 ----------
  await prisma.user.create({ data: { email: LOCKED, emailInput: LOCKED, passwordHash: await hashPassword(USER_PW), status: "active", emailVerifiedAt: new Date() } });
  await b.goto(`${BASE}/login`);
  await b.fill("form.auth-form", { email: LOCKED, password: "doan-sai-1" });
  await b.submit("form.auth-form");
  await shot("15-dang-nhap-sai-375");
  await b.fill("form.auth-form", { password: "doan-sai-2" });
  await b.submit("form.auth-form");
  await b.fill("form.auth-form", { password: "doan-sai-3" });
  await b.submit("form.auth-form");
  await b.waitFor(`document.querySelector('iframe[title="reCAPTCHA"]')`);
  await sleep(1200);
  await shot("16-dang-nhap-can-captcha-375");
  for (let i = 4; i <= 9; i++) {
    await b.fill("form.auth-form", { password: `doan-sai-${i}` });
    await b.fillTestCaptcha();
    await b.submit("form.auth-form");
  }
  await b.fill("form.auth-form", { password: "doan-sai-10" });
  await b.fillTestCaptcha();
  b.takeNetwork();
  await b.submit("form.auth-form");
  network(NET, "12. Lần sai thứ 10 (có CAPTCHA) → 429 + Retry-After", b.takeNetwork());
  await shot("17-tam-khoa-429-375");
  await dbSnapshot("db/7-do-mat-khau.txt", "Sau 10 lần sai: bộ đếm theo email ở bảng rate_limits, lockedUntil = +5 phút", [LOCKED]);
  b.close();

  // ---------- 7. Request trực tiếp (như curl): không qua giao diện ----------
  const K1 = "curl/1-chua-dang-nhap-goi-crud.txt";
  add(K1, "# Gọi thẳng cụm CRUD khi CHƯA đăng nhập (không cookie, rồi cookie bịa) → mọi method đều 303 /login, DB không đổi\n");
  const nDish = await prisma.dish.count(), dish1 = JSON.stringify(await prisma.dish.findUnique({ where: { id: 1 } }));
  const anon = client();
  for (const [m, p, f] of [["GET", "/admin/dishes"], ["GET", "/admin/dishes/new"], ["GET", "/admin/dishes/1/edit"], ["POST", "/admin/dishes", [["name", "Món lạ"], ["price", "1000"]]], ["POST", "/admin/dishes/1?_method=PATCH", [["name", "Đổi tên"], ["price", "1"]]], ["POST", "/admin/dishes/1?_method=DELETE", []], ["POST", "/admin/chefs", [["name", "Đầu bếp lạ"]]], ["POST", "/admin/ingredients/1?_method=DELETE", []]])
    await call(K1, anon, m, p, f, { csrf: false });
  anon.jar.set("sid", "s%3Abia-ra.chu-ky-sai");
  await call(K1, anon, "POST", "/admin/dishes/1?_method=DELETE", [], { csrf: false, note: "cookie sid bịa" });
  add(K1, `DB sau các request: dishes = ${await prisma.dish.count()} (trước ${nDish}); món #1 ${JSON.stringify(await prisma.dish.findUnique({ where: { id: 1 } })) === dish1 ? "không đổi" : "BỊ ĐỔI (lỗi)"}`);

  const K2 = "curl/2-csrf-va-dang-xuat.txt";
  add(K2, "# CSRF, đăng xuất, dùng lại sid cũ (tài khoản seed admin, đăng nhập bằng form)\n");
  let c = await loginClient(ADMIN, PW);
  await call(K2, c, "GET", "/admin/dishes");
  await call(K2, c, "POST", "/admin/ingredients", [["name", "csrf thiếu token"]], { csrf: false, note: "thiếu _csrf" });
  await call(K2, c, "POST", "/admin/ingredients", [["name", "csrf trang lạ"]], { headers: { origin: "https://trang-la.example" }, note: "token đúng nhưng Origin trang khác" });
  await call(K2, c, "GET", "/logout", null, { note: "đăng xuất không nhận GET" });
  const oldSid = c.jar.get("sid");
  await call(K2, c, "POST", "/logout", [], { note: "đăng xuất đúng cách" });
  const replay = client();
  replay.jar.set("sid", oldSid);
  await call(K2, replay, "GET", "/admin/dishes", null, { note: "gửi lại sid cũ sau đăng xuất" });
  add(K2, `Bản ghi phiên của sid cũ trong DB: ${await prisma.session.count({ where: { sid: decodeURIComponent(oldSid).slice(2).split(".")[0] } })}`);

  const K3 = "curl/3-khoi-dong-lai-server.txt";
  add(K3, "# Session ở DB: khởi động lại server, cookie cũ vẫn đăng nhập\n");
  c = await loginClient(ADMIN, PW);
  await call(K3, c, "GET", "/admin/dishes", null, { note: "trước khi khởi động lại" });
  await stopServer();
  add(K3, "(dừng server — tiến trình Node kết thúc, mọi thứ trong bộ nhớ mất)\n");
  await startServer({ PORT, MAIL_TRANSPORT: "file", APP_ORIGIN: BASE });
  add(K3, "(chạy lại server)\n");
  await call(K3, c, "GET", "/admin/dishes", null, { note: "cùng cookie, sau khi khởi động lại" });

  const K4 = "curl/4-dang-ky-cung-phan-hoi.txt";
  add(K4, "# Đăng ký: email mới, email đang pending, email đã active → cùng status, cùng Location; role trong body bị bỏ qua\n");
  const adminBefore = await prisma.user.findUnique({ where: { email: ADMIN } });
  let firstHash = null;
  for (const [email, pw, note] of [[`moi@${D}`, "mat-khau-thu-123", "email mới, kèm role=admin"], [`moi@${D}`, "mat-khau-khac-456", "cùng email lần 2 (đang pending), mật khẩu KHÁC"], [ADMIN, "mat-khau-thu-123", "email đã active"]]) {
    const r = client();
    await r.get("/register");
    await call(K4, r, "POST", "/register", [["email", email], ["password", pw], ["passwordConfirm", pw], ["role", "admin"], ["g-recaptcha-response", "token-thu"]], { note });
    firstHash ??= (await prisma.user.findUnique({ where: { email: `moi@${D}` } })).passwordHash;
  }
  const moi = await prisma.user.findUnique({ where: { email: `moi@${D}` } });
  const adminAfter = await prisma.user.findUnique({ where: { email: ADMIN } });
  known.add(firstHash.split("$").at(-1));
  add(K4, `DB: moi@${D} role=${moi.role} status=${moi.status}; passwordHash sau lần 2 ${moi.passwordHash === firstHash ? "GIỐNG lần 1 (không ghi đè)" : "ĐÃ BỊ GHI ĐÈ (lỗi)"} (vân tay ${print(firstHash)} → ${print(moi.passwordHash)}).`);
  add(K4, `DB: ${ADMIN} ${JSON.stringify(adminBefore) === JSON.stringify(adminAfter) ? "không đổi" : "BỊ ĐỔI (lỗi)"}; thư kích hoạt gửi tới ${ADMIN}: ${(await mails(ADMIN, "activation")).length}.`);

  const K5 = "curl/5-captcha.txt";
  add(K5, "# CAPTCHA kiểm ở backend: thiếu token / tự khai \"đã qua\" → từ chối, chưa băm mật khẩu, chưa tạo user\n");
  for (const [extra, note] of [[[], "không gửi g-recaptcha-response"], [[["captchaPassed", "true"], ["recaptchaScore", "1"]], "tự khai đã qua CAPTCHA"]]) {
    const r = client();
    await r.get("/register");
    await call(K5, r, "POST", "/register", [["email", `bot@${D}`], ["password", "mat-khau-thu-123"], ["passwordConfirm", "mat-khau-thu-123"], ...extra], { note });
  }
  add(K5, `DB: user bot@${D} = ${await prisma.user.count({ where: { email: `bot@${D}` } })}`);

  const K6 = "curl/6-quen-mat-khau-cung-phan-hoi.txt";
  add(K6, "# Quên mật khẩu: email có / không có tài khoản → cùng status, cùng Location, thời gian gần nhau\n");
  for (const email of [ADMIN, `khong-ton-tai@${D}`]) { const r = client(); await r.get("/forgot"); await call(K6, r, "POST", "/forgot", [["email", email]]); }

  const K7 = "curl/7-tam-khoa-dung-mat-khau.txt";
  add(K7, `# Đang bị khoá (sau phần 6 của ảnh): gửi đúng mật khẩu + CAPTCHA vẫn 429\n`);
  const r7 = client();
  await r7.get("/login");
  await call(K7, r7, "POST", "/login", [["email", LOCKED], ["password", USER_PW], ["g-recaptcha-response", "token-thu"]], { note: "mật khẩu ĐÚNG" });

  const leaked = [otp, PW, USER_PW, USER_PW2, new URL(link).searchParams.get("token")].filter((s) => serverLog().includes(s));
  add("curl/8-log-server.txt", `# Log server trong lúc thu bằng chứng (không có mật khẩu, mã, token, sid)\n\nKiểm tra: log chứa mã / mật khẩu / token? ${leaked.length ? "CÓ (lỗi)" : "không"}\n\n${serverLog()}`);

  // ---------- 8. Thư (hộp thư thử nghiệm) ----------
  for (const [i, m] of (await mails(USER)).entries()) {
    // Header đọc từ file .eml gốc (chưa giải QP): nối dòng gấp, giải "encoded-word" =?UTF-8?Q?…?= → che được mã ở Subject.
    const rawHead = (await readFile(OUTBOX + m.file, "utf8")).split(/\r?\n\r?\n/)[0];
    const head = rawHead.replace(/\r?\n[ \t]+/g, " ").replace(/\?=\s+=\?/g, "?==?")
      .replace(/=\?UTF-8\?Q\?(.*?)\?=/gi, (_, w) => Buffer.from(w.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, x) => String.fromCharCode(parseInt(x, 16))), "latin1").toString("utf8"))
      .split(/\r?\n/).filter((l) => /^(From|To|Subject|X-Mail-Kind):/.test(l)).join("\n");
    const text = m.raw.match(/Content-Type: text\/plain[^\n]*\n(?:[^\n]+\n)*\r?\n([\s\S]*?)\r?\n--/)?.[1] ?? "";
    add(`mail/${i + 1}-${m.raw.match(/X-Mail-Kind: (\S+)/)?.[1] ?? "thu"}.txt`, `${head}\n\n${text.trim()}`);
  }
} finally {
  try { b.close(); } catch {}
  await stopServer();
  await cleanup();
  await clearOutbox();
}
await save();
await prisma.$disconnect();
console.log(`Đã ghi ${files.size} file chữ + ${shots.size} ảnh vào evidence/`);
