// Định dạng hiển thị dùng trong template (giữ từ web/src/format.js của block7).

// Giá lưu bằng số nguyên (đồng): 55000 → "55.000đ"
export const formatPrice = (price) => `${price.toLocaleString("vi-VN")}đ`;

// Giá ở thực đơn và trang chi tiết (block7 plan 13.h): món 0đ ghi "Miễn phí". Admin vẫn dùng formatPrice.
export const formatMenuPrice = (price) => (price === 0 ? "Miễn phí" : formatPrice(price));

// Tên các tag nối bằng dấu chấm giữa: "Món nước · Miền Bắc".
export const tagNames = (tags) => tags.map((t) => t.name).join(" · ");
