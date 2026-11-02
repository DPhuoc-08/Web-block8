// Lưu và kiểm tra mật khẩu bằng Argon2id (OWASP Password Storage: lựa chọn đầu tiên). Không tự viết thuật toán băm.
// Thư viện `argon2` tự sinh salt ngẫu nhiên cho MỖI lần băm và ghi thuật toán + tham số + salt vào chuỗi kết quả
// ($argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>) → hai user trùng mật khẩu vẫn có hai chuỗi khác nhau.
// Kiểm tra = băm lại mật khẩu nhập với đúng salt/tham số trong chuỗi rồi so (thư viện làm, so sánh hằng thời gian).
import argon2 from "argon2";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

export const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id });

// Hash giả, tính một lần khi khởi động: email không có tài khoản vẫn chạy verify với nó → thời gian phản hồi
// gần bằng nhánh có tài khoản, người ngoài không đo được email nào tồn tại.
const dummyHash = hashPassword("mat-khau-gia-khong-dung-de-dang-nhap");

// passwordHash = null (không có user) → verify với hash giả, luôn trả false.
export async function verifyPassword(passwordHash, password) {
  try {
    if (passwordHash === null) {
      await argon2.verify(await dummyHash, password);
      return false;
    }
    return await argon2.verify(passwordHash, password);
  } catch {
    return false; // chuỗi hash hỏng → coi như sai, không để thành lỗi 500 lộ thông tin
  }
}

// Quy tắc công bố (plan mục 4): 8–64 ký tự, không bắt buộc chữ hoa / ký tự đặc biệt; nhập lại phải khớp.
export function checkNewPassword(password, confirm, errors, keys = { password: "password", confirm: "passwordConfirm" }) {
  if (typeof password !== "string" || password.length === 0) errors[keys.password] = "Nhập mật khẩu.";
  else if (password.length < PASSWORD_MIN) errors[keys.password] = `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`;
  else if (password.length > PASSWORD_MAX) errors[keys.password] = `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`;
  else if (password.trim() === "") errors[keys.password] = "Mật khẩu không được chỉ gồm khoảng trắng.";
  if (confirm !== undefined && !errors[keys.password] && confirm !== password) errors[keys.confirm] = "Hai mật khẩu chưa khớp nhau.";
}
