// Prisma 7 không tự đọc .env, nên nạp bằng dotenv để CLI (db push, db seed) có DATABASE_URL.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node prisma/seed.js",
  },
  // Dùng process.env thay cho env() của Prisma: env() báo lỗi khi thiếu biến,
  // làm `prisma generate` (không cần DB) hỏng lúc chưa có .env.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
