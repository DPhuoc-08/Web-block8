// Dọn bản ghi hết hạn (plan mục 3.2): phiên đã hết hạn, bộ đếm có cửa sổ và thời gian khoá đều đã qua.
// Chạy khi server khởi động và mỗi 30 phút; lỗi chỉ ghi log (lần sau dọn tiếp), không làm sập server.
import { prisma } from "../db.js";

const EVERY_MS = 30 * 60_000;
const WINDOW_MAX_MS = 60 * 60_000; // cửa sổ dài nhất của các bộ đếm (1 giờ, plan mục 4)

export async function cleanup() {
  const now = new Date();
  const [sessions, limits] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(now - WINDOW_MAX_MS) }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    }),
  ]);
  return { sessions: sessions.count, rateLimits: limits.count };
}

export function startCleanup() {
  const run = () => cleanup().catch((err) => console.error("Dọn phiên / bộ đếm hết hạn thất bại:", err.code ?? err.message));
  run();
  setInterval(run, EVERY_MS).unref();
}
