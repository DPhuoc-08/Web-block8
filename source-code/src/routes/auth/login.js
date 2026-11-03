// Đăng nhập (form POST → session + cookie sid → 303) và đăng xuất (POST, huỷ session ở server).
// Thứ tự kiểm tra ở POST /login (plan mục 5.4): giới hạn IP + khoá theo email → CAPTCHA (khi bộ đếm yêu cầu)
// → so mật khẩu → trạng thái tài khoản → tạo session.
// Bộ đếm sai theo EMAIL chuẩn hoá nằm ở DB (không ở cookie): xoá cookie, mở tab ẩn danh không đặt lại được; email không
// có tài khoản cũng có bộ đếm → việc đòi CAPTCHA không tiết lộ email nào tồn tại.
import { Router } from "express";
import { prisma } from "../../db.js";
import { normalizeEmail } from "../../auth/email.js";
import { verifyPassword } from "../../auth/password.js";
import { safeNext } from "../../auth/require-login.js";
import { photoFor } from "../../auth/photos.js";
import { one } from "../../forms.js";
import { hit, peek, reset, limit, retryAfter } from "../../auth/rate-limit.js";
import { verifyRecaptcha, recaptchaSiteKey } from "../../auth/recaptcha.js";
import { tooMany, captchaUnavailable, minutesOf } from "../../auth/pages.js";

// Chính sách công bố (plan mục 4).
const MIN = 60_000;
const FAIL_WINDOW = 15 * MIN; // đếm lần sai trong cửa sổ 15 phút theo email
const CAPTCHA_AT = 3; // từ lần sai thứ 3: phải qua CAPTCHA trước khi được so mật khẩu
const LOCK_AT = 10; // đủ 10 lần sai: khoá 5 phút, 429 dù CAPTCHA + mật khẩu đúng
const LOCK_FOR = 5 * MIN;
const IP_LIMIT = { windowMs: 15 * MIN, max: 30 }; // 30 lần gửi form / 15 phút / IP (tính cả lần CAPTCHA sai)
const failKey = (email) => `login-fail:email:${email}`;
const needsCaptcha = async (email) => Boolean(email) && (await peek(failKey(email), { windowMs: FAIL_WINDOW })).count >= CAPTCHA_AT;

const router = Router();

// Thông báo khi được chuyển tới trang đăng nhập (?msg=…): chỉ nhận mã trong bảng, không in chữ từ URL.
const LOGIN_MSG = {
  activated: { kind: "success", text: "Tài khoản đã được kích hoạt. Mời bạn đăng nhập." },
  "password-reset": { kind: "success", text: "Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới." },
  "logged-out": { kind: "success", text: "Bạn đã đăng xuất." },
};

// Lỗi nhập ở form tài khoản trả 200 (plan 12, theo bảng của đề); data-error-code trên form để script kiểm tra.
async function renderLogin(res, { values = { email: "" }, banner = null, code = null, next = "", errors = {}, captchaRequired = false } = {}) {
  res.status(200).render("auth/login", {
    title: "Đăng nhập", photo: await photoFor("login"), values, banner, code, next, errors,
    captchaRequired, recaptcha: captchaRequired, siteKey: recaptchaSiteKey(),
  });
}

const locked = (res, until) =>
  tooMany(res, "login", {
    retryAfter: retryAfter(until),
    heading: "Tạm khoá đăng nhập",
    text: `Có quá nhiều lần đăng nhập sai với email này. Hãy thử lại sau ${minutesOf(retryAfter(until))} phút, hoặc đặt lại mật khẩu nếu bạn quên.`,
    button: { href: "/forgot", label: "Đặt lại mật khẩu" },
  });

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
const save = (req) => new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

router.get("/login", async (req, res) => {
  if (res.locals.currentUser) return res.redirect(303, safeNext(one(req.query.next)));
  const msg = one(req.query.msg);
  // Email đã gõ ở lần trước (nhớ trong phiên) đang bị đòi CAPTCHA → form hiện sẵn ô CAPTCHA.
  const email = req.session?.loginEmail ?? "";
  await renderLogin(res, { values: { email }, banner: Object.hasOwn(LOGIN_MSG, msg) ? LOGIN_MSG[msg] : null, next: one(req.query.next), captchaRequired: await needsCaptcha(email) });
});

router.post("/login", async (req, res) => {
  const emailInput = one(req.body.email);
  const email = normalizeEmail(emailInput);
  const password = one(req.body.password);
  const next = one(req.body.next);
  const again = (banner, code, errors = {}, captchaRequired = false) => renderLogin(res, { values: { email: emailInput }, banner, code, next, errors, captchaRequired });

  // 1. Giới hạn theo IP (một nguồn thử nhiều email). Đếm MỌI lần gửi form, kể cả lần CAPTCHA sai.
  const ip = await limit(`login:ip:${req.ip}`, IP_LIMIT);
  if (ip.limited) return tooMany(res, "login", { retryAfter: ip.retryAfter, heading: "Tạm khoá đăng nhập" });

  if (!email || !password) {
    return again({ kind: "error", text: "Nhập email và mật khẩu." }, "VALIDATION_FAILED", { ...(email ? {} : { email: "Nhập email." }), ...(password ? {} : { password: "Nhập mật khẩu." }) });
  }

  if (req.session) req.session.loginEmail = email; // để GET /login sau đó biết có cần hiện CAPTCHA

  // 2. Đang khoá (đủ 10 lần sai trong cửa sổ) → 429, KHÔNG xét CAPTCHA hay mật khẩu.
  const state = await peek(failKey(email), { windowMs: FAIL_WINDOW });
  if (state.lockedUntil) return locked(res, state.lockedUntil);

  // 3. Từ lần sai thứ 3: CAPTCHA hợp lệ TRƯỚC khi so mật khẩu. Thiếu / sai → dừng, không so mật khẩu, không tăng bộ
  //    đếm theo email (request vẫn đã tính vào giới hạn IP ở bước 1). Mỗi lần thử cần token MỚI (token dùng một lần).
  if (state.count >= CAPTCHA_AT) {
    const captcha = await verifyRecaptcha(one(req.body["g-recaptcha-response"]));
    if (captcha.unavailable) return captchaUnavailable(res, "login", "/login");
    if (!captcha.ok) {
      const missing = captcha.reason === "missing-input-response";
      return again({ kind: "info", text: "Bạn đã nhập sai nhiều lần. Hãy tick xác nhận bên dưới rồi thử lại." }, missing ? "CAPTCHA_REQUIRED" : "INVALID_CAPTCHA",
        { captcha: missing ? "Hãy tick ô “Tôi không phải là người máy”." : "Xác minh đã hết hạn hoặc không hợp lệ, hãy tick lại." }, true);
    }
  }

  // 4. So mật khẩu. Email không có tài khoản vẫn chạy verify với hash giả → cùng thời gian, cùng một câu thông báo:
  //    người ngoài không phân biệt được "sai email" với "sai mật khẩu" (không dò được email nào đã đăng ký).
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, status: true } });
  const ok = await verifyPassword(user?.passwordHash ?? null, password);
  if (!ok) {
    // Sai → tăng bộ đếm theo email (giải đúng CAPTCHA KHÔNG xoá bộ đếm). Đủ 10 lần → khoá 5 phút.
    const after = await hit(failKey(email), { windowMs: FAIL_WINDOW, lockAt: LOCK_AT, lockMs: LOCK_FOR });
    if (after.lockedUntil) return locked(res, after.lockedUntil);
    const captchaNext = after.count >= CAPTCHA_AT;
    return again(
      captchaNext ? { kind: "error", text: "Email hoặc mật khẩu không đúng. Lần sau cần xác nhận bạn không phải người máy." } : { kind: "error", text: "Email hoặc mật khẩu không đúng." },
      "INVALID_CREDENTIALS", {}, captchaNext,
    );
  }

  // Đúng mật khẩu nhưng chưa kích hoạt: KHÔNG tạo session. Chỉ người đã biết mật khẩu mới thấy lý do (đề chấp nhận
  // đánh đổi này). Kiểm tra nằm ở đây — hàm cấp session — không chỉ ở giao diện.
  if (user.status !== "active") {
    req.session.activationEmail = email; // điền sẵn ở trang nhập mã, không đưa email lên URL
    return again({ kind: "info", text: "Tài khoản chưa được kích hoạt. Nhập mã 6 số trong email để kích hoạt.", link: { href: "/activate", text: "Nhập mã kích hoạt →" } }, "ACCOUNT_NOT_ACTIVATED");
  }

  // Đăng nhập thành công: phiên MỚI với sid MỚI (regenerate huỷ bản ghi phiên cũ) → một sid có từ trước (session
  // fixation) không trở thành phiên đã đăng nhập. CSRF token cũ đi theo phiên cũ; trang sau tự tạo token mới.
  // 5. Chỉ đăng nhập THÀNH CÔNG mới xoá bộ đếm theo email (không xoá giới hạn IP).
  await reset(failKey(email));
  await regenerate(req);
  req.session.userId = user.id;
  req.session.loginAt = Date.now();
  await save(req); // ghi xong bản ghi phiên rồi mới redirect: request kế tiếp chắc chắn tra ra phiên
  res.redirect(303, safeNext(next));
});

// Đăng xuất là POST (có _csrf): GET chỉ đọc, link / ảnh trên trang khác không kích hoạt được.
// Huỷ bản ghi phiên ở server TRƯỚC (mọi bản sao của cookie sid cũ thành vô dụng), rồi mới bảo trình duyệt xoá cookie.
router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("sid", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.redirect(303, "/login?msg=logged-out");
  });
});

export default router;
