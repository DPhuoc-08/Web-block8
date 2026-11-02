// Sinh và băm mã bí mật. Số ngẫu nhiên CHỈ lấy từ `crypto` (bộ sinh an toàn của Node), không dùng Math.random.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Mã kích hoạt 6 chữ số (000000–999999). Không gian chỉ 1 triệu giá trị → hash KHÔNG đủ bảo vệ; lớp bảo vệ chính là
// hạn 10 phút + giới hạn 5 lần sai (plan mục 4).
export const generateOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// HMAC-SHA256 với OTP_PEPPER (bí mật nằm trong .env, không trong DB): người chỉ đọc được bảng activation_challenges
// không dò được mã bằng cách thử 1 triệu giá trị.
export const hashOtp = (otp) => createHmac("sha256", process.env.OTP_PEPPER).update(String(otp)).digest("hex");

// Token đặt lại mật khẩu: 32 byte ngẫu nhiên (base64url, đặt được vào URL). Token dài, ngẫu nhiên → SHA-256 là đủ để
// lưu (không như mật khẩu do người chọn); DB chỉ có hash, lộ bảng không dùng được link.
export const generateToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

// So hai chuỗi hex cùng độ dài trong thời gian không đổi (không lộ "đúng được bao nhiêu ký tự đầu").
export function sameHex(a, b) {
  const x = Buffer.from(String(a), "hex");
  const y = Buffer.from(String(b), "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
