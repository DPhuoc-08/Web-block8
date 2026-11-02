// Đọc hộp thư thử nghiệm (.mail-outbox/, MAIL_TRANSPORT=file) cho script kiểm tra: thư mới nhất gửi tới một địa chỉ,
// lấy mã kích hoạt / link đặt lại. Chỉ dùng khi phát triển; từ chối chạy khi NODE_ENV=production.
import { readdir, readFile, rm } from "node:fs/promises";
import { OUTBOX } from "../../src/auth/mailer.js";

if (process.env.NODE_ENV === "production") throw new Error("Không đọc hộp thư thử nghiệm khi NODE_ENV=production.");

// Thư MIME dùng quoted-printable cho chữ có dấu: bỏ ngắt dòng mềm "=\n", đổi "=XX" về byte.
const decodeQp = (s) => Buffer.from(s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8");

export async function mails(to, kind) {
  let files = [];
  try { files = (await readdir(OUTBOX)).filter((f) => f.endsWith(".eml")).sort(); } catch { return []; }
  const out = [];
  for (const f of files) {
    const raw = decodeQp(await readFile(OUTBOX + f, "utf8"));
    const toLine = raw.match(/^To: (.+)$/m)?.[1] ?? "";
    if (toLine.toLowerCase().includes(to.toLowerCase()) && (!kind || raw.includes(`X-Mail-Kind: ${kind}`))) out.push({ file: f, raw });
  }
  return out;
}

// Chờ thư (gửi bất đồng bộ nên có thể tới sau response vài chục ms).
export async function waitMail(to, kind, { after = 0, timeout = 5000 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const found = (await mails(to, kind)).filter((m) => Number(m.file.split("-")[0]) >= after);
    if (found.length) return found.at(-1).raw;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

export const otpIn = (raw) => raw?.match(/Mã kích hoạt tài khoản Nhà hàng của bạn: (\d{6})/)?.[1] ?? null;
export const resetLinkIn = (raw) => raw?.match(/(https?:\/\/\S+\/reset\?token=[A-Za-z0-9_-]+)/)?.[1] ?? null;
export const clearOutbox = () => rm(OUTBOX, { recursive: true, force: true });
