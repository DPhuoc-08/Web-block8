// Chạy NGUYÊN VĂN một file .sql trên database của block7 và in kết quả của từng câu SELECT / EXECUTE.
// Dùng để lấy bằng chứng "query thực hiện tại PostgreSQL" (plan mục 9) và đối chiếu các dòng "Kỳ vọng":
//   node scripts/run-sql.js prisma/sql/search-examples.sql
// `prisma db execute --file` chỉ báo chạy được hay không, không in kết quả → script này gửi cả file bằng
// simple query protocol của `pg` (nhiều câu một lần, mỗi câu một kết quả). Chỉ đọc file do nhóm viết, không nhận input ngoài.
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Cách dùng: node scripts/run-sql.js <file.sql>");
  process.exit(1);
}

const ca = readFileSync(new URL("../certs/supabase-ca.crt", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { ca } });
await client.connect();
try {
  const results = [].concat(await client.query(readFileSync(file, "utf8")));
  let n = 0;
  for (const r of results) {
    if (r.command !== "SELECT" || r.fields.length === 0) continue;
    const cols = r.fields.map((f) => f.name);
    if (cols.length === 1 && cols[0] === "set_config") continue; // dòng đặt ngưỡng pg_trgm, không phải kết quả tìm
    n++;
    console.log(`\n[${n}] ${r.rowCount} dòng — cột: ${cols.join(", ")}`);
    for (const row of r.rows.slice(0, 15)) console.log("   ", cols.map((c) => `${c}=${JSON.stringify(row[c])}`).join("  "));
    if (r.rowCount > 15) console.log(`    … và ${r.rowCount - 15} dòng nữa`);
  }
} finally {
  await client.end();
}
