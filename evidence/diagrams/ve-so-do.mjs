// Vẽ 4 sơ đồ luồng (SVG) từ code thật: mỗi ô ghi file:dòng, tìm bằng một đoạn chữ trong mã nguồn —
// đoạn chữ không còn trong code thì script báo lỗi (sơ đồ không lặng lẽ lệch khỏi code).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// Chạy: node evidence/diagrams/ve-so-do.mjs (từ thư mục block8). Đổi code xong chạy lại để cập nhật số dòng.
const SRC = new URL("../../source-code/src/", import.meta.url).pathname;
const OUT = new URL("./", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const ref = (file, needle, nth = 1) => {
  const lines = readFileSync(SRC + file, "utf8").split("\n");
  let seen = 0;
  const i = lines.findIndex((l) => l.includes(needle) && ++seen === nth);
  if (i < 0) throw new Error(`Không thấy "${needle}" trong ${file}`);
  return `${file}:${i + 1}`;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const C = { text: "#1d1d1b", muted: "#5f5f5a", border: "#d9d6cf", bg: "#f7f6f3", surface: "#ffffff", accent: "#1f5b43", accentBg: "#e8f1ec", danger: "#a8281d", dangerBg: "#fbecea", warn: "#8a5a00", warnBg: "#fdf3dc", req: "#eef0f3" };
const LH = 19, PAD = 12, W = 1100, MX = 40, MW = 520, FX = 650, FW = 410;

function box(x, y, w, kind, title, lines = [], tag = "") {
  const style = {
    req: [C.req, C.border, C.text], check: [C.surface, C.border, C.text], act: [C.accentBg, "#b9d3c5", C.text],
    end: [C.accent, C.accent, "#ffffff"], fail: [C.dangerBg, "#efc2bd", C.danger], note: [C.warnBg, "#ecd9a8", C.warn],
  }[kind];
  const h = PAD * 2 + LH * (1 + lines.length) + (tag ? LH : 0);
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${style[0]}" stroke="${style[1]}"/>`;
  if (kind === "check") s += `<rect x="${x}" y="${y}" width="5" height="${h}" rx="2" fill="${C.accent}"/>`;
  let ty = y + PAD + 14;
  s += `<text x="${x + 16}" y="${ty}" font-weight="700" fill="${style[2]}">${esc(title)}</text>`;
  for (const l of lines) { ty += LH; s += `<text x="${x + 16}" y="${ty}" fill="${kind === "end" ? "#ffffff" : kind === "fail" ? C.danger : C.muted}">${esc(l)}</text>`; }
  if (tag) { ty += LH; s += `<text x="${x + 16}" y="${ty}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="${kind === "end" ? "#d6e7de" : "#8a8780"}">${esc(tag)}</text>`; }
  return { svg: s, h };
}
const arrowDown = (x, y1, y2, label) =>
  `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 6}" stroke="${C.accent}" stroke-width="2"/><path d="M${x - 5} ${y2 - 8} L${x} ${y2} L${x + 5} ${y2 - 8}Z" fill="${C.accent}"/>` +
  (label ? `<text x="${x + 10}" y="${(y1 + y2) / 2 + 4}" font-size="12" fill="${C.accent}" font-weight="600">${esc(label)}</text>` : "");
const arrowRight = (x1, x2, y, label) =>
  `<line x1="${x1}" y1="${y}" x2="${x2 - 6}" y2="${y}" stroke="${C.danger}" stroke-width="1.6" stroke-dasharray="5 4"/><path d="M${x2 - 8} ${y - 5} L${x2} ${y} L${x2 - 8} ${y + 5}Z" fill="${C.danger}"/>` +
  (label ? `<text x="${(x1 + x2) / 2}" y="${y - 7}" font-size="12" text-anchor="middle" fill="${C.danger}" font-weight="600">${esc(label)}</text>` : "");

// steps: { kind, title, lines, tag, down (nhãn mũi tên xuống bước sau), fails: [{ label, title, lines, tag, kind }] }
function diagram(file, heading, sub, steps, legendNote) {
  let y = 112, body = "";
  steps.forEach((st, i) => {
    const b = box(MX, y, MW, st.kind, st.title, st.lines, st.tag);
    body += b.svg;
    let fy = y, fh = 0;
    for (const f of st.fails ?? []) {
      const fb = box(FX, fy, FW, f.kind ?? "fail", f.title, f.lines, f.tag);
      body += fb.svg + arrowRight(MX + MW, FX, fy + 26, f.label);
      fy += fb.h + 10; fh = fy - y - 10;
    }
    y += Math.max(b.h, fh);
    if (i < steps.length - 1) { body += arrowDown(MX + 40, y, y + 40, st.down ?? "qua"); y += 40; }
  });
  const H = y + 70;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="14">
<title>${esc(heading)}</title>
<rect width="${W}" height="${H}" fill="${C.bg}"/>
<text x="${MX}" y="50" font-size="24" font-weight="700" fill="${C.text}">${esc(heading)}</text>
<text x="${MX}" y="78" fill="${C.muted}">${esc(sub)}</text>
<text x="${MX + 40}" y="104" font-size="12" font-weight="700" fill="${C.accent}" letter-spacing=".04em">LUỒNG CHÍNH (thứ tự trong code)</text>
<text x="${FX}" y="104" font-size="12" font-weight="700" fill="${C.danger}" letter-spacing=".04em">DỪNG Ở ĐÂY — không làm các bước bên dưới</text>
${body}
<text x="${MX}" y="${H - 28}" font-size="12" fill="${C.muted}">${esc(legendNote)}</text>
</svg>`;
  writeFileSync(OUT + file, svg);
  console.log(file, H);
}
const CSRF = (extra = "") => ({ label: "sai / thiếu", title: "403 Yêu cầu bị từ chối", lines: ["Không đọc form, không ghi gì." + extra], tag: "auth/csrf.js" });
const NOTE = "Vẽ nháp từ mã nguồn block8 ngày 03/11/2026 · file:dòng trỏ vào source-code/src/ · DB = bảng trong PostgreSQL (Supabase block7) · nhóm duyệt trước khi dùng.";

// ---------- 1. Đăng ký có CAPTCHA + kích hoạt ----------
diagram("1-dang-ky-captcha.svg", "Đăng ký có CAPTCHA và kích hoạt bằng mã", "POST /register → POST /activate · CAPTCHA xác minh TRƯỚC khi băm mật khẩu, tạo user hay gửi thư", [
  { kind: "req", title: "Trình duyệt gửi form /register", lines: ["email, password, passwordConfirm, _csrf", "+ g-recaptcha-response (token Google cấp khi tick ô)"] },
  { kind: "check", title: "CSRF: _csrf đúng của phiên, Origin là site này", lines: ["Chạy trên method gốc, trước method-override"], tag: ref("auth/csrf.js", "export function csrf"), fails: [CSRF()] },
  { kind: "check", title: "Giới hạn theo IP: 10 lần đăng ký / giờ", lines: ["Một câu INSERT … ON CONFLICT tăng bộ đếm"], tag: `${ref("routes/auth/register.js", "register:ip:")} · DB rate_limits`, fails: [{ label: "vượt", title: "429 + Retry-After", lines: ["Trang “Thao tác quá nhiều lần”"], tag: "auth/pages.js" }] },
  { kind: "check", title: "reCAPTCHA: backend gọi Google siteverify", lines: ["secret ở .env; qua khi success === true", "VÀ hostname thuộc RECAPTCHA_HOSTNAMES", "Không tin trường nào khác từ trình duyệt"], tag: `${ref("routes/auth/register.js", "const captcha = await verifyRecaptcha")} · auth/recaptcha.js`, fails: [
    { label: "lỗi mạng", title: "503 Chưa xác minh được", lines: ["Không mặc định cho qua."], tag: "auth/pages.js captchaUnavailable" },
    { label: "thiếu / sai", title: "200 CAPTCHA_REQUIRED / INVALID_CAPTCHA", lines: ["Chưa băm mật khẩu, chưa ghi DB,", "chưa gửi thư."] },
  ] },
  { kind: "check", title: "Kiểm dữ liệu", lines: ["Email chuẩn hoá: trim + chữ thường (cùng một hàm", "ở mọi form) · mật khẩu 8–64 ký tự, nhập lại khớp", "Trường role (nếu có) bị bỏ qua → server gán viewer"], tag: ref("routes/auth/register.js", "const email = checkEmail(values.email, errors)"), fails: [{ label: "sai", title: "200 VALIDATION_FAILED", lines: ["Đánh dấu ô sai; mật khẩu không điền lại."] }] },
  { kind: "act", title: "Băm mật khẩu Argon2id — LUÔN băm", lines: ["Kể cả email đã có: thời gian phản hồi như nhau"], tag: ref("routes/auth/register.js", "const passwordHash = await hashPassword(password)") },
  { kind: "check", title: "Email đã có tài khoản?", lines: ["• Chưa có → MỘT transaction: users (pending, viewer)", "   + activation_challenges (HMAC-SHA256 của mã 6 số,", "   hạn 10 phút) → gửi thư sau khi trả lời", "• Pending → KHÔNG ghi đè mật khẩu; gửi lại mã nếu", "   còn hạn mức (chờ 60 giây, 5 lần / giờ)", "• Active → không ghi gì, không gửi thư"], tag: `${ref("routes/auth/register.js", "const existing = await prisma.user.findUnique")} · DB users, activation_challenges` },
  { kind: "end", title: "303 /activate?msg=registered — CẢ BA nhánh giống hệt", lines: ["Cùng trang, cùng đếm ngược “Gửi lại mã” → không lộ email nào đã có"], tag: ref("routes/auth/register.js", 'res.redirect(303, "/activate?msg=registered")'), down: "người dùng mở thư, nhập mã" },
  { kind: "req", title: "POST /activate: email + mã 6 số + _csrf", lines: ["(qua CSRF và giới hạn theo IP như trên)"], tag: ref("routes/auth/register.js", 'router.post("/activate"') },
  { kind: "check", title: "Đang khoá kích hoạt? (5 lần sai → khoá 15 phút)", lines: ["Email không có tài khoản cũng có bộ đếm riêng"], tag: ref("routes/auth/register.js", "if (lockedUntil) {"), fails: [{ label: "đang khoá", title: "429 Tạm khoá kích hoạt", lines: ["Kể cả khi mã đúng."] }] },
  { kind: "check", title: "Mã đúng khi đủ 6 điều kiện", lines: ["pending · purpose = activation · chưa hết hạn ·", "chưa dùng · chưa vượt số lần thử · HMAC khớp", "(so bằng timingSafeEqual)"], tag: ref("routes/auth/register.js", "if (challenge && /^\\d{6}$/.test(otp)"), fails: [{ label: "bất kỳ lý do", title: "200 INVALID_OTP — một câu chung", lines: ["attempts + 1; đủ 5 → lockedUntil = +15 phút"], tag: "DB activation_challenges" }] },
  { kind: "act", title: "MỘT transaction: updateMany có điều kiện", lines: ["usedAt = now (chỉ khi vẫn chưa dùng) → count = 1 thì", "users.status = active, emailVerifiedAt = now", "Hai request cùng mã đúng: chỉ một request thắng"], tag: ref("routes/auth/register.js", "const { count } = await tx.activationChallenge.updateMany") },
  { kind: "end", title: "303 /login?msg=activated — KHÔNG tự đăng nhập", lines: ["Người dùng đăng nhập ở bước riêng"], tag: ref("routes/auth/register.js", 'res.redirect(303, "/login?msg=activated")') },
], NOTE);

// ---------- 2. Đăng nhập chống brute force ----------
const L = "routes/auth/login.js";
diagram("2-dang-nhap-chong-brute-force.svg", "Đăng nhập chống brute force", "POST /login · thứ tự cố định: giới hạn IP → khoá theo email → CAPTCHA (khi cần) → mật khẩu → trạng thái → phiên", [
  { kind: "req", title: "Trình duyệt gửi form /login", lines: ["email, password, next (nếu bị chuyển từ /admin), _csrf", "+ g-recaptcha-response khi form có CAPTCHA"] },
  { kind: "check", title: "CSRF: _csrf đúng của phiên, Origin là site này", tag: ref("auth/csrf.js", "export function csrf"), fails: [CSRF()] },
  { kind: "check", title: "① Giới hạn theo IP: 30 lần gửi / 15 phút", lines: ["Đếm MỌI lần gửi, kể cả lần CAPTCHA sai", "Chỉ tin req.ip (không trust proxy, không X-Forwarded-For)"], tag: `${ref(L, "login:ip:")} · DB rate_limits`, fails: [{ label: "vượt", title: "429 Tạm khoá đăng nhập + Retry-After" }] },
  { kind: "check", title: "Có email và mật khẩu?", tag: ref(L, "if (!email || !password)"), fails: [{ label: "thiếu", title: "200 VALIDATION_FAILED" }] },
  { kind: "check", title: "② Email đang bị khoá? (đủ 10 lần sai / 15 phút)", lines: ["Đọc bộ đếm login-fail:email:<email đã chuẩn hoá>"], tag: `${ref(L, "if (state.lockedUntil) return locked")} · DB rate_limits`, fails: [{ label: "đang khoá", title: "429 + Retry-After", lines: ["DÙ CAPTCHA và mật khẩu đúng.", "Không so mật khẩu."] }] },
  { kind: "check", title: "③ Đã sai ≥ 3 lần? → bắt buộc CAPTCHA", lines: ["siteverify: success + hostname · token dùng một lần", "Giải đúng CAPTCHA KHÔNG xoá bộ đếm"], tag: ref(L, "if (state.count >= CAPTCHA_AT)"), fails: [
    { label: "lỗi mạng", title: "503 Chưa xác minh được" },
    { label: "thiếu / sai", title: "200 CAPTCHA_REQUIRED / INVALID_CAPTCHA", lines: ["Chưa so mật khẩu; bộ đếm email không đổi."] },
  ] },
  { kind: "check", title: "④ So mật khẩu (argon2.verify)", lines: ["Email không có tài khoản → verify với hash giả", "→ cùng thời gian, cùng một câu thông báo"], tag: ref(L, "const ok = await verifyPassword"), fails: [{ label: "sai", title: "Bộ đếm theo email + 1 (một câu SQL)", lines: ["Đủ 10 → khoá 5 phút → 429", "Còn lại → 200 INVALID_CREDENTIALS:", "“Email hoặc mật khẩu không đúng.”", "Form giữ email, bỏ mật khẩu; từ lần 3 có CAPTCHA"], tag: `${ref(L, "const after = await hit(failKey(email)")} · DB rate_limits` }] },
  { kind: "check", title: "⑤ Tài khoản active?", tag: ref(L, 'if (user.status !== "active")'), fails: [{ label: "pending", title: "200 ACCOUNT_NOT_ACTIVATED", lines: ["KHÔNG tạo phiên; link tới trang nhập mã."] }] },
  { kind: "act", title: "Xoá bộ đếm theo email (KHÔNG xoá giới hạn IP)", tag: ref(L, "await reset(failKey(email))") },
  { kind: "act", title: "regenerate: huỷ phiên cũ, cấp sid MỚI", lines: ["Gắn userId + loginAt; ghi bản ghi sessions xong mới trả lời", "(chống session fixation)"], tag: `${ref(L, "await regenerate(req)")} · DB sessions` },
  { kind: "end", title: "303 next (đường dẫn nội bộ) hoặc /admin/dishes", lines: ["Set-Cookie: sid=… HttpOnly; SameSite=Lax; Path=/"], tag: ref(L, "res.redirect(303, safeNext(next))") },
], NOTE);

// ---------- 3. Đăng xuất ----------
diagram("3-dang-xuat.svg", "Đăng xuất và request sau đó", "POST /logout (nút trên header, form có _csrf) · không có GET /logout", [
  { kind: "req", title: "Trình duyệt gửi form POST /logout", lines: ["Cookie: sid=… · _csrf"] },
  { kind: "check", title: "CSRF: _csrf đúng của phiên, Origin là site này", lines: ["Trang khác không đăng xuất hộ được"], tag: ref("auth/csrf.js", "export function csrf"), fails: [CSRF(), { label: "GET /logout", title: "404 — không route nào đổi trạng thái bằng GET" }] },
  { kind: "act", title: "① Huỷ bản ghi phiên ở server TRƯỚC", lines: ["req.session.destroy → DELETE khỏi bảng sessions", "Mọi bản sao của cookie sid cũ thành vô dụng"], tag: `${ref("routes/auth/login.js", "req.session.destroy")} · DB sessions` },
  { kind: "act", title: "② Rồi mới xoá cookie ở trình duyệt", lines: ["Set-Cookie: sid=; Expires=1970 (cùng Path, HttpOnly, SameSite)"], tag: ref("routes/auth/login.js", 'res.clearCookie("sid"') },
  { kind: "end", title: "303 /login?msg=logged-out", lines: ["“Bạn đã đăng xuất.”"], down: "ai đó gửi lại sid cũ" },
  { kind: "req", title: "GET /admin/dishes với Cookie: sid=<sid cũ>", lines: ["(chép từ trước, hoặc bấm Back rồi thao tác)"] },
  { kind: "check", title: "loadUser: tra sid trong bảng sessions", lines: ["Không có bản ghi / hết hạn 2 giờ không dùng / quá 12 giờ", "/ tài khoản không còn active → không có currentUser"], tag: ref("auth/load-user.js", "export async function loadUser"), down: "currentUser rỗng" },
  { kind: "check", title: "requireLogin cho mọi /admin (trước csrf)", tag: ref("app.js", 'app.use("/admin", requireLogin)'), fails: [{ label: "không có", title: "303 /login?next=/admin/dishes", lines: ["POST / PATCH / DELETE → 303 /login.", "Dữ liệu không đổi."], tag: "auth/require-login.js" }] },
], NOTE);

// ---------- 4. Quên mật khẩu ----------
const P = "routes/auth/password-reset.js";
diagram("4-quen-mat-khau.svg", "Quên mật khẩu và đặt lại", "POST /forgot → thư → GET /reset (chỉ hiện form) → POST /reset (tiêu thụ token)", [
  { kind: "req", title: "POST /forgot: email + _csrf", tag: "(qua CSRF như các form khác)" },
  { kind: "check", title: "Giới hạn IP 10 / giờ · định dạng email · email 3 / giờ", lines: ["Bộ đếm theo email tính cả email KHÔNG có tài khoản"], tag: `${ref(P, "forgot:ip:")} · DB rate_limits`, fails: [{ label: "vượt", title: "429 + Retry-After" }, { label: "sai định dạng", title: "200 VALIDATION_FAILED" }] },
  { kind: "end", title: "303 /forgot?msg=forgot-sent — trả lời NGAY", lines: ["Email có hay không: cùng trang, cùng status, cùng thời gian"], tag: ref(P, 'res.redirect(303, "/forgot?msg=forgot-sent")'), down: "sau khi đã trả lời (setImmediate)" },
  { kind: "check", title: "Email có tài khoản?", tag: ref(P, "async function issueResetToken"), fails: [{ kind: "note", label: "không", title: "Dừng — không ghi gì, không gửi thư" }] },
  { kind: "act", title: "MỘT transaction: vô hiệu token cũ + tạo token mới", lines: ["Token 32 byte ngẫu nhiên (crypto) — DB chỉ lưu SHA-256,", "hạn 15 phút · thư: APP_ORIGIN/reset?token=… (không dùng Host)"], tag: `${ref(P, "prisma.passwordReset.create")} · DB password_resets`, down: "người dùng bấm link trong thư" },
  { kind: "check", title: "GET /reset?token=…: Referrer-Policy: no-referrer", lines: ["Giới hạn IP 20 / 15 phút · token còn hạn, chưa dùng?", "CHỈ hiện form — không ghi usedAt"], tag: ref(P, 'router.get("/reset"'), fails: [{ label: "vượt", title: "429 + Retry-After" }, { label: "token hỏng", title: "200 “Link không dùng được”", lines: ["Sai / hết hạn / đã dùng: một câu chung,", "không cho biết lý do."] }] },
  { kind: "req", title: "POST /reset: token (ô ẩn) + mật khẩu mới ×2 + _csrf", lines: ["Chrome gửi Origin: null (trang no-referrer) → csrf.js chỉ", "chấp nhận null ở route này, vẫn bắt buộc _csrf + token"], tag: ref("auth/csrf.js", "const resetNull") },
  { kind: "check", title: "Giới hạn IP · token còn hợp lệ? · mật khẩu mới 8–64, khớp?", tag: ref(P, 'router.post("/reset"'), fails: [{ label: "vượt", title: "429 + Retry-After" }, { label: "token hỏng", title: "200 “Link không dùng được”" }, { label: "mật khẩu sai", title: "200 VALIDATION_FAILED", lines: ["Token chưa bị dùng."] }] },
  { kind: "act", title: "Argon2id mật khẩu mới → MỘT transaction", lines: ["① updateMany token: usedAt rỗng, chưa hết hạn → count = 1?", "② users.passwordHash mới (status KHÔNG đổi)", "③ vô hiệu mọi token khác  ④ xoá MỌI phiên của user", "Hai request cùng token: chỉ một request đổi được", "DB: password_resets, users, sessions"], tag: ref(P, "const { count } = await tx.passwordReset.updateMany"), fails: [{ label: "count ≠ 1", title: "200 “Link không dùng được”", lines: ["Không đổi gì."] }] },
  { kind: "end", title: "Thư “Mật khẩu đã được đổi” · 303 /login?msg=password-reset", lines: ["KHÔNG tự đăng nhập — đăng nhập lại theo luồng thường"], tag: ref(P, 'res.redirect(303, "/login?msg=password-reset")') },
], NOTE);
