// Chuẩn hoá và kiểm tra email (plan mục 4, OWASP Email Validation and Verification).
// MỘT hàm chuẩn hoá dùng ở mọi nơi nhận email: đăng ký, kích hoạt, gửi lại mã, đăng nhập, quên mật khẩu, bộ đếm.
// Chính sách nhóm công bố: cắt khoảng trắng hai đầu, chữ thường TOÀN BỘ địa chỉ ("An@Gmail.com" = "an@gmail.com");
// không bỏ dấu chấm hay phần "+…" theo quy tắc riêng của nhà cung cấp.
import validator from "validator";

export const EMAIL_MAX = 254;

export const normalizeEmail = (raw) => (typeof raw === "string" ? raw.trim().toLowerCase() : "");

// Định dạng kiểm bằng thư viện đã kiểm thử (không tự viết regex). Định dạng đúng KHÔNG chứng minh hộp thư có thật
// hay thuộc về người nhập — việc đó do mã OTP gửi qua email chứng minh.
export function checkEmail(raw, errors, key = "email") {
  const email = normalizeEmail(raw);
  if (!email) errors[key] = "Nhập email.";
  else if (email.length > EMAIL_MAX || !validator.isEmail(email)) errors[key] = "Email chưa đúng định dạng, ví dụ: ten@gmail.com";
  return email;
}
