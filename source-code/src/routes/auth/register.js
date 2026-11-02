// Đăng ký (CAPTCHA → tài khoản pending + mã OTP qua email), kích hoạt bằng mã, gửi lại mã (plan mục 5.2, 5.3).
// Nguyên tắc chung: phản hồi KHÔNG cho biết email nào đã có tài khoản — email mới, email đang chờ kích hoạt, email đã
// kích hoạt đều nhận cùng trang, cùng status; giới hạn tính theo email chuẩn hoá cả khi email không có tài khoản.
import { Router } from "express";
import { prisma, isUniqueViolation } from "../../db.js";
import { checkEmail } from "../../auth/email.js";
import { hashPassword, checkNewPassword } from "../../auth/password.js";
import { generateOtp, hashOtp, sameHex } from "../../auth/secrets.js";
import { sendLater, activationMail } from "../../auth/mailer.js";
import { verifyRecaptcha, recaptchaSiteKey } from "../../auth/recaptcha.js";
import { hit, peek, limit, retryAfter } from "../../auth/rate-limit.js";
import { tooMany, captchaUnavailable } from "../../auth/pages.js";
import { photoFor } from "../../auth/photos.js";
import { one } from "../../forms.js";

const router = Router();

// Chính sách công bố (plan mục 4).
const MIN = 60_000;
const OTP_TTL = 10 * MIN; // mã có hạn 10 phút
const OTP_MAX_ATTEMPTS = 5; // 5 lần sai → khoá kích hoạt 15 phút
const OTP_LOCK = 15 * MIN;
const RESEND_COOLDOWN = 1 * MIN; // chờ 60 giây giữa hai lần gửi
const RESEND_PER_HOUR = 5; // tối đa 5 lần gửi / giờ theo email
const REGISTER_PER_HOUR = 10; // tối đa 10 lần đăng ký / giờ theo IP
const ACTIVATE_IP = { windowMs: 15 * MIN, max: 30 }; // chống dò mã từ một nguồn qua nhiều email

const save = (req) => new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
const expiresIn = (ms) => new Date(Date.now() + ms);

// Hai giới hạn gửi mã theo email (dùng ở đăng ký lại khi đang pending và ở "Gửi lại mã"):
// chờ 60 giây giữa hai lần, tối đa 5 lần / giờ. Tính cả khi email không có tài khoản.
async function sendBudget(email) {
  const cooldown = await limit(`otp-cooldown:email:${email}`, { windowMs: RESEND_COOLDOWN, max: 1 });
  if (cooldown.limited) return cooldown;
  return limit(`otp-send:email:${email}`, { windowMs: 60 * MIN, max: RESEND_PER_HOUR });
}

// Mã mới cho tài khoản pending: ghi đè otpHash, hạn, usedAt → mã cũ hết dùng được. GIỮ attempts, lockedUntil:
// gửi lại không mở thêm lượt đoán (nếu đặt lại, kẻ tấn công xen kẽ "gửi lại" và "đoán" sẽ có số lần thử vô hạn).
async function issueOtp(userId, email) {
  const code = generateOtp();
  await prisma.activationChallenge.update({ where: { userId }, data: { otpHash: hashOtp(code), expiresAt: expiresIn(OTP_TTL), usedAt: null, lastSentAt: new Date() } });
  sendLater(activationMail(email, code)); // mã chỉ đi qua email: không có trong response, không ghi log
}

// ---------- Đăng ký ----------
async function renderRegister(res, { values = { email: "" }, errors = {}, banner = null, code = null } = {}) {
  res.status(200).render("auth/register", { title: "Tạo tài khoản", photo: await photoFor("register"), recaptcha: true, siteKey: recaptchaSiteKey(), values, errors, banner, code });
}

router.get("/register", async (req, res) => {
  if (res.locals.currentUser) return res.redirect(303, "/admin/dishes");
  await renderRegister(res);
});

router.post("/register", async (req, res) => {
  const values = { email: one(req.body.email) };
  // 1. Giới hạn theo IP (bot tạo hàng loạt tài khoản / gửi hàng loạt thư).
  const ipLimit = await limit(`register:ip:${req.ip}`, { windowMs: 60 * MIN, max: REGISTER_PER_HOUR });
  if (ipLimit.limited) return tooMany(res, "register", { retryAfter: ipLimit.retryAfter, link: { href: "/login", text: "Về đăng nhập" } });

  // 2. CAPTCHA TRƯỚC khi băm mật khẩu, tạo user hay gửi email (bot bị chặn trước bước tốn tài nguyên).
  const captcha = await verifyRecaptcha(one(req.body["g-recaptcha-response"]));
  if (captcha.unavailable) return captchaUnavailable(res, "register", "/register");
  if (!captcha.ok) {
    const missing = captcha.reason === "missing-input-response";
    return renderRegister(res, {
      values,
      errors: { captcha: missing ? "Hãy tick ô “Tôi không phải là người máy”." : "Xác minh đã hết hạn hoặc không hợp lệ, hãy tick lại." },
      banner: { kind: "error", text: "Hãy xác nhận bạn không phải người máy rồi gửi lại." },
      code: missing ? "CAPTCHA_REQUIRED" : "INVALID_CAPTCHA",
    });
  }

  // 3. Kiểm tra dữ liệu. role (nếu ai đó gửi kèm) bị bỏ qua: không đọc trường này, server gán viewer.
  const errors = {};
  const email = checkEmail(values.email, errors);
  const password = one(req.body.password);
  checkNewPassword(password, one(req.body.passwordConfirm), errors);
  if (Object.keys(errors).length) {
    return renderRegister(res, { values, errors, banner: { kind: "error", text: "Kiểm tra lại các ô được đánh dấu bên dưới." }, code: "VALIDATION_FAILED" });
  }

  // 4. Luôn băm mật khẩu (kể cả khi email đã có) → thời gian phản hồi giống nhau, không đoán được email đã đăng ký.
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true } });
  if (!existing) {
    const code = generateOtp();
    try {
      // User pending + mã kích hoạt trong một transaction (không có user mà thiếu mã).
      await prisma.user.create({
        data: {
          email,
          emailInput: values.email.trim(),
          passwordHash,
          activation: { create: { otpHash: hashOtp(code), expiresAt: expiresIn(OTP_TTL), lastSentAt: new Date() } },
        },
      });
      await hit(`otp-cooldown:email:${email}`, { windowMs: RESEND_COOLDOWN });
      await hit(`otp-send:email:${email}`, { windowMs: 60 * MIN });
      sendLater(activationMail(email, code));
    } catch (err) {
      // Hai request đăng ký cùng email gần như cùng lúc: @unique chặn request sau → coi như email đã có.
      if (!isUniqueViolation(err)) throw err;
    }
  } else if (existing.status === "pending") {
    // Đang chờ kích hoạt: KHÔNG ghi đè mật khẩu (người đăng ký sau không được chọn mật khẩu cho tài khoản mà chủ
    // hộp thư sẽ kích hoạt). Coi như yêu cầu gửi lại mã, theo giới hạn gửi; quá giới hạn thì lặng lẽ bỏ qua.
    if (!(await sendBudget(email)).limited) await issueOtp(existing.id, email);
  }
  // Đã active: không ghi gì, không gửi thư (plan 12.1). Cả ba nhánh → cùng một trang.

  req.session.activationEmail = email; // điền sẵn ở trang nhập mã; không đưa email lên URL
  // Đặt ở MỌI nhánh (kể cả khi không gửi thư): trang nhập mã có đếm ngược giống hệt nhau → không lộ email nào đã có.
  req.session.otpSentAt = Date.now();
  await save(req);
  res.redirect(303, "/activate?msg=registered");
});

// ---------- Kích hoạt ----------
const ACTIVATE_MSG = {
  registered: { kind: "info", text: "Nếu email hợp lệ và chưa được kích hoạt, mã 6 số đã được gửi tới email đó. Mã có hạn 10 phút." },
  "otp-sent": { kind: "success", text: "Nếu email hợp lệ và chưa kích hoạt, mã mới đã được gửi. Mã cũ không dùng được nữa." },
};

async function renderActivate(res, { values, errors = {}, banner = null, code = null, cooldown = 0 } = {}) {
  res.status(200).render("auth/activate", { title: "Nhập mã kích hoạt", photo: await photoFor("activate"), values, errors, banner, code, cooldown });
}

router.get("/activate", async (req, res) => {
  const msg = one(req.query.msg);
  const sentAt = req.session?.otpSentAt ?? 0;
  await renderActivate(res, {
    values: { email: req.session?.activationEmail ?? "" },
    banner: Object.hasOwn(ACTIVATE_MSG, msg) ? ACTIVATE_MSG[msg] : null,
    // Đếm ngược "Gửi lại mã sau …" (JS, chỉ để dễ hiểu): server vẫn tự chặn 60 giây.
    cooldown: Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN - Date.now()) / 1000)),
  });
});

const INVALID_OTP = "Mã không đúng hoặc đã hết hạn.";

router.post("/activate", async (req, res) => {
  const values = { email: one(req.body.email) };
  const otp = one(req.body.otp).replace(/\s/g, "");
  const ipLimit = await limit(`activate:ip:${req.ip}`, ACTIVATE_IP);
  if (ipLimit.limited) return tooMany(res, "activate", { retryAfter: ipLimit.retryAfter, link: { href: "/login", text: "Về đăng nhập" } });

  const errors = {};
  const email = checkEmail(values.email, errors);
  if (errors.email) return renderActivate(res, { values, errors, banner: { kind: "error", text: "Kiểm tra lại email." }, code: "VALIDATION_FAILED" });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, activation: true } });
  const challenge = user?.status === "pending" ? user.activation : null;
  const failKey = `activate-fail:email:${email}`;

  // Đang khoá → 429 dù mã đúng. Email không có tài khoản pending cũng có bộ đếm (theo email) → 429 không lộ tài khoản.
  const lockedUntil = challenge ? (challenge.lockedUntil > new Date() ? challenge.lockedUntil : null) : (await peek(failKey, { windowMs: OTP_LOCK })).lockedUntil;
  if (lockedUntil) {
    return tooMany(res, "activate", { retryAfter: retryAfter(lockedUntil), heading: "Tạm khoá kích hoạt", text: `Bạn đã nhập sai mã quá nhiều lần. Hãy thử lại sau khoảng ${Math.ceil(retryAfter(lockedUntil) / 60)} phút.`, link: { href: "/login", text: "Về đăng nhập" } });
  }

  // Mã đúng khi đủ 6 điều kiện: tài khoản pending, purpose = activation, chưa hết hạn, chưa dùng, chưa vượt giới hạn
  // thử, hash khớp (so bằng timingSafeEqual). Ghi "đã dùng" + kích hoạt trong MỘT transaction bằng updateMany có điều
  // kiện → hai request gửi cùng một mã đúng cùng lúc: chỉ một request cập nhật được (count = 1), request kia nhận lỗi.
  let activated = false;
  if (challenge && /^\d{6}$/.test(otp) && sameHex(hashOtp(otp), challenge.otpHash)) {
    activated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.activationChallenge.updateMany({
        where: { userId: user.id, purpose: "activation", usedAt: null, expiresAt: { gt: now }, attempts: { lt: OTP_MAX_ATTEMPTS }, otpHash: challenge.otpHash, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
        data: { usedAt: now },
      });
      if (count !== 1) return false;
      await tx.user.update({ where: { id: user.id }, data: { status: "active", emailVerifiedAt: now } });
      return true;
    });
  }

  if (!activated) {
    // Mọi lý do sai (sai mã, hết hạn, đã dùng, không có tài khoản pending) → cùng một câu, tăng số lần thử.
    if (challenge) {
      const updated = await prisma.activationChallenge.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } });
      if (updated.attempts >= OTP_MAX_ATTEMPTS) {
        // Đủ 5 lần sai → khoá 15 phút; đếm lại từ 0 cho lượt sau khi hết khoá.
        await prisma.activationChallenge.update({ where: { userId: user.id }, data: { lockedUntil: expiresIn(OTP_LOCK), attempts: 0 } });
      }
    } else {
      await hit(failKey, { windowMs: OTP_LOCK, lockAt: OTP_MAX_ATTEMPTS, lockMs: OTP_LOCK });
    }
    return renderActivate(res, { values, errors: { otp: "Kiểm tra lại mã trong email mới nhất, hoặc gửi mã mới." }, banner: { kind: "error", text: INVALID_OTP }, code: "INVALID_OTP" });
  }

  // Kích hoạt chỉ đổi trạng thái tài khoản, KHÔNG tự đăng nhập: người dùng đăng nhập ở bước riêng.
  delete req.session.activationEmail;
  delete req.session.otpSentAt;
  res.redirect(303, "/login?msg=activated");
});

// ---------- Gửi lại mã ----------
router.post("/activate/resend", async (req, res) => {
  const values = { email: one(req.body.email) };
  const errors = {};
  const email = checkEmail(values.email, errors);
  if (errors.email) return renderActivate(res, { values, errors, banner: { kind: "error", text: "Nhập email đã đăng ký để nhận mã mới." }, code: "VALIDATION_FAILED" });

  // Chờ 60 giây / tối đa 5 lần mỗi giờ theo email — kể cả email không có tài khoản (429 không lộ tài khoản).
  const budget = await sendBudget(email);
  if (budget.limited) return tooMany(res, "activate", { retryAfter: budget.retryAfter, heading: "Chưa gửi được mã mới", text: `Bạn vừa yêu cầu mã. Hãy chờ khoảng ${budget.retryAfter < 60 ? `${budget.retryAfter} giây` : `${Math.ceil(budget.retryAfter / 60)} phút`} rồi thử lại.`, button: { href: "/activate", label: "Về trang nhập mã" } });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, activation: { select: { userId: true } } } });
  if (user?.status === "pending" && user.activation) await issueOtp(user.id, email);
  req.session.activationEmail = email;
  req.session.otpSentAt = Date.now();
  await save(req);
  res.redirect(303, "/activate?msg=otp-sent");
});

export default router;
