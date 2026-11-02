// Tiện ích cho form HTML của khu quản trị (SSR).
// Validator của block7 nhận body JSON GIỮ KIỂU (giá là số, id là số, available là boolean, danh sách id là mảng).
// Form HTML chỉ gửi chuỗi → các hàm dưới đây đổi sang đúng dạng đó TRƯỚC khi validate. Giá trị không đổi được
// (vd. giá "1.5", id "abc") giữ nguyên chuỗi để validator báo đúng câu lỗi của block7, không tự sửa.

const DIGITS = /^\d+$/;

// Ô một giá trị: không có → ""; lặp tên (?x=a&x=b, form bị sửa tay) → lấy giá trị cuối như trình duyệt hiển thị.
export const one = (v) => (Array.isArray(v) ? String(v.at(-1) ?? "") : typeof v === "string" ? v : "");

// Nhiều ô cùng tên (checkbox tagIds, ingredientIds): express.urlencoded trả chuỗi nếu chỉ một ô, mảng nếu nhiều ô.
export const many = (v) => (v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

// "50000" → 50000; "" giữ "" (validator báo "để trống"); "1.5", "-1", "abc" giữ chuỗi (validator báo sai định dạng).
export const toNumberIfDigits = (s) => (DIGITS.test(s.trim()) ? Number(s.trim()) : s);

// Danh sách id từ checkbox: mỗi phần tử là số nếu viết bằng chữ số, không thì giữ chuỗi để validator báo lỗi kiểu.
export const toIdArray = (values) => values.map((s) => (DIGITS.test(s) ? Number(s) : s));

// Tên mới gõ trong ô "cách nhau bằng dấu phẩy" (thêm nhanh tag / nguyên liệu khi lưu món):
// cắt khoảng trắng, bỏ phần rỗng, bỏ trùng KHÔNG phân biệt hoa thường (giữ cách viết đầu tiên).
export function splitNames(s) {
  const seen = new Set();
  const names = [];
  for (const raw of s.split(",")) {
    const name = raw.trim();
    const key = name.toLocaleLowerCase("vi");
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

// URL danh sách để quay về sau khi lưu / xoá (giữ ?page=, ?q=): trang danh sách gửi kèm ?back= / ô ẩn back.
// Ai cũng sửa được giá trị này → chỉ nhận đúng URL của danh sách `base` (không điều hướng ra trang lạ).
export const safeBack = (value, base) =>
  typeof value === "string" && (value === base || value.startsWith(`${base}?`)) ? value : base;

// Gắn thông báo sau khi lưu vào URL danh sách: thay ?msg=, ?saved= cũ (nếu có), giữ các tham số khác (page, q).
export function withFlash(url, flash) {
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.delete("msg");
  params.delete("saved");
  for (const [key, value] of Object.entries(flash)) params.set(key, String(value));
  return `${path}?${params}`;
}

// Link tới trang con (form sửa, xác nhận xoá) kèm ?back= khi danh sách đang ở trang/tìm khác mặc định.
export const withBack = (href, listUrl, base) => (listUrl === base ? href : `${href}?${new URLSearchParams({ back: listUrl })}`);
