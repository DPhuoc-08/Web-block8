// Phần bằng chứng PHẢI do người làm (đề: key thử không được dùng làm bằng chứng chặn bot; Google chặn Chrome do script
// điều khiển, mình không tìm cách lách). Script chạy server thật với KEY THẬT trong .env, thư ghi ra file, rồi dẫn từng bước:
// tick thật → đi tiếp, gửi lại token → từ chối, quá hạn → từ chối; cuối cùng giữ server để chụp DevTools.
// Chỉ ghi evidence/curl/16-captcha-key-that.txt khi cả ba bước đúng; token không được ghi ra file. Tài khoản thử bị xoá ở cuối.
//   node scripts/captcha-key-that.mjs      (phải tắt `npm start` trước)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import dotenv from "dotenv";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { client } from "./lib/client.mjs";
import { startServer, stopServer } from "./lib/server.mjs";
import { mails, clearOutbox } from "./lib/outbox.mjs";

const D = "demo.example";
const BASE = "http://localhost:3000";
const FILE = new URL("../../evidence/curl/16-captcha-key-that.txt", import.meta.url);
const SHOTS = new URL("../../evidence/devtools/", import.meta.url);
const PW = "Mat-khau-thu-2026"; // chỉ cho tài khoản thử, bị xoá ở cuối
const [TICK, REPLAY, EXPIRED, COOKIE] = ["tick.that", "dung.lai", "qua.han", "devtools"].map((n) => `${n}@${D}`);

const test = dotenv.parse(await readFile(new URL("../.env.test", import.meta.url)));
if (!process.env.RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY === test.RECAPTCHA_SECRET_KEY) throw new Error(".env chưa có key reCAPTCHA thật.");
if (!(process.env.RECAPTCHA_HOSTNAMES ?? "").split(",").map((h) => h.trim()).includes("localhost")) throw new Error("RECAPTCHA_HOSTNAMES trong .env chưa có localhost.");

const cleanup = async () => {
  await prisma.user.deleteMany({ where: { email: { in: [TICK, REPLAY, EXPIRED, COOKIE] } } });
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${D}` } }, { key: { contains: ":ip:" } }] } });
};
const out = ["# reCAPTCHA v2 với KEY THẬT, người tick trên Chrome thật, backend gọi siteverify của Google. Token không ghi ra file.\n"];
const failed = [];
const check = (cond, text) => { out.push(`${cond ? "ĐẠT" : "CHƯA ĐẠT"}: ${text}`); console.log(`  ${cond ? "ĐẠT" : "CHƯA ĐẠT"}: ${text}`); if (!cond) failed.push(text); };
const userCount = (email) => prisma.user.count({ where: { email } });
const code = (html) => html.match(/data-error-code="([^"]+)"/)?.[1] ?? "";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const form = (email) => `    Tên: Người thử  ·  Email: ${email}  ·  Mật khẩu: ${PW}`;

await cleanup();
await clearOutbox();
await startServer({ PORT: "3000", MAIL_TRANSPORT: "file", APP_ORIGIN: BASE });
let token = "";
try {
  console.log(`\nBƯỚC 1 — Tick thật\n  Mở ${BASE}/register trong Chrome, F12 → Network, bật Preserve log. Điền:\n${form(TICK)}\n  Tick ô reCAPTCHA, bấm Tạo tài khoản.\n  Bấm request POST register → Payload, chép giá trị g-recaptcha-response.`);
  token = (await rl.question("  Dán token vào đây rồi Enter (dán xong token KHÔNG được ghi ra file): ")).trim();
  out.push("## 1. Tick thật, dữ liệu hợp lệ");
  const ticked = await prisma.user.findUnique({ where: { email: TICK } });
  check(ticked?.status === "pending" && ticked.role === "viewer", `Có user ${TICK}: status=${ticked?.status ?? "không có"}`);
  check((await mails(TICK, "activation")).length === 1, "Có 1 thư kích hoạt");
  if (failed.length) throw new Error("Bước 1 chưa đạt (chưa tick, sai email hay server khác?) → chưa ghi bằng chứng.");

  out.push("\n## 2. Gửi lại đúng token đó bằng request trực tiếp");
  const c = client();
  await c.get("/register");
  const res = await c.post("/register", [["username", "Người thử"], ["email", REPLAY], ["password", PW], ["passwordConfirm", PW], ["g-recaptcha-response", token]]);
  out.push(`POST /register  email=${REPLAY}  g-recaptcha-response=<đã che> → ${res.status}  data-error-code="${code(res.text)}"`);
  check(res.status === 200 && code(res.text) === "INVALID_CAPTCHA", `Token dùng lại → ${res.status} ${code(res.text)}`);
  check((await userCount(REPLAY)) === 0 && (await mails(REPLAY)).length === 0, "Không tạo user, không gửi thư");

  console.log(`\nBƯỚC 3 — Token quá hạn\n  Mở lại ${BASE}/register, điền:\n${form(EXPIRED)}\n  Tick, CHỜ QUÁ 2 PHÚT (đừng bấm gì, widget có thể tự báo hết hạn), rồi bấm Tạo tài khoản.\n  Nếu widget đã bỏ tick, form sẽ báo thiếu CAPTCHA — vẫn là bị từ chối. Chụp trang kết quả, lưu evidence/devtools/captcha-qua-han.png.`);
  await rl.question("  Xong thì Enter: ");
  out.push("\n## 3. Tick rồi chờ quá 2 phút mới gửi");
  check((await userCount(EXPIRED)) === 0 && (await mails(EXPIRED)).length === 0, "Không tạo user, không gửi thư");

  await prisma.user.create({ data: { email: COOKIE, emailInput: COOKIE, passwordHash: await hashPassword(PW), status: "active", emailVerifiedAt: new Date() } });
  await mkdir(SHOTS, { recursive: true });
  console.log(`\nBƯỚC 4 — Chụp DevTools, lưu vào evidence/devtools/. Tài khoản: ${COOKIE} / ${PW}
  CHE giá trị sid trong mọi ảnh; trong Payload che password, _csrf, g-recaptcha-response.
  1-cookie-truoc-dang-nhap.png   Application → Cookies → ${BASE} (mở /login, chưa đăng nhập)
  2-network-post-login.png       Network → POST login: 303, Set-Cookie
  3-cookie-sau-dang-nhap.png     Application → Cookies: thấy HttpOnly, SameSite=Lax; giá trị sid đã đổi
  4-network-request-sau.png      Network → GET /admin/dishes: request gửi Cookie: sid
  5-network-post-logout.png      Bấm Đăng xuất → Network → POST logout: 303, Set-Cookie xoá sid
  6-captcha-tick-that.png        Trang /register đã tick (không có dòng chữ đỏ "testing purposes")`);
  await rl.question("  Chụp xong thì Enter để tắt server và dọn dữ liệu: ");
} finally {
  rl.close();
  await stopServer();
  await cleanup();
  await clearOutbox();
}
const text = out.join("\n") + "\n";
if (token && text.includes(token)) throw new Error("Token lọt vào nội dung file — không ghi.");
if (failed.length) throw new Error(`Chưa đạt ${failed.length} ca, chưa ghi bằng chứng:\n${failed.join("\n")}`);
await writeFile(FILE, text);
await prisma.$disconnect();
console.log("\nĐã ghi evidence/curl/16-captcha-key-that.txt");
