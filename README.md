# AI Server Manager — aaPanel Dashboard + AI

Ứng dụng web đa người dùng quản lý server **aaPanel (8.0.3+)** kèm **trợ lý AI** hỗ trợ kỹ thuật
bằng ngôn ngữ tự nhiên. Đăng nhập **invite-only**, phân quyền (admin/member/viewer). Mỗi tài khoản
lưu credential SSH/aaPanel **mã hóa theo user.id** (envelope AES-256-GCM) — người ngoài không đọc được.

> ⚠️ aaPanel 8.0.3 KHÔNG mở API gọi các AI Skill/Agent nội bộ từ xa. App **tự xây agent AI** chạy
> trên **HTTP API của aaPanel + SSH**, và tái tạo các "skill" chẩn đoán (SSL/DB/Website/Log/Service/
> Performance/Security/Disk...) thành preset.

## Kiến trúc (hybrid, docker compose)
| Service | Stack | Vai trò |
|---|---|---|
| **web** | Next.js 15 + Better Auth + Drizzle + Tailwind | Auth, RBAC, UI dashboard, proxy tới api |
| **api** | FastAPI + paramiko + httpx + cryptography | SSH/aaPanel connectors, vault mã hóa, LLM agent, tools |
| **db** | PostgreSQL 16 | Better Auth + servers/alerts/audit... |
| **worker** | api image (`python -m app.worker`) | Giám sát dịch vụ always-on + cảnh báo |

`web` là service duy nhất expose ra ngoài. `api` chỉ trong mạng nội bộ compose, web gọi qua
internal token (`INTERNAL_SERVICE_TOKEN`) + forward `{userId, role}`.

## Bảo mật credential
- Mật khẩu đăng nhập: **hash** (Better Auth).
- SSH/aaPanel creds: **mã hóa 2 chiều** — mỗi record có DEK ngẫu nhiên (AES-256-GCM), DEK bọc bằng
  `KEK = HKDF-SHA256(APP_MASTER_KEY, salt=user.id)`. Giải mã chỉ ở server (api/worker), không bao giờ
  gửi cho client hay đưa vào ngữ cảnh LLM.
- Đánh đổi: server + `APP_MASTER_KEY` + DB (gồm admin có host access) **kỹ thuật** giải mã được →
  bù bằng: giữ master key trong secret manager, hạn chế host access, audit log mọi lần giải mã.
  Đổi lại: **giám sát chạy 24/7** không cần phiên đăng nhập.

## Chạy
```bash
cp .env.example .env
# Sinh secret:
#   APP_MASTER_KEY:          openssl rand -base64 32
#   INTERNAL_SERVICE_TOKEN:  openssl rand -hex 32
#   BETTER_AUTH_SECRET:      openssl rand -hex 32
# Đặt INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD, cấu hình LLM_* (OpenAI hoặc Anthropic).
nano .env

docker compose up -d --build
# web: http://localhost:3000  (web tự push schema + seed admin lúc khởi động)
```
Đăng nhập bằng tài khoản admin đã seed → vào **Admin** mời thêm user (sinh link invite) →
thêm server (nhập SSH/aaPanel) → xem dashboard, chat AI, bật giám sát.

## Phát triển (local, không Docker)
- **api**: `cd api && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`
  rồi `APP_MASTER_KEY=... INTERNAL_SERVICE_TOKEN=... DATABASE_URL=... uvicorn app.main:app --reload`.
  Test crypto: `PYTHONPATH=. pytest tests/`.
- **web**: `cd web && npm install && npm run db:push && npm run seed:admin && npm run dev`.

## LLM
Cấu hình qua env ở `api`: `LLM_PROVIDER` = `openai` (OpenAI-compatible) hoặc `anthropic`;
`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

## Kế hoạch / tài liệu
Xem `plans/260615-aapanel-ai-mgmt-dashboard/` (plan.md + 8 phase + research).

## Vấn đề còn mở
- Rotation `APP_MASTER_KEY` (re-wrap toàn bộ DEK) — runbook cần bổ sung.
- Lên KMS (hiện env; `app/crypto/master_key.py` là điểm tách để migrate).
- Test kết nối SSH/aaPanel thật cần server thật (chưa có trong CI).
