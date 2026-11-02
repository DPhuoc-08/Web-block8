// Khôi phục danh tính cho MỌI request (chạy sau express-session):
//   cookie sid → express-session tra bảng sessions → req.session.userId → đọc user từ DB.
// Chỉ coi là đã đăng nhập khi user còn tồn tại, còn active và phiên chưa quá hạn tối đa (12 giờ kể từ lúc đăng nhập,
// plan mục 4). Không đạt → phiên trở về ẩn danh (bỏ userId), KHÔNG phải lỗi hệ thống.
// Handler / template chỉ đọc res.locals.currentUser — không tự đọc cookie.
import { prisma } from "../db.js";

export const SESSION_IDLE_MS = 2 * 3600_000; // hết hạn sau 2 giờ không hoạt động (cookie Max-Age, gia hạn mỗi request)
export const SESSION_ABSOLUTE_MS = 12 * 3600_000; // tối đa 12 giờ kể từ lúc đăng nhập, dù vẫn hoạt động

export async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  const userId = req.session?.userId;
  if (!Number.isInteger(userId)) return next();

  const tooOld = !(req.session.loginAt > Date.now() - SESSION_ABSOLUTE_MS);
  const user = tooOld ? null : await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, status: true } });
  if (!user || user.status !== "active") {
    delete req.session.userId;
    delete req.session.loginAt;
    return next();
  }
  res.locals.currentUser = { id: user.id, email: user.email, role: user.role };
  next();
}
