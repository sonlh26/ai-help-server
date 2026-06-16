#!/bin/sh
set -e

echo "==> Đẩy schema vào Postgres (drizzle-kit push)..."
npm run db:push

echo "==> Seed admin đầu tiên (idempotent)..."
npm run seed:admin || echo "seed:admin bỏ qua (đã tồn tại hoặc thiếu env)"

echo "==> Khởi động Next.js..."
exec npm run start
