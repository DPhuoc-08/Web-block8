// Quên mật khẩu → link đặt lại qua email → đặt mật khẩu mới (plan mục 5.8, OWASP Forgot Password).
// - Hệ thống chỉ có hash nên không gửi lại mật khẩu cũ; quyền đặt lại đến từ việc đọc được hộp thư (token trong link).
// - Token 32 byte ngẫu nhiên, DB chỉ lưu SHA-256, gắn một user, hạn 15 phút, dùng một lần; yêu cầu mới vô hiệu token cũ.
// - GET /reset chỉ hiện form (phần mềm quét thư có thể tự mở link); chỉ POST /reset thành công mới tiêu thụ token.
import { Router } from "express";
import { prisma } from "../../db.js";
import { checkEmail } from "../../auth/email.js";
import { hashPassword, checkNewPassword } from "../../auth/password.js";
import { generateToken, sha256 } from "../../auth/secrets.js";
import { sendLater, resetMail, passwordChangedMail } from "../../auth/mailer.js";
import { destroyUserSessions } from "../../auth/session-store.js";
import { limit } from "../../auth/rate-limit.js";
import { tooMany } from "../../auth/pages.js";
import { photoFor } from "../../auth/photos.js";
import { one } from "../../forms.js";

const router = Router();
const MIN = 60_000;
const TOKEN_TTL = 15 * MIN;
const FORGOT_EMAIL = { windowMs: 60 * MIN, max: 3 }; // 3 yêu cầu / giờ theo email (tránh làm ngập hộp thư)
const FORGOT_IP = { windowMs: 60 * MIN, max: 10 }; // 10 yêu cầu / giờ theo IP
const RESET_IP = { windowMs: 15 * MIN, max: 20 }; // GET + POST /reset: chống dò token qua URL

// ---------- Quên mật khẩu ----------
async function renderForgot(res, { values = { email: "" }, errors = {}, banner = null, code = null } = {}) {
  res.status(200).render("auth/forgot", { title: "Quên mật khẩu", photo: await photoFor("forgot"), values, errors, banner, code });
}

router.get("/forgot", async (req, res) => {
  if (one(req.query.msg) === "forgot-sent") {
    // Cùng một trang cho email có và không có tài khoản ("Nếu email đã đăng ký…").
    return res.render("auth/result", {
      title: "Kiểm tra email", photo: await photoFor("forgot"), icon: "mail",
      heading: "Kiểm tra email của bạn",
      text: "Nếu email đã đăng ký, chúng tôi đã gửi link đặt lại mật khẩu. Link có hạn 15 phút và chỉ dùng được một lần.",
      button: { href: "/login", label: "Về đăng nhập" },
      link: { href: "/forgot", text: "Chưa nhận được? Gửi lại" },
    });
  }
  await renderForgot(res);
});

router.post("/forgot", async (req, res) => {
  const values = { email: one(req.body.email) };
  const ip = await limit(`forgot:ip:${req.ip}`, FORGOT_IP);
  if (ip.limited) return tooMany(res, "forgot", { retryAfter: ip.retryAfter, link: { href: "/login", text: "Về đăng nhập" } });
  const errors = {};
  const email = checkEmail(values.email, errors);
  if (errors.email) return renderForgot(res, { values, errors, banner: { kind: "error", text: "Kiểm tra lại email." }, code: "VALIDATION_FAILED" });
  // Giới hạn theo email tính cả khi email không có tài khoản → 429 không lộ tài khoản.
  const perEmail = await limit(`forgot:email:${email}`, FORGOT_EMAIL);
  if (perEmail.limited) return tooMany(res, "forgot", { retryAfter: perEmail.retryAfter, link: { href: "/login", text: "Về đăng nhập" } });

  // Phần còn lại chạy SAU khi đã trả trang: email có tài khoản phải ghi DB + gửi thư, email không có thì không →
  // nếu làm trước khi trả lời, thời gian phản hồi sẽ lộ email nào đã đăng ký. Lỗi chỉ ghi log, không có email / token.
  setImmediate(() => {
    issueResetToken(email).catch((err) => console.error(`[forgot] Tạo link đặt lại thất bại lúc ${new Date().toISOString()}: ${err.code ?? err.name}`));
  });
  res.redirect(303, "/forgot?msg=forgot-sent");
});

async function issueResetToken(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return; // không có tài khoản: không gửi gì
  const token = generateToken();
  const now = new Date();
  // Một token còn hiệu lực mỗi user: yêu cầu mới làm các token chưa dùng trước đó hết hiệu lực.
  await prisma.$transaction([
    prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + TOKEN_TTL) } }),
  ]);
  // Link dựng từ APP_ORIGIN trong .env, KHÔNG từ header Host của request (Host có thể bị người gọi giả mạo).
  sendLater(resetMail(email, `${process.env.APP_ORIGIN}/reset?token=${token}`));
}

// ---------- Đặt lại mật khẩu ----------
// Token nằm trong URL → trang không gửi Referer sang site khác (ảnh, font, link ngoài) để token không bị rò.
router.use("/reset", (req, res, next) => {
  res.set("Referrer-Policy", "no-referrer");
  next();
});

const validToken = async (token) => {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true, userId: true, usedAt: true, expiresAt: true } });
  return row && !row.usedAt && row.expiresAt > new Date() ? row : null;
};

// Hết hạn / đã dùng / sai / không có → cùng MỘT thông báo (không cho biết token từng tồn tại hay không).
const linkUnusable = async (res) =>
  res.status(200).render("auth/result", {
    title: "Link không dùng được", photo: await photoFor("reset"), icon: "warn", code: "INVALID_RESET_TOKEN",
    heading: "Link không dùng được",
    text: "Link đã hết hạn, đã được dùng hoặc không đúng. Hãy yêu cầu một link mới.",
    button: { href: "/forgot", label: "Gửi link mới" },
    link: { href: "/login", text: "Về đăng nhập" },
  });

async function renderReset(res, { token, errors = {}, banner = null, code = null }) {
  res.status(200).render("auth/reset", { title: "Đặt mật khẩu mới", photo: await photoFor("reset"), token, errors, banner, code });
}

// GET chỉ kiểm tra token để quyết định hiện form hay báo link hỏng — KHÔNG ghi usedAt.
router.get("/reset", async (req, res) => {
  const ip = await limit(`reset:ip:${req.ip}`, RESET_IP);
  if (ip.limited) return tooMany(res, "reset", { retryAfter: ip.retryAfter });
  const token = one(req.query.token);
  if (!(await validToken(token))) return linkUnusable(res);
  await renderReset(res, { token });
});

router.post("/reset", async (req, res) => {
  const ip = await limit(`reset:ip:${req.ip}`, RESET_IP);
  if (ip.limited) return tooMany(res, "reset", { retryAfter: ip.retryAfter });
  const token = one(req.body.token);
  const row = await validToken(token);
  if (!row) return linkUnusable(res);

  const password = one(req.body.password);
  const errors = {};
  checkNewPassword(password, one(req.body.passwordConfirm), errors);
  if (Object.keys(errors).length) return renderReset(res, { token, errors, banner: { kind: "error", text: "Kiểm tra lại mật khẩu mới." }, code: "VALIDATION_FAILED" });

  const passwordHash = await hashPassword(password);
  // MỘT transaction: tiêu thụ token bằng updateMany có điều kiện (chưa dùng, chưa hết hạn) → hai request cùng token gửi
  // cùng lúc chỉ một request đổi được mật khẩu; rồi đổi passwordHash, vô hiệu token khác, xoá MỌI phiên của user
  // (người đang giữ sid cũ — kể cả kẻ đã chiếm phiên — bị đăng xuất). KHÔNG đổi status: pending vẫn pending.
  const changed = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const { count } = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (count !== 1) return null;
    const user = await tx.user.update({ where: { id: row.userId }, data: { passwordHash }, select: { email: true } });
    await tx.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
    await destroyUserSessions(tx, row.userId);
    return user;
  });
  if (!changed) return linkUnusable(res);

  sendLater(passwordChangedMail(changed.email)); // báo đã đổi, không chứa mật khẩu
  // Không tự đăng nhập: người dùng đăng nhập lại theo luồng thường (kể cả CAPTCHA, giới hạn đăng nhập sai).
  res.redirect(303, "/login?msg=password-reset");
});

export default router;
