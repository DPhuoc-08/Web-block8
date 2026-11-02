# BUILD_LOG — Block 8

Plan: `../block8-plan.md`. Quy ước làm việc: `../CLAUDE.md`. Đề: `../block8.md`.
Hướng làm (đã chốt 02/11/2026): ứng dụng SSR đúng yêu cầu đề, trên database và backend của block7. Giao diện auth theo bản Figma vòng 2 đã duyệt (trang "Block 8 · Đăng nhập" trong file Figma của block7).

## Bước 0 — Khởi tạo repo
**Đã làm:** tạo `Week6/block8/`, `git init` (nhánh `main`), `.gitignore`, `BUILD_LOG.md`.

**Quyết định và lý do:**
- **Repo mới, không tiếp nối lịch sử block7**: mỗi block một repo (yêu cầu của giảng viên). Lịch sử block7 vẫn ở `Week5/block7/`.
- **`.gitignore` tạo trước mọi `npm install`** (bài học block5): tránh VS Code báo vượt 10000 thay đổi.
- Nội dung chép từ block7, bỏ `dist/` (block8 không có SPA build), thêm:
  - `.mail-outbox/`: thư của transport `file` chứa OTP và link đặt lại mật khẩu thật.
  - `*.cookies`, `tmp/`: cookie jar của script kiểm tra chứa `sid` đăng nhập.
  - `.env.*` (đã có) che luôn `.env.test` chứa key thử reCAPTCHA.

**Đã kiểm tra:** `git status` chỉ thấy `.gitignore` và `BUILD_LOG.md`.
