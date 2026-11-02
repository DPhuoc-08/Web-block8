// Store cho express-session lưu phiên trong bảng `sessions` (PostgreSQL) thay cho MemoryStore mặc định.
// MemoryStore nằm trong bộ nhớ tiến trình: khởi động lại server là mất hết phiên, hai server chạy song song không
// thấy phiên của nhau. Ở đây bản ghi nằm trong DB → khởi động lại, cookie sid cũ vẫn tra ra đúng phiên.
// express-session lo cookie (sinh sid ngẫu nhiên, ký, đổi sid khi regenerate); store chỉ đọc / ghi / xoá bản ghi.
import session from "express-session";

export class PrismaSessionStore extends session.Store {
  constructor(prisma) {
    super();
    this.prisma = prisma;
  }

  // Tra sid → dữ liệu phiên. Hết hạn (expiresAt ở server) thì coi như không có, dù cookie trình duyệt còn.
  get(sid, cb) {
    this.prisma.session
      .findUnique({ where: { sid } })
      .then((row) => cb(null, row && row.expiresAt > new Date() ? row.data : null), cb);
  }

  // Ghi phiên. userId tách ra cột riêng để xoá MỌI phiên của một user (đặt lại mật khẩu); null = phiên ẩn danh.
  set(sid, sess, cb) {
    const data = JSON.parse(JSON.stringify(sess)); // Session/Cookie của express-session → JSON thuần cho cột jsonb
    const expiresAt = sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 2 * 3600_000);
    const userId = Number.isInteger(sess.userId) ? sess.userId : null;
    this.prisma.session
      .upsert({ where: { sid }, create: { sid, data, userId, expiresAt }, update: { data, userId, expiresAt } })
      .then(() => cb(null), cb);
  }

  // Huỷ phiên ở server (đăng xuất, regenerate): sau lệnh này mọi bản sao của cookie sid cũ đều vô dụng.
  destroy(sid, cb) {
    this.prisma.session.deleteMany({ where: { sid } }).then(() => cb(null), cb);
  }

  // Gia hạn khi người dùng còn hoạt động (rolling): chỉ đổi hạn, không ghi lại dữ liệu.
  touch(sid, sess, cb) {
    const expiresAt = sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 2 * 3600_000);
    this.prisma.session.updateMany({ where: { sid }, data: { expiresAt } }).then(() => cb(null), cb);
  }
}

// Xoá mọi phiên của một user (sau khi đặt lại mật khẩu). `db` có thể là transaction của Prisma.
export const destroyUserSessions = (db, userId) => db.session.deleteMany({ where: { userId } });
