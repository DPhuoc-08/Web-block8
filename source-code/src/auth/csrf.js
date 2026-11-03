// Chống CSRF (plan mục 6.3) — ba lớp kết hợp:
// 1. Cookie sid có SameSite=Lax: trình duyệt không gửi cookie trong POST xuất phát từ site khác.
// 2. Token đồng bộ: mỗi phiên một token ngẫu nhiên, nằm trong ô ẩn _csrf của MỌI form ghi dữ liệu. Trang lạ không
//    đọc được trang của mình nên không biết token → request giả bị từ chối dù trình duyệt có gửi cookie.
// 3. Header Origin (trình duyệt gửi kèm mọi POST) phải là CHÍNH site này: APP_ORIGIN, hoặc đúng địa chỉ mà trình duyệt
//    đang mở (vd. http://127.0.0.1:3000 thay vì http://localhost:3000). Form tự gửi từ trang lạ mang Origin của trang lạ
//    → bị từ chối; trang lạ không đổi được header Origin mà trình duyệt của nạn nhân gửi.
// Kiểm tra trên method GỐC (POST) trước method-override; GET/HEAD/OPTIONS không ghi gì nên không kiểm.
import { randomBytes, timingSafeEqual } from "node:crypto";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// Token của phiên; chỉ tạo khi trang thật sự in một form ghi dữ liệu → thực đơn của khách không tạo phiên.
function tokenFor(req) {
  req.session.csrfToken ??= randomBytes(32).toString("base64url");
  return req.session.csrfToken;
}

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function csrf(req, res, next) {
  // Template gọi csrf() ngay trong form (một hàm, không phải giá trị tính sẵn: res.render sao chép locals).
  res.locals.csrf = () => tokenFor(req);
  if (SAFE.has(req.method)) return next();

  const origin = req.get("origin");
  const expected = req.session?.csrfToken;
  const sent = req.body?._csrf;
  // Ngoại lệ duy nhất: POST /reset với Origin "null". Trang đặt lại mật khẩu có Referrer-Policy: no-referrer (để token
  // trong URL không lọt ra ngoài) và theo chuẩn Fetch, trang như vậy gửi form kèm Origin: null — chặn thì Chrome thật
  // không bao giờ đặt lại được mật khẩu (lỗi phát hiện ở bước 18). Request vẫn phải có _csrf đúng của phiên (dưới đây)
  // và reset token bí mật; mọi route khác vẫn từ chối Origin "null".
  const resetNull = origin === "null" && req.path === "/reset";
  const badOrigin = origin !== undefined && !resetNull && origin !== process.env.APP_ORIGIN && origin !== `${req.protocol}://${req.get("host")}`;
  if (badOrigin || !expected || typeof sent !== "string" || !same(sent, expected)) {
    return res.status(403).render("403", { title: "Yêu cầu bị từ chối" });
  }
  next();
}
