// Chạy server THẬT (node src/app.js) trong tiến trình con cho script kiểm tra: dừng / chạy lại được để chứng minh
// phiên còn sau khi khởi động lại. Cổng riêng (mặc định 3100) để không đụng server đang dùng ở cổng 3000.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
let proc = null;
let log = "";
// Toàn bộ log của các lần chạy server (để kiểm tra log không chứa mã OTP, mật khẩu, token).
export const serverLog = () => log;

export async function startServer(env = {}) {
  const port = env.PORT ?? process.env.CHECK_PORT ?? "3100";
  const from = log.length; // chỉ xét log của LẦN chạy này (log cộng dồn qua các lần khởi động lại)
  proc = spawn(process.execPath, ["src/app.js"], { cwd: ROOT, env: { ...process.env, ...env, PORT: port }, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  process.env.BASE_URL = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    if (log.slice(from).includes("Server chạy tại")) return;
    if (proc.exitCode !== null) throw new Error(`Server không khởi động được:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server không khởi động sau 10 giây:\n${log}`);
}

export async function stopServer() {
  if (!proc) return;
  const p = proc;
  proc = null;
  await new Promise((resolve) => {
    p.once("exit", resolve);
    p.kill("SIGTERM");
  });
}
