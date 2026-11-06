// Tên hiển thị (plan 12.4). Chỉ để hiện cho dễ nhận ra: ĐƯỢC TRÙNG nhau, không dùng để đăng nhập, nên việc nhập tên không
// cho người ngoài dò được điều gì về tài khoản khác. Nhận tiếng Việt có dấu; khi in ra trang luôn dùng <%= (escape HTML).
export const USERNAME_MIN = 2;
export const USERNAME_MAX = 50;

// Trả tên đã chuẩn hoá. NFC: cùng một chữ có dấu nhập từ các bộ gõ khác nhau được lưu giống nhau.
// \p{C} gồm ký tự điều khiển, ký tự vô hình (có thể làm tên trông giống tên người khác hoặc đảo chiều chữ).
export function checkUsername(raw, errors, key = "username") {
  const name = typeof raw === "string" ? raw.trim().normalize("NFC") : "";
  if (!name) errors[key] = "Nhập tên hiển thị.";
  else if ([...name].length < USERNAME_MIN) errors[key] = `Tên cần ít nhất ${USERNAME_MIN} ký tự.`;
  else if ([...name].length > USERNAME_MAX) errors[key] = `Tên tối đa ${USERNAME_MAX} ký tự.`;
  else if (/\p{C}/u.test(name)) errors[key] = "Tên chứa ký tự không hợp lệ.";
  return name;
}
