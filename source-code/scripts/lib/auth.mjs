// Client đã đăng nhập bằng tài khoản seed (email + mật khẩu đọc từ .env, không ghi cứng) để vào khu quản trị.
import "dotenv/config";
import { client } from "./client.mjs";

export async function login(c, email, password) {
  await c.get("/login"); // lấy cookie phiên ẩn danh + _csrf của form đăng nhập
  return c.post("/login", [["email", email], ["password", password]]);
}

export async function adminClient() {
  const c = client();
  const res = await login(c, process.env.SEED_ADMIN_EMAIL, process.env.SEED_USER_PASSWORD);
  if (res.status !== 303) throw new Error(`Không đăng nhập được bằng SEED_ADMIN_EMAIL (status ${res.status}) — đã chạy seed chưa?`);
  return c;
}
