// Gửi email (plan mục 8): mã kích hoạt, link đặt lại mật khẩu, báo đã đổi mật khẩu.
// MAIL_TRANSPORT=smtp → Gmail SMTP (App Password, khi demo); MAIL_TRANSPORT=file → ghi .eml vào .mail-outbox/
// (hộp thư thử nghiệm cho script kiểm tra; thư mục này không commit vì chứa mã / link thật).
// Gửi BẤT ĐỒNG BỘ (sendLater): request trả về ngay, không chờ máy chủ thư → thời gian phản hồi của email có tài khoản
// và không có tài khoản gần như nhau. Lỗi gửi chỉ ghi { loại thư, thời điểm, mã lỗi } — KHÔNG ghi địa chỉ, mã, link.
import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

export const OUTBOX = fileURLToPath(new URL("../../.mail-outbox/", import.meta.url));

const SMTP_HOST = "smtp.gmail.com";

let fileTransport = null;
async function getTransport() {
  if (process.env.MAIL_TRANSPORT === "smtp") {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error("MAIL_TRANSPORT=smtp cần SMTP_USER và SMTP_PASS (Gmail App Password) trong .env.");
    // Tự hỏi địa chỉ qua DNS của hệ điều hành rồi đưa IP cho nodemailer: bộ phân giải riêng của nodemailer hỏi thẳng máy
    // chủ DNS, không dùng cache của hệ điều hành; ở mạng DNS chậm nó vượt giới hạn 30 giây → lỗi EDNS, mất thư (lỗi sau bước 20).
    // Hỏi lại mỗi lần gửi để không giữ IP cũ. servername: TLS vẫn xác minh chứng chỉ theo tên smtp.gmail.com, không theo IP.
    const { address } = await lookup(SMTP_HOST, { family: 4 });
    return nodemailer.createTransport({ host: address, port: 465, secure: true, tls: { servername: SMTP_HOST }, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  }
  if (fileTransport) return fileTransport;
  // Dựng thư MIME đầy đủ như khi gửi thật, nhưng ghi ra file thay vì gửi.
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  fileTransport = {
    async sendMail(message) {
      const info = await stream.sendMail(message);
      await mkdir(OUTBOX, { recursive: true });
      await writeFile(`${OUTBOX}${Date.now()}-${message.headers["X-Mail-Kind"]}-${randomBytes(4).toString("hex")}.eml`, info.message);
    },
  };
  return fileTransport;
}

const from = () => process.env.MAIL_FROM || process.env.SMTP_USER;

// async: lỗi cấu hình (thiếu SMTP_PASS…) thành promise bị từ chối, không ném đồng bộ làm sập server trong sendLater.
export async function sendMail({ to, kind, subject, text, html }) {
  return (await getTransport()).sendMail({ from: from(), to, subject, text, html, headers: { "X-Mail-Kind": kind } });
}

export function sendLater(mail) {
  setImmediate(() => {
    sendMail(mail).catch((err) => console.error(`[mail] Gửi thư "${mail.kind}" thất bại lúc ${new Date().toISOString()}: ${err.code ?? err.name}`));
  });
}

// ---------- Nội dung thư (văn bản thuần + HTML đơn giản cùng màu ứng dụng) ----------
const wrap = (title, body) => `<!doctype html><html lang="vi"><body style="margin:0;background:#f5f4f1;font-family:Arial,sans-serif;color:#1d1c1a">
<div style="max-width:480px;margin:24px auto;background:#fff;border:1px solid #e6e3de;border-radius:12px;padding:28px">
<p style="margin:0 0 4px;font-weight:700;font-size:18px">Nhà hàng</p>
<h1 style="margin:0 0 16px;font-size:20px">${title}</h1>${body}
<p style="margin:24px 0 0;font-size:12px;color:#5f5b55">Thư tự động, vui lòng không trả lời.</p></div></body></html>`;

export const activationMail = (to, code) => ({
  to,
  kind: "activation",
  subject: `Mã kích hoạt tài khoản: ${code}`,
  text: `Mã kích hoạt tài khoản Nhà hàng của bạn: ${code}\nMã có hạn 10 phút và chỉ dùng được một lần.\nNếu bạn không đăng ký, hãy bỏ qua thư này.`,
  html: wrap("Mã kích hoạt tài khoản", `<p style="margin:0 0 12px">Nhập mã sau ở trang kích hoạt:</p>
<p style="margin:0 0 12px;font-size:32px;font-weight:700;letter-spacing:8px;color:#1f5b43">${code}</p>
<p style="margin:0;color:#5f5b55">Mã có hạn 10 phút và chỉ dùng được một lần. Nếu bạn không đăng ký, hãy bỏ qua thư này.</p>`),
});

export const resetMail = (to, link) => ({
  to,
  kind: "reset",
  subject: "Đặt lại mật khẩu",
  text: `Mở link sau để đặt mật khẩu mới (hạn 15 phút, dùng một lần):\n${link}\nNếu bạn không yêu cầu, hãy bỏ qua thư này — mật khẩu hiện tại vẫn giữ nguyên.`,
  html: wrap("Đặt lại mật khẩu", `<p style="margin:0 0 16px">Bấm nút dưới đây để đặt mật khẩu mới. Link có hạn 15 phút và chỉ dùng được một lần.</p>
<p style="margin:0 0 16px"><a href="${link}" style="display:inline-block;background:#1f5b43;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">Đặt mật khẩu mới</a></p>
<p style="margin:0;color:#5f5b55">Nếu bạn không yêu cầu, hãy bỏ qua thư này — mật khẩu hiện tại vẫn giữ nguyên.</p>`),
});

export const passwordChangedMail = (to) => ({
  to,
  kind: "password-changed",
  subject: "Mật khẩu của bạn vừa được đổi",
  text: "Mật khẩu tài khoản Nhà hàng của bạn vừa được đổi. Các phiên đăng nhập cũ đã bị đăng xuất.\nNếu không phải bạn, hãy dùng chức năng Quên mật khẩu ngay.",
  html: wrap("Mật khẩu đã được đổi", `<p style="margin:0">Mật khẩu tài khoản của bạn vừa được đổi; các phiên đăng nhập cũ đã bị đăng xuất. Nếu không phải bạn, hãy dùng chức năng <strong>Quên mật khẩu</strong> ngay.</p>`),
});
