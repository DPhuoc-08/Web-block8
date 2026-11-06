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
import { createServer } from "node:http";
import dotenv from "dotenv";
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
// Email thật của nhóm trong .env (tài khoản seed, người gửi thư): đề yêu cầu che email trong bằng chứng; thay thành chữ cố định.
const realEmails = [process.env.SEED_ADMIN_EMAIL, process.env.SEED_VIEWER_EMAIL, process.env.SMTP_USER, process.env.MAIL_FROM?.match(/[^\s<>"]+@[^\s<>"]+/)?.[0]]
  .filter(Boolean).sort((a, b) => b.length - a.length);
function mask(text) {
  let t = String(text);
  for (const e of realEmails) t = t.split(e).join("<email nhóm đã che>").split(encodeURIComponent(e)).join("<email nhóm đã che>");
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
  // Google không trả lời trong 5 giây → server từ chối (503, chưa so mật khẩu, không tạo user, không tăng bộ đếm). Đúng hợp đồng,
  // nhưng làm lệch số lần thử của kịch bản → giữ dòng 503 trong bằng chứng rồi gửi lại.
  const retried = opts.retried ?? 0;
  if (res.status === 503 && codeOf(res.text) === "CAPTCHA_UNAVAILABLE" && retried < 3) {
    return call(file, c, method, path, fields, { ...opts, retried: retried + 1, note: `gửi lại vì Google không trả lời (503 ở trên)${opts.note ? `; ${opts.note}` : ""}` });
  }
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

// ---------- các case của bảng nghiệm thu chưa có bằng chứng riêng ----------
const failed = [];
function check(file, cond, text) {
  add(file, `${cond ? "ĐẠT" : "CHƯA ĐẠT"}: ${text}\n`);
  if (!cond) failed.push(`${file}: ${text}`);
  return cond;
}
const clearIp = () => prisma.rateLimit.deleteMany({ where: { key: { contains: ":ip:" } } });
const CAPTCHA_OK = [["g-recaptcha-response", "token-thu"]]; // key thử của Google: chỉ để đi qua bước CAPTCHA khi kiểm luồng khác
const DEMO_PW = "mat-khau-thu-123";
const NEW_PW = "mat-khau-moi-456";
known.add(DEMO_PW).add(NEW_PW);
// So hai trang: bỏ phần khác nhau theo phiên (CSRF token, email đã gõ, số giây đếm ngược).
const strip = (t) => t.replace(/name="_csrf" value="[^"]+"/g, "").replace(/value="[^"]*@[^"]*"/g, "").replace(/data-cooldown="\d+"/g, "data-cooldown");
const same = (...rs) => new Set(rs.map((r) => strip(r.text))).size === 1;
const sidOf = (c) => decodeURIComponent(c.jar.get("sid") ?? "").slice(2).split(".")[0];
const userOf = (email) => prisma.user.findUnique({ where: { email }, include: { activation: true } });
const skipCooldown = (email) => prisma.rateLimit.updateMany({ where: { key: `otp-cooldown:email:${email}` }, data: { windowStart: new Date(Date.now() - 120_000) } });
const activeUser = async (email, password = DEMO_PW) => prisma.user.create({ data: { email, emailInput: email, passwordHash: await hashPassword(password), status: "active", emailVerifiedAt: new Date() } });

// Đăng ký qua request thật, trả về mã trong thư. file = null: bước chuẩn bị, không ghi vào bằng chứng.
async function register(file, email, note) {
  const c = client();
  await c.get("/register");
  const t = Date.now();
  const fields = [["username", "Người thử"], ["email", email], ["password", DEMO_PW], ["passwordConfirm", DEMO_PW], ...CAPTCHA_OK];
  if (file) await call(file, c, "POST", "/register", fields, { note });
  else for (let i = 0; i < 3 && (await c.post("/register", fields)).status === 503; i++); // Google không trả lời → gửi lại
  const otp = otpIn(await waitMail(email, "activation", { after: t }));
  known.add(otp);
  return otp;
}
async function activate(file, c, email, otp, note) {
  await c.get("/activate");
  return call(file, c, "POST", "/activate", [["email", email], ["otp", otp]], { note });
}
async function resend(file, c, email, note) {
  await c.get("/activate");
  return call(file, c, "POST", "/activate/resend", [["email", email]], { note });
}
async function otpCases() {
  const F = "curl/11-ma-kich-hoat.txt";
  add(F, "# OTP sai / hết hạn / đã dùng cùng một thông báo; gửi lại không đặt lại số lần thử; khoá 429; hai request đồng thời; kích hoạt xong không có phiên; OTP không dùng được làm mật khẩu\n# Dời expiresAt, thời gian chờ 60 giây và lockedUntil bằng UPDATE trực tiếp trên tài khoản thử để không phải chờ thật.\n");
  await clearIp();
  const eA = `sai.het.han@${D}`, eB = `da.dung@${D}`;
  const otpA = await register(F, eA, "tài khoản cho ca mã sai + hết hạn");
  const wrong = otpA === "000000" ? "111111" : "000000";
  const rWrong = await activate(F, client(), eA, wrong, "mã SAI");
  const uA = await userOf(eA);
  await prisma.activationChallenge.update({ where: { userId: uA.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  add(F, "(UPDATE activation_challenges SET expiresAt = quá khứ)\n");
  const rExpired = await activate(F, client(), eA, otpA, "mã ĐÚNG nhưng đã HẾT HẠN");
  const otpB = await register(F, eB, "tài khoản cho ca mã đã dùng");
  await activate(F, client(), eB, otpB, "dùng mã lần đầu");
  const verifiedAt = (await userOf(eB)).emailVerifiedAt;
  const rUsed = await activate(F, client(), eB, otpB, "dùng lại mã đã dùng");
  check(F, [rWrong, rExpired, rUsed].every((r) => r.status === 200 && codeOf(r.text) === "INVALID_OTP") && same(rWrong, rExpired, rUsed), "Mã sai, hết hạn, đã dùng → cùng status, cùng trang, cùng INVALID_OTP");
  check(F, (await userOf(eA)).status === "pending", `${eA} vẫn pending`);
  check(F, (await userOf(eB)).emailVerifiedAt.getTime() === verifiedAt.getTime(), `${eB}: emailVerifiedAt không đổi khi dùng lại mã`);

  add(F, "## Gửi lại mã: mã cũ bị từ chối, attempts không về 0, mã đúng vẫn bị 429 khi đang khoá\n");
  const eC = `gui.lai@${D}`;
  const otpC1 = await register(F, eC, "tài khoản cho ca gửi lại");
  const cC = client();
  for (let i = 1; i <= 3; i++) await activate(F, cC, eC, otpC1 === "000000" ? "111111" : "000000", `sai lần ${i}`);
  const before = (await userOf(eC)).activation.attempts;
  await skipCooldown(eC);
  add(F, "(dời thời gian chờ gửi lại 60 giây)\n");
  const t = Date.now();
  await resend(F, cC, eC, "gửi lại mã");
  const otpC2 = otpIn(await waitMail(eC, "activation", { after: t }));
  known.add(otpC2);
  const uC = await userOf(eC);
  check(F, otpC2 && otpC2 !== otpC1 && before === 3 && uC.activation.attempts === 3, `Gửi lại xong có mã mới, attempts vẫn ${uC.activation.attempts} (trước khi gửi lại: ${before})`);
  await dbSnapshot("db/8-khoa-kich-hoat.txt", "Sau 3 lần sai rồi gửi lại mã: otpHash mới, attempts vẫn 3 (gửi lại không đặt lại số lần thử)", [eC]);
  const rOld = await activate(F, cC, eC, otpC1, "mã CŨ sau khi gửi lại");
  check(F, codeOf(rOld.text) === "INVALID_OTP" && (await userOf(eC)).activation.attempts === 4, "Mã cũ bị từ chối, attempts = 4");
  await activate(F, cC, eC, otpC2 === "000000" ? "111111" : "000000", "sai lần 5 → khoá");
  const rLocked = await activate(F, cC, eC, otpC2, "mã MỚI ĐÚNG khi đang khoá");
  const uLocked = await userOf(eC);
  check(F, rLocked.status === 429 && rLocked.headers.get("retry-after") && uLocked.status === "pending" && uLocked.activation.lockedUntil > new Date(), "Đang khoá: mã đúng vẫn 429 + Retry-After, lockedUntil có giá trị, vẫn pending");
  await dbSnapshot("db/8-khoa-kich-hoat.txt", "Thêm 2 lần sai, đủ 5: lockedUntil = +15 phút, vẫn pending. attempts về 0 lúc đặt khoá là theo chính sách (plan mục 4: lượt thử mới sau khi hết khoá), không phải do gửi lại", [eC]);
  await prisma.activationChallenge.update({ where: { userId: uC.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
  add(F, "(UPDATE lockedUntil = quá khứ, thay cho chờ 15 phút)\n");
  const rNew = await activate(F, cC, eC, otpC2, "hết khoá, mã mới dùng được");
  check(F, rNew.status === 303 && (await userOf(eC)).status === "active", "Hết khoá, mã mới đúng → 303, active");

  add(F, "## Kích hoạt xong không có phiên; OTP không dùng được làm mật khẩu\n");
  const rAdmin = await call(F, cC, "GET", "/admin/dishes", null, { note: "cùng cookie của lần kích hoạt" });
  check(F, rAdmin.status === 303 && rAdmin.location.startsWith("/login") && (await prisma.session.findUnique({ where: { sid: sidOf(cC) } }))?.userId == null, "Kích hoạt xong: /admin → 303 /login, bản ghi phiên không có userId");
  const cL = client();
  await cL.get("/login");
  const rOtpPw = await call(F, cL, "POST", "/login", [["email", eC], ["password", otpC2]], { note: "dùng mã kích hoạt làm mật khẩu" });
  check(F, codeOf(rOtpPw.text) === "INVALID_CREDENTIALS", "Dùng mã kích hoạt làm mật khẩu → INVALID_CREDENTIALS");

  add(F, "## Giới hạn gửi lại; hai request cùng mã đúng gửi đồng thời\n");
  const eD = `gui.nhanh@${D}`;
  await register(null, eD);
  await skipCooldown(eD);
  const cD = client();
  const r1 = await resend(F, cD, eD, "gửi lại lần 1");
  const r2 = await resend(F, cD, eD, "gửi lại ngay lần 2");
  check(F, r1.status === 303 && r2.status === 429 && r2.headers.get("retry-after"), "Gửi lại 2 lần trong 60 giây → 303 rồi 429 + Retry-After");
  const eE = `song.song@${D}`;
  const otpE = await register(null, eE);
  const [x, y] = [client(), client()];
  await Promise.all([x.get("/activate"), y.get("/activate")]);
  const both = await Promise.all([x, y].map((c, i) => call(F, c, "POST", "/activate", [["email", eE], ["otp", otpE]], { note: `request đồng thời ${i + 1}` })));
  check(F, both.filter((r) => r.status === 303).length === 1 && both.filter((r) => codeOf(r.text) === "INVALID_OTP").length === 1, "Hai request đồng thời cùng mã đúng → đúng một 303, một INVALID_OTP");
}

async function loginLimitCases() {
  const F = "curl/12-dem-sai-dang-nhap.txt";
  add(F, "# Sai đến ngưỡng → đòi CAPTCHA trước khi so mật khẩu; CAPTCHA đúng mật khẩu sai → vẫn đếm; xoá cookie không né được; đủ 10 lần → 429 dù mật khẩu đúng; email không có cùng quy tắc\n# CAPTCHA ở đây dùng key thử (chỉ để đi qua bước CAPTCHA). Bằng chứng key thật: curl/15, curl/16.\n");
  await clearIp();
  const email = `dem.sai@${D}`, ghost = `khong.ton.tai@${D}`;
  await activeUser(email);
  const counter = async (e) => (await prisma.rateLimit.findUnique({ where: { key: `login-fail:email:${e}` } }))?.count ?? 0;
  const c = client();
  await c.get("/login");
  const attempt = async (who, e, pw, note, extra = []) => call(F, who, "POST", "/login", [["email", e], ["password", pw], ...extra], { note });
  let res, first;
  for (let i = 1; i <= 3; i++) { res = await attempt(c, email, `doan-sai-${i}`, `sai lần ${i}`); first ??= res; }
  check(F, (await counter(email)) === 3 && res.text.includes('class="g-recaptcha"'), "Sau 3 lần sai: bộ đếm = 3, form có CAPTCHA");
  res = await attempt(c, email, DEMO_PW, "mật khẩu ĐÚNG, bỏ trường CAPTCHA");
  check(F, codeOf(res.text) === "CAPTCHA_REQUIRED" && (await counter(email)) === 3 && (await prisma.session.findUnique({ where: { sid: sidOf(c) } }))?.userId == null, "Bỏ CAPTCHA → CAPTCHA_REQUIRED trước bước so mật khẩu: bộ đếm vẫn 3, không có phiên");
  res = await attempt(c, email, "doan-sai-4", "CAPTCHA đúng, mật khẩu sai", CAPTCHA_OK);
  check(F, codeOf(res.text) === "INVALID_CREDENTIALS" && (await counter(email)) === 4, "CAPTCHA đúng + mật khẩu sai → bộ đếm tăng lên 4");
  const fresh = client();
  await fresh.get("/login");
  res = await attempt(fresh, email, DEMO_PW, "xoá cookie (cookie jar mới), mật khẩu ĐÚNG, không CAPTCHA");
  check(F, codeOf(res.text) === "CAPTCHA_REQUIRED" && (await counter(email)) === 4, "Xoá cookie: vẫn CAPTCHA_REQUIRED, bộ đếm vẫn 4 (đếm ở DB theo email)");
  for (let i = 5; i <= 10; i++) res = await attempt(c, email, `doan-sai-${i}`, `sai lần ${i}`, CAPTCHA_OK);
  check(F, res.status === 429 && res.headers.get("retry-after"), "Lần sai thứ 10 → 429 + Retry-After");
  res = await attempt(c, email, DEMO_PW, "đang khoá: mật khẩu ĐÚNG + CAPTCHA đúng", CAPTCHA_OK);
  check(F, res.status === 429 && (await prisma.session.findUnique({ where: { sid: sidOf(c) } }))?.userId == null, "Đang khoá, mật khẩu và CAPTCHA đều đúng → 429, không có phiên");
  const fresh2 = client();
  await fresh2.get("/login");
  res = await attempt(fresh2, email, DEMO_PW, "đang khoá, cookie jar mới", CAPTCHA_OK);
  check(F, res.status === 429, "Xoá cookie khi đang khoá → vẫn 429");

  add(F, "## Email không có tài khoản: cùng thông báo, cùng ngưỡng CAPTCHA\n");
  await clearIp();
  const g = client();
  await g.get("/login");
  let rGhost, firstGhost;
  for (let i = 1; i <= 3; i++) { rGhost = await attempt(g, ghost, `doan-sai-${i}`, `email không có, sai lần ${i}`); firstGhost ??= rGhost; }
  check(F, first.status === firstGhost.status && same(first, firstGhost), "Sai mật khẩu (email có) và email không có → cùng status, cùng trang");
  check(F, (await counter(ghost)) === 3 && rGhost.text.includes('class="g-recaptcha"'), "Email không có: 3 lần sai cũng đếm và đòi CAPTCHA");
  await dbSnapshot("db/9-dem-sai-dang-nhap.txt", "Bộ đếm theo email ở rate_limits, kể cả email không có tài khoản; không có phiên nào", [email, ghost]);
}

async function resetCases() {
  const F = "curl/13-quen-mat-khau.txt";
  add(F, "# /forgot vượt giới hạn; token cũ / hết hạn / đã dùng bị từ chối; sid cũ bị từ chối sau reset; reset token dùng ở route khác; reset tài khoản pending\n");
  await clearIp();
  const hashOf = async (e) => (await userOf(e)).passwordHash;
  const forgot = async (e, note) => { const c = client(); await c.get("/forgot"); return call(F, c, "POST", "/forgot", [["email", e]], { note }); };
  const askToken = async (e, note) => {
    const t = Date.now();
    await forgot(e, note);
    const link = resetLinkIn(await waitMail(e, "reset", { after: t }));
    const token = new URL(link).searchParams.get("token");
    known.add(token);
    return token;
  };
  const post = async (c, token, note) => call(F, c, "POST", "/reset", [["token", token], ["password", NEW_PW], ["passwordConfirm", NEW_PW]], { note });
  const formClient = async () => { const c = client(); await c.get("/forgot"); return c; };

  add(F, "## Vượt giới hạn /forgot: 3 yêu cầu / giờ theo email, email có và không có giống nhau\n");
  const eL = `quen.nhieu@${D}`, eN = `quen.khong.co@${D}`;
  await activeUser(eL);
  const seq = async (e) => { const out = []; for (let i = 1; i <= 4; i++) out.push((await forgot(e, `yêu cầu ${i}`)).status); return out.join(","); };
  const sL = await seq(eL), sN = await seq(eN);
  check(F, sL === "303,303,303,429" && sN === sL, `Email có: ${sL}; email không có: ${sN}`);

  add(F, "## Token cũ, hết hạn, đã dùng; session cũ bị huỷ\n");
  await clearIp();
  const e = `dat.lai@${D}`;
  const u = await activeUser(e);
  const jar1 = await loginClient(e, DEMO_PW);
  const oldSidValue = jar1.jar.get("sid");
  await call(F, jar1, "GET", "/admin/dishes", null, { note: "jar 1 đã đăng nhập trước khi reset" });
  const h0 = await hashOf(e);
  const tokOld = await askToken(e, "yêu cầu 1");
  const tokExp = await askToken(e, "yêu cầu 2: token 1 trở thành token cũ");
  const c1 = await formClient();
  const rOld = await post(c1, tokOld, "token CŨ");
  check(F, codeOf(rOld.text) === "INVALID_RESET_TOKEN" && (await hashOf(e)) === h0, "Token cũ bị từ chối, passwordHash không đổi");
  await prisma.passwordReset.updateMany({ where: { userId: u.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  add(F, "(UPDATE password_resets SET expiresAt = quá khứ)\n");
  const rExp = await post(await formClient(), tokExp, "token HẾT HẠN");
  check(F, codeOf(rExp.text) === "INVALID_RESET_TOKEN" && (await hashOf(e)) === h0, "Token hết hạn bị từ chối, passwordHash không đổi");
  const tokGood = await askToken(e, "yêu cầu 3: token dùng được");
  const nBefore = await prisma.session.count({ where: { userId: u.id } });
  const rGood = await post(await formClient(), tokGood, "token hợp lệ, đặt mật khẩu mới");
  const nAfter = await prisma.session.count({ where: { userId: u.id } });
  const h1 = await hashOf(e);
  check(F, rGood.status === 303 && rGood.location.startsWith("/login") && h1 !== h0, "Reset thành công → 303 /login, passwordHash đổi");
  check(F, nBefore >= 1 && nAfter === 0, `Bản ghi sessions của user: trước ${nBefore}, sau ${nAfter}`);
  const replay = client();
  replay.jar.set("sid", oldSidValue);
  const rReplay = await call(F, replay, "GET", "/admin/dishes", null, { note: "dùng lại sid của jar 1 sau reset" });
  check(F, rReplay.status === 303 && rReplay.location.startsWith("/login"), "sid cũ bị từ chối sau reset");
  const rUsed = await post(await formClient(), tokGood, "dùng lại token ĐÃ DÙNG");
  check(F, codeOf(rUsed.text) === "INVALID_RESET_TOKEN" && (await hashOf(e)) === h1, "Token đã dùng bị từ chối, passwordHash không đổi");
  check(F, same(rOld, rExp, rUsed), "Token cũ, hết hạn, đã dùng → cùng một trang");

  add(F, "## Dùng reset token ở route khác\n");
  await clearIp();
  const eR = `token.khac@${D}`;
  const uR = await activeUser(eR);
  const tokR = await askToken(eR, "lấy token");
  const hR = await hashOf(eR);
  const rAct = await activate(F, client(), eR, tokR, "token làm mã kích hoạt");
  const cR = client();
  await cR.get("/login");
  const rLog = await call(F, cR, "POST", "/login", [["email", eR], ["password", tokR]], { note: "token làm mật khẩu" });
  const cS = client();
  cS.jar.set("sid", tokR);
  const rSid = await call(F, cS, "GET", "/admin/dishes", null, { note: "token làm giá trị cookie sid" });
  const row = await prisma.passwordReset.findFirst({ where: { userId: uR.id } });
  check(F, codeOf(rAct.text) === "INVALID_OTP" && codeOf(rLog.text) === "INVALID_CREDENTIALS" && rSid.status === 303 && rSid.location.startsWith("/login"), "Reset token ở /activate, /login, cookie sid → đều bị từ chối");
  check(F, (await hashOf(eR)) === hR && row.usedAt === null, "passwordHash không đổi, token chưa bị tiêu thụ");

  add(F, "## Reset tài khoản pending: vẫn pending\n");
  await clearIp();
  const eP = `reset.pending@${D}`;
  await register(F, eP, "tài khoản pending");
  const tokP = await askToken(eP, "quên mật khẩu khi đang pending");
  const rP = await post(await formClient(), tokP, "đặt lại mật khẩu");
  check(F, rP.status === 303 && (await userOf(eP)).status === "pending" && (await userOf(eP)).emailVerifiedAt === null, "Reset xong vẫn pending, emailVerifiedAt rỗng");
  const cP = client();
  await cP.get("/login");
  const rPL = await call(F, cP, "POST", "/login", [["email", eP], ["password", NEW_PW]], { note: "đăng nhập bằng mật khẩu mới" });
  check(F, codeOf(rPL.text) === "ACCOUNT_NOT_ACTIVATED", "Đăng nhập bằng mật khẩu mới → ACCOUNT_NOT_ACTIVATED, không có phiên");
  await dbSnapshot("db/10-reset-tai-khoan-pending.txt", "Sau khi reset tài khoản pending: token đã dùng, status vẫn pending", [eP]);
}

async function cookieCases() {
  const F = "curl/14-xoa-cookie-khong-huy-phien.txt";
  add(F, "# Câu hỏi trình bày 1: xoá cookie ở trình duyệt không huỷ bản ghi session; chỉ huỷ ở server mới làm sid mất hiệu lực\n");
  await clearIp();
  const e = `xoa.cookie@${D}`;
  const u = await activeUser(e);
  const c = await loginClient(e, DEMO_PW);
  const saved = c.jar.get("sid");
  await call(F, c, "GET", "/admin/dishes", null, { note: "đang đăng nhập" });
  c.jar.clear();
  const rNo = await call(F, c, "GET", "/admin/dishes", null, { note: "đã xoá cookie" });
  const n = await prisma.session.count({ where: { userId: u.id } });
  check(F, rNo.status === 303 && n === 1, `Không cookie → 303; bản ghi sessions của user vẫn còn: ${n}`);
  c.jar.set("sid", saved);
  const rBack = await call(F, c, "GET", "/admin/dishes", null, { note: "gửi lại đúng cookie đã lưu" });
  check(F, rBack.status === 200, "Cookie đã lưu vẫn dùng được: xoá cookie không huỷ phiên");
}

// Key THẬT từ .env: Google xác minh thật. Chỉ vài request, đề yêu cầu không gửi hàng loạt tới dịch vụ ngoài.
async function realKeyCases() {
  const F = "curl/15-captcha-key-that.txt";
  const real = dotenv.parse(await readFile(new URL("../.env", import.meta.url)));
  if (!real.RECAPTCHA_SECRET_KEY || real.RECAPTCHA_SECRET_KEY === process.env.RECAPTCHA_SECRET_KEY) throw new Error(".env chưa có key reCAPTCHA thật.");
  secrets.push(real.RECAPTCHA_SECRET_KEY);
  add(F, "# Server chạy với key reCAPTCHA THẬT trong .env, backend gọi siteverify của Google. Tick thật, dùng lại, quá hạn: curl/16 (làm tay).\n");
  await clearIp();
  await stopServer();
  await startServer({ PORT, MAIL_TRANSPORT: "file", APP_ORIGIN: BASE, RECAPTCHA_SITE_KEY: real.RECAPTCHA_SITE_KEY, RECAPTCHA_SECRET_KEY: real.RECAPTCHA_SECRET_KEY, RECAPTCHA_HOSTNAMES: real.RECAPTCHA_HOSTNAMES });
  const bot = `bot.key.that@${D}`;
  const send = async (extra, note, file = F) => {
    const r = client();
    const page = await r.get("/register");
    return { page, res: await call(file, r, "POST", "/register", [["email", bot], ["password", DEMO_PW], ["passwordConfirm", DEMO_PW], ...extra], { note }) };
  };
  const a = await send([], "không gửi token");
  check(F, a.page.text.includes(real.RECAPTCHA_SITE_KEY) && !a.page.text.includes(real.RECAPTCHA_SECRET_KEY), "Trang đăng ký dùng site key thật; secret không có trong trang");
  const b2 = await send([["g-recaptcha-response", "token-bia-khong-hop-le"]], "token bịa: Google trả success=false");
  const c3 = await send([["g-recaptcha-response", ""], ["captchaPassed", "true"], ["recaptchaScore", "1"]], "tự khai đã qua, token rỗng");
  check(F, codeOf(a.res.text) === "CAPTCHA_REQUIRED" && codeOf(b2.res.text) === "INVALID_CAPTCHA" && ["CAPTCHA_REQUIRED", "INVALID_CAPTCHA"].includes(codeOf(c3.res.text)), `Từ chối cả ba: ${[a, b2, c3].map((x) => codeOf(x.res.text)).join(", ")}`);
  const nUser = await prisma.user.count({ where: { email: bot } });
  const nMail = (await mails(bot)).length;
  check(F, nUser === 0 && nMail === 0, `Không tạo user (${nUser}), không gửi thư (${nMail})`);

  add(F, "## Hostname không thuộc RECAPTCHA_HOSTNAMES (key thử của Google trả success=true, server đặt danh sách hostname khác)\n");
  await stopServer();
  await startServer({ PORT, MAIL_TRANSPORT: "file", APP_ORIGIN: BASE, RECAPTCHA_HOSTNAMES: "chi-nhan-ten-nay.example" });
  const h = await send(CAPTCHA_OK, "success=true nhưng hostname sai");
  check(F, codeOf(h.res.text) === "INVALID_CAPTCHA" && (await prisma.user.count({ where: { email: bot } })) === 0, "success=true nhưng hostname sai → INVALID_CAPTCHA, không tạo user");
  await stopServer();
  await startServer({ PORT, MAIL_TRANSPORT: "file", APP_ORIGIN: BASE });
}

// Chrome thật: trang lỗi của các case trên, form gửi từ trang khác, Back sau đăng xuất, tìm không dấu.
async function browserCases(NET) {
  const b = await openBrowser();
  const shot = async (name) => shots.set(`screens/${name}.png`, await b.screenshot());
  const errorCode = () => b.eval(`return document.querySelector("[data-error-code]")?.dataset.errorCode ?? "";`);
  const where = () => b.eval("return location.pathname;");
  const F = "curl/17-trinh-duyet-trang-khac-va-back.txt";
  add(F, "# Trình duyệt thật (Chrome headless), không phải curl. Back gọi bằng history.back().\n");
  try {
    await clearIp();
    await b.viewport(375);
    const eH = `het.han.chrome@${D}`, eU = `da.dung.chrome@${D}`, eS = `gui.lai.chrome@${D}`, eK = `khoa.chrome@${D}`;
    const otpH = await register(null, eH);
    await prisma.activationChallenge.update({ where: { userId: (await userOf(eH)).id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await b.goto(`${BASE}/activate`);
    await b.fill("form.auth-form", { email: eH, otp: otpH });
    await b.submit("form.auth-form");
    await shot("21-ma-het-han-375");
    check(F, (await errorCode()) === "INVALID_OTP", "Chrome: mã hết hạn → INVALID_OTP");

    const otpU = await register(null, eU);
    await activate("curl/11-ma-kich-hoat.txt", client(), eU, otpU, "chuẩn bị ảnh 22: dùng mã lần đầu");
    await b.goto(`${BASE}/activate`);
    await b.fill("form.auth-form", { email: eU, otp: otpU });
    await b.submit("form.auth-form");
    await shot("22-ma-da-dung-375");
    check(F, (await errorCode()) === "INVALID_OTP", "Chrome: mã đã dùng → INVALID_OTP");

    await register(null, eS);
    await skipCooldown(eS);
    await b.goto(`${BASE}/activate`);
    await b.fill("form.auth-form", { email: eS });
    b.takeNetwork();
    await b.submit("form.auth-form", 'button[formaction="/activate/resend"]');
    network(NET, "13. Gửi lại mã: POST /activate/resend → 303 → trang nhập mã, đếm ngược 60 giây", b.takeNetwork());
    await shot("23-gui-lai-ma-375");

    const otpK = await register(null, eK);
    const bad = otpK === "000000" ? "111111" : "000000";
    await b.goto(`${BASE}/activate`);
    for (let i = 1; i <= 5; i++) { await b.fill("form.auth-form", { email: eK, otp: bad }); await b.submit("form.auth-form"); }
    await b.fill("form.auth-form", { email: eK, otp: otpK });
    b.takeNetwork();
    await b.submit("form.auth-form");
    network(NET, "14. Sai 5 lần rồi gửi mã ĐÚNG → 429 + Retry-After, vẫn pending", b.takeNetwork());
    await shot("24-kich-hoat-tam-khoa-429-375");

    const eF = `quen.chrome@${D}`;
    await activeUser(eF);
    let netForgot;
    for (let i = 1; i <= 4; i++) { await b.goto(`${BASE}/forgot`); await b.fill("form.auth-form", { email: eF }); b.takeNetwork(); await b.submit("form.auth-form"); netForgot = b.takeNetwork(); }
    network(NET, "15. Yêu cầu /forgot thứ 4 trong một giờ với cùng email → 429 + Retry-After", netForgot);
    await shot("25-quen-mat-khau-429-375");

      add(F, "## Trang ở http://127.0.0.1:5500 tự gửi form xoá món #1 tới http://localhost:3000 khi đang đăng nhập\n");
    await clearIp();
    const eC = `trang.khac@${D}`;
    await activeUser(eC);
    await b.goto(`${BASE}/login`);
    await b.fill("form.auth-form", { email: eC, password: DEMO_PW });
    await b.submit("form.auth-form");
    check(F, (await where()).startsWith("/admin"), `Đăng nhập trong Chrome → ${await where()}`);
    const dish1 = JSON.stringify(await prisma.dish.findUnique({ where: { id: 1 } }));
    const evil = createServer((_, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<!doctype html><form id="f" method="post" action="${BASE}/admin/dishes/1?_method=DELETE"><input name="_csrf" value="doan-bua"></form><script>document.getElementById("f").submit()</script>`); });
    await new Promise((r) => evil.listen(5500, "127.0.0.1", r));
    try {
      b.takeNetwork();
      await b.goto("http://127.0.0.1:5500/");
      await sleep(2000);
      const hops = b.takeNetwork();
      network(NET, "16. Trang khác (127.0.0.1:5500) tự gửi POST xoá món tới localhost:3000: Chrome KHÔNG gửi cookie sid (SameSite=Lax) → 303 /login; /login thấy phiên còn nên đưa về quản trị (ảnh 26: món #1 còn)", hops);
      const post = hops.find((h) => h.method === "POST");
      const hasCookie = Object.keys(post?.reqHeaders ?? {}).some((k) => k.toLowerCase() === "cookie");
      add(F, `POST ${post ? new URL(post.url).pathname + new URL(post.url).search : "(không thấy)"} → ${post?.status}, Origin: ${post?.reqHeaders?.origin ?? post?.reqHeaders?.Origin ?? "—"}, có gửi Cookie: ${hasCookie ? "CÓ" : "không"}\n`);
      await shot("26-form-tu-trang-khac-375");
      check(F, post?.status === 303 && !hasCookie, "Chrome không kèm cookie sid vào POST từ trang khác, server trả 303");
      check(F, JSON.stringify(await prisma.dish.findUnique({ where: { id: 1 } })) === dish1, "Món #1 không đổi");
    } finally { await new Promise((r) => evil.close(r)); }
    await b.goto(`${BASE}/admin/dishes`);
    check(F, (await where()) === "/admin/dishes", "Mở lại /admin/dishes vẫn đăng nhập: bị từ chối không phải vì đã mất phiên");

    add(F, "## Bấm Back sau khi đăng xuất\n");
    await b.submit(".account form");
    const afterLogout = await where();
    await b.navigating(() => b.eval("history.back(); return 1;"));
    await sleep(500);
    const afterBack = await where();
    add(F, `Sau đăng xuất: ${afterLogout}. Sau khi bấm Back: ${afterBack}\n`);
    await shot("27-back-sau-dang-xuat-375");
    await b.goto(`${BASE}/admin/dishes/new`);
    const next = await where();
    check(F, afterLogout === "/login" && next === "/login", `Sau Back, mở trang quản trị tiếp theo → ${next}: dữ liệu không còn truy cập được`);

    // Ba ảnh tìm không dấu trước đây chụp bằng script riêng; đưa vào đây để chạy lại là ra đủ.
    await b.viewport(1280);
    await b.goto(`${BASE}/dishes?q=pho`);
    await shot("18-tim-khong-dau-pho-1280");
    await b.goto(`${BASE}/dishes?mode=fulltext&q=${encodeURIComponent("nuoc dung xuong")}`);
    await shot("20-toan-van-khong-dau-1280");
    await b.viewport(375);
    await b.goto(`${BASE}/dishes?mode=fuzzy&q=${encodeURIComponent("bo luc lat")}`);
    await shot("19-gan-dung-khong-dau-375");
  } finally { b.close(); }
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
  await b.fill("form.auth-form", { username: "Minh Anh", email: "  Minh.Anh@Demo.Example ", password: USER_PW, passwordConfirm: USER_PW });
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
    await call(K4, r, "POST", "/register", [["username", "Người thử"], ["email", email], ["password", pw], ["passwordConfirm", pw], ["role", "admin"], ["g-recaptcha-response", "token-thu"]], { note });
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

  // ---------- 7b. Các case của bảng nghiệm thu chưa có bằng chứng riêng ----------
  await otpCases();
  await loginLimitCases();
  await resetCases();
  await cookieCases();
  await browserCases(NET);
  await realKeyCases();

  // Mọi mật khẩu, mã, token, sid, CSRF, hash đã gặp trong lần chạy (chuỗi ngắn hơn 6 ký tự không so được).
  const leaked = [...known].filter((s) => typeof s === "string" && s.length >= 6 && serverLog().includes(s));
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
if (failed.length) { console.log(`CHƯA ĐẠT ${failed.length} ca:\n${failed.join("\n")}`); process.exitCode = 1; }
