-- Trạng thái 5 bảng xác thực khi demo / chụp bằng chứng — CHỈ ĐỌC, đã che:
--   node scripts/run-sql.js prisma/sql/auth-state.sql
-- passwordHash chỉ giữ phần tham số Argon2id; otpHash / tokenHash chỉ 6 ký tự đầu; sid chỉ in "vân tay"
-- (8 ký tự đầu SHA-256 của sid — cùng cách tính với evidence/ nên so được cookie trong Network với bản ghi ở đây).

SELECT id, email, role, status, "emailVerifiedAt",
       regexp_replace("passwordHash", '\$[^$]*\$[^$]*$', '$<salt + hash đã che>') AS "passwordHash"
FROM users ORDER BY id;

SELECT "userId", purpose, left("otpHash", 6) || '…' AS "otpHash", "lastSentAt", "expiresAt", attempts, "usedAt", "lockedUntil"
FROM activation_challenges ORDER BY "userId";

SELECT id, "userId", left("tokenHash", 6) || '…' AS "tokenHash", "createdAt", "expiresAt", "usedAt"
FROM password_resets ORDER BY id DESC LIMIT 20;

-- Phiên đã đăng nhập (có userId); phiên ẩn danh chỉ đếm.
SELECT left(encode(sha256(convert_to(sid, 'UTF8')), 'hex'), 8) AS "vân tay sid", "userId", "createdAt", "expiresAt"
FROM sessions WHERE "userId" IS NOT NULL ORDER BY "createdAt" DESC;
SELECT count(*) AS "phiên ẩn danh (giữ CSRF token của form)" FROM sessions WHERE "userId" IS NULL;

SELECT key, count, "windowStart", "lockedUntil" FROM rate_limits ORDER BY key;
