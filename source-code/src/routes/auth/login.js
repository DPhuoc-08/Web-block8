// Đăng nhập (form POST → session + cookie sid → 303) và đăng xuất (POST, huỷ session ở server).
// Thứ tự kiểm tra ở POST /login (plan mục 5.4): giới hạn IP + khoá theo email → CAPTCHA (khi bộ đếm yêu cầu)
// → so mật khẩu → trạng thái tài khoản → tạo session. (Giới hạn và CAPTCHA thêm ở bước 14.)
import { Router } from "express";
import { prisma } from "../../db.js";
import { normalizeEmail } from "../../auth/email.js";
import { verifyPassword } from "../../auth/password.js";
import { safeNext } from "../../auth/require-login.js";
import { photoFor } from "../../auth/photos.js";
import { one } from "../../forms.js";

const router = Router();

// Thông báo khi được chuyển tới trang đăng nhập (?msg=…): chỉ nhận mã trong bảng, không in chữ từ URL.
const LOGIN_MSG = {
  activated: { kind: "success", text: "Tài khoản đã được kích hoạt. Mời bạn đăng nhập." },
  "password-reset": { kind: "success", text: "Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới." },
  "logged-out": { kind: "success", text: "Bạn đã đăng xuất." },
};

// Lỗi nhập ở form tài khoản trả 200 (plan 12, theo bảng của đề); data-error-code trên form để script kiểm tra.
async function renderLogin(res, { values = { email: "" }, banner = null, code = null, next = "", errors = {} } = {}) {
  res.status(200).render("auth/login", { title: "Đăng nhập", photo: await photoFor("login"), values, banner, code, next, errors });
}

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
const save = (req) => new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

router.get("/login", async (req, res) => {
  if (res.locals.currentUser) return res.redirect(303, safeNext(one(req.query.next)));
  const msg = one(req.query.msg);
  await renderLogin(res, { banner: Object.hasOwn(LOGIN_MSG, msg) ? LOGIN_MSG[msg] : null, next: one(req.query.next) });
});

router.post("/login", async (req, res) => {
  const emailInput = one(req.body.email);
  const email = normalizeEmail(emailInput);
  const password = one(req.body.password);
  const next = one(req.body.next);
  const again = (banner, code, errors = {}) => renderLogin(res, { values: { email: emailInput }, banner, code, next, errors });

  if (!email || !password) {
    return again({ kind: "error", text: "Nhập email và mật khẩu." }, "VALIDATION_FAILED", { ...(email ? {} : { email: "Nhập email." }), ...(password ? {} : { password: "Nhập mật khẩu." }) });
  }

  // Email không có tài khoản vẫn chạy verify với hash giả → cùng thời gian, cùng một câu thông báo:
  // người ngoài không phân biệt được "sai email" với "sai mật khẩu" (không dò được email nào đã đăng ký).
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, status: true } });
  const ok = await verifyPassword(user?.passwordHash ?? null, password);
  if (!ok) return again({ kind: "error", text: "Email hoặc mật khẩu không đúng." }, "INVALID_CREDENTIALS");

  // Đúng mật khẩu nhưng chưa kích hoạt: KHÔNG tạo session. Chỉ người đã biết mật khẩu mới thấy lý do (đề chấp nhận
  // đánh đổi này). Kiểm tra nằm ở đây — hàm cấp session — không chỉ ở giao diện.
  if (user.status !== "active") {
    req.session.activationEmail = email; // điền sẵn ở trang nhập mã, không đưa email lên URL
    return again({ kind: "info", text: "Tài khoản chưa được kích hoạt. Nhập mã 6 số trong email để kích hoạt.", link: { href: "/activate", text: "Nhập mã kích hoạt →" } }, "ACCOUNT_NOT_ACTIVATED");
  }

  // Đăng nhập thành công: phiên MỚI với sid MỚI (regenerate huỷ bản ghi phiên cũ) → một sid có từ trước (session
  // fixation) không trở thành phiên đã đăng nhập. CSRF token cũ đi theo phiên cũ; trang sau tự tạo token mới.
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
