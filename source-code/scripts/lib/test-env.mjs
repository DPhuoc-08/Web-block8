// Biến môi trường cho script kiểm tra: nạp .env, rồi .env.test GHI ĐÈ (key thử reCAPTCHA của Google chỉ nằm ở .env.test,
// không nằm trong .env dùng khi demo — CLAUDE.md). Server con do startServer chạy nhận lại các biến này
// (dotenv trong app không ghi đè biến đã có sẵn trong môi trường).
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const at = (f) => fileURLToPath(new URL(`../../${f}`, import.meta.url));
dotenv.config({ path: at(".env"), quiet: true });
const test = dotenv.config({ path: at(".env.test"), override: true, quiet: true });
if (test.error) throw new Error("Thiếu source-code/.env.test (key thử reCAPTCHA của Google cho script) — xem README mục Kiểm tra.");
