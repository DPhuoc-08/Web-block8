// Trang kết quả dùng chung của khu tài khoản: 429 (vượt giới hạn) và 503 (không xác minh được CAPTCHA).
import { photoFor } from "./photos.js";

// Số phút hiện cho người dùng: làm tròn tới phút gần nhất. Khoá 5 phút cho Retry-After 300–301 giây (đồng hồ DB và Node
// lệch vài trăm ms); làm tròn lên thì trang ghi "6 phút" (lỗi thấy ở ảnh bước 18). Retry-After vẫn là số giây chính xác.
export const minutesOf = (seconds) => Math.max(1, Math.round(seconds / 60));

// 429: nội dung chung, không cho biết bộ đếm nào chạm ngưỡng; Retry-After = số giây còn phải chờ.
export async function tooMany(res, page, { retryAfter, heading = "Thao tác quá nhiều lần", text, button, link }) {
  res.set("Retry-After", String(retryAfter));
  const minutes = minutesOf(retryAfter);
  return res.status(429).render("auth/result", {
    title: heading,
    photo: await photoFor(page),
    icon: "clock",
    code: "RATE_LIMITED",
    heading,
    text: text ?? `Bạn đã thử quá nhiều lần. Hãy thử lại sau khoảng ${minutes} phút.`,
    button,
    link: link ?? { href: "/dishes", text: "Về thực đơn" },
  });
}

// 503: không gọi được Google để xác minh CAPTCHA → không tạo / đổi gì, người dùng thử lại với token mới.
export async function captchaUnavailable(res, page, back) {
  return res.status(503).render("auth/result", {
    title: "Chưa xác minh được",
    photo: await photoFor(page),
    icon: "warn",
    code: "CAPTCHA_UNAVAILABLE",
    heading: "Chưa xác minh được bạn không phải người máy",
    text: "Dịch vụ xác minh của Google đang không trả lời. Chưa có gì được lưu — hãy quay lại và thử lần nữa.",
    button: { href: back, label: "Thử lại" },
  });
}
