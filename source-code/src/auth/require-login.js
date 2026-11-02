// Chặn cụm CRUD (/admin/*) khi chưa đăng nhập — kiểm tra ở SERVER, không chỉ ẩn link trên giao diện.
// loadUser đã gắn res.locals.currentUser (chỉ khi phiên hợp lệ và tài khoản active). Không có → 303 tới /login:
// - GET: kèm ?next=<trang đang mở> để đăng nhập xong quay lại đúng trang;
// - POST / PATCH / DELETE gửi thẳng (curl, form cũ): về /login, dữ liệu không đổi.
// Cookie lạ, phiên hết hạn, tài khoản pending / bị xoá đều rơi vào nhánh này (không phải lỗi hệ thống).
export function requireLogin(req, res, next) {
  if (res.locals.currentUser) {
    // Trang quản trị có dữ liệu riêng → không lưu cache: bấm Back sau khi đăng xuất ít hiện lại dữ liệu cũ
    // (request kế tiếp tới server vẫn bị chặn ở đây).
    res.set("Cache-Control", "no-store");
    return next();
  }
  const target = req.method === "GET" ? `/login?${new URLSearchParams({ next: req.originalUrl })}` : "/login";
  res.redirect(303, target);
}

// `next` sau đăng nhập chỉ nhận đường dẫn NỘI BỘ: bắt đầu bằng "/" nhưng không phải "//" hay "/\" (trình duyệt hiểu là
// sang host khác) → không thể dùng trang đăng nhập để chuyển người dùng sang trang lạ (open redirect).
export const safeNext = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.startsWith("/login") ? value : "/admin/dishes";
