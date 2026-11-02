-- Chạy MỘT LẦN trên database của block7, sau `prisma db push`:
--   npx prisma db execute --file prisma/sql/setup-search.sql
-- (hoặc dán vào Supabase → SQL Editor).
--
-- pg_trgm: so khớp gần đúng theo nhóm 3 ký tự — dùng cho mode=fuzzy (similarity(), toán tử %).
-- Đặt vào schema `extensions` theo quy ước của Supabase; search_path mặc định đã có `extensions`,
-- nên câu truy vấn gọi similarity() / % không cần ghi tên schema.
-- Full-text (mode=fulltext) dùng to_tsvector/plainto_tsquery có sẵn trong PostgreSQL, không cần extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
