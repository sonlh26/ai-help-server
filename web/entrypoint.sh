#!/bin/sh
set -e

echo "==> Chờ PostgreSQL sẵn sàng (DATABASE_URL)..."
node -e "
const { Pool } = require('pg');
(async () => {
  for (let i = 1; i <= 30; i++) {
    const p = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    try { await p.query('select 1'); await p.end(); console.log('DB OK'); process.exit(0); }
    catch (e) { await p.end().catch(()=>{}); console.log('  chờ DB... ('+i+'/30) '+e.code); await new Promise(r=>setTimeout(r,2000)); }
  }
  console.error('Không kết nối được PostgreSQL sau 60s. Kiểm tra DATABASE_URL.'); process.exit(1);
})();
"

echo "==> Đẩy schema vào Postgres (drizzle-kit push)..."
npm run db:push

echo "==> Seed admin đầu tiên (idempotent)..."
npm run seed:admin || echo "seed:admin bỏ qua (đã tồn tại hoặc thiếu env)"

echo "==> Khởi động Next.js..."
exec npm run start
