# AI Help Server — Trợ lý AI quản trị server (self-hosted, mã nguồn mở)

Quản trị server Linux bằng **chat tiếng Việt**: hỏi "vì sao đầy ổ đĩa?", "service nào đang down?",
"top file lớn nhất?"… AI tự gọi công cụ lấy **dữ liệu thật** trên server rồi trả lời (kèm biểu đồ,
markdown, code block). Tự host, tự cắm LLM provider của bạn — **không khoá sau gói trả phí, không mua credit**.

> Sinh ra từ một nỗi bực rất thật: nhiều panel có AI assistant nhưng muốn dùng **custom AI provider**
> thì phải lên PRO, mà mua credit của họ thì… chát. Dự án này cho bạn cắm thẳng **API key của chính mình**
> (OpenAI / Anthropic / bất kỳ API OpenAI-compatible nào) và chạy trên hạ tầng của bạn.

## ✨ Tính năng

- 🤖 **Chat AI gọi tool thật** — kiểm tra/dọn ổ đĩa, services, logs, processes, ports, firewall, website,
  databases (MySQL/PostgreSQL/MongoDB). Streaming + "thinking" + kết quả có cấu trúc (donut dung lượng,
  bảng) + render Markdown/KaTeX.
- 🔑 **Bring-your-own LLM** — OpenAI / Anthropic / OpenAI-compatible. Tự chọn model (tab **Models** liệt kê
  model từ provider của bạn). Không vendor lock-in, không credit.
- 🔐 **2 chế độ kết nối:**
  - **SSH** — lưu credential **mã hóa envelope AES-256-GCM** theo từng user.
  - **Local Agent** — agent Go (1 binary) chạy **trên chính server của bạn**, **creds không rời máy**,
    chỉ chạy **các hàm đã khai báo**; lệnh ngoài/nguy hiểm phải **xác nhận**.
- ✅ **Xác nhận hành động rủi ro** — card *Chỉ-lần-này / Luôn-cho-phép / Từ chối*; quản lý & thu hồi quyền.
- 💬 **ChatOps** — chat với AI **2 chiều qua Telegram**.
- 🛰️ **Đa server, đa người dùng** — invite-only, RBAC (admin / member / viewer).
- 🔔 **Giám sát + cảnh báo** dịch vụ down (Telegram / Email / Webhook).
- 🧩 **aaPanel (tuỳ chọn)** — lấy sites/databases/cron qua aaPanel API, **tự fallback SSH** khi API bị chặn.

## 🖼️ Ảnh chụp

<!-- Thêm ảnh vào docs/ rồi nhúng tại đây, ví dụ:
![Chat AI](docs/chat.png)
![Models](docs/models.png)
![Local Agent](docs/agent.png)
-->

## 🏗️ Kiến trúc (docker compose)

| Service | Stack | Vai trò |
|---|---|---|
| **web** | Next.js 15 + React 19 + Tailwind v4 + Better Auth + Drizzle | Auth, RBAC, UI dashboard + Chat AI, proxy tới api |
| **api** | FastAPI + paramiko + httpx + cryptography | SSH/aaPanel connectors, vault mã hóa, **agent LLM** (tool loop, SSE) |
| **gateway** | FastAPI (long-poll) | Cầu nối api ⇄ **Local Agent** (đăng ký + điều phối tool call) |
| **worker** | api image (`python -m app.worker`) | Giám sát dịch vụ always-on + cảnh báo |
| **db** | PostgreSQL 16 | Better Auth + servers / approvals / alerts / audit… |
| **agent** | Go (1 static binary) | Chạy **trên server của user** — không lưu creds (phân phối riêng, không trong compose) |

`web` và `gateway` là service public; `api` chỉ trong mạng nội bộ compose. web ↔ api dùng
`INTERNAL_SERVICE_TOKEN` + forward `{userId, role}`. Agent **dial-out** tới gateway (chỉ outbound).

## 🚀 Chạy nhanh (Docker)

```bash
cp .env.example .env

# Sinh secret và điền vào .env:
#   APP_MASTER_KEY:          openssl rand -base64 32
#   INTERNAL_SERVICE_TOKEN:  openssl rand -hex 32
#   BETTER_AUTH_SECRET:      openssl rand -hex 32
# Đặt INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD
# Cấu hình LLM_PROVIDER / LLM_BASE_URL / LLM_API_KEY / LLM_MODEL (xem bên dưới)
nano .env

docker compose up -d --build
```

- **Web:** http://localhost:3001 (compose map `3001:3000`). web tự `db:push` schema + seed admin lúc khởi động.
- Đăng nhập admin đã seed → **Admin** mời thêm user (link invite) → **thêm server** (chọn SSH hoặc Local Agent)
  → chat AI, bật giám sát.

> Sau khi sửa code: `docker compose up -d --build <service>` để cập nhật container.

## 🔑 Cấu hình LLM (cắm provider của bạn)

Trong `.env`:

```ini
LLM_PROVIDER=openai          # "openai" (OpenAI-compatible) hoặc "anthropic"
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...           # API key CỦA BẠN
LLM_MODEL=gpt-4o-mini
```

Có thể đổi provider/model trong UI (admin: **Cài đặt → AI**; mỗi user: tab **Models**) — giá trị DB ghi đè env.

## 🔐 Local Agent (không đưa SSH cho ai)

Khi thêm/sửa server, chọn **Cách kết nối → Local Agent**. Sau khi lưu, mở lại để lấy **lệnh cài** (token gắn riêng server).

```bash
cd agent
go build -o aapanel-ai-agent .
# Cross-compile cho VPS Linux:
GOOS=linux GOARCH=amd64 go build -o aapanel-ai-agent .

# Chạy trên server cần quản lý:
GATEWAY_URL=https://<gateway-public> AGENT_TOKEN=<token-từ-UI> ./aapanel-ai-agent
```

Agent **dial-out** tới gateway, chỉ chạy các tool đã khai báo (đĩa/dịch vụ/log/process/port/firewall/website),
tự khai báo capabilities khi kết nối. Chi tiết + systemd: [`agent/README.md`](agent/README.md).

Cần đặt trong `.env`: `AGENT_SECRET` (ký token), `GATEWAY_PUBLIC_URL` (agent kết nối vào). Gateway public ở cổng `8090`.

> Agent **stdlib-only, mã nguồn mở** → bạn đọc đúng những gì nó chạy. Creds không rời máy bạn.

## 💬 ChatOps — Telegram 2 chiều (tuỳ chọn)

Đặt `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 16`), `PUBLIC_BASE_URL` (HTTPS công khai).
Vào tab **ChatOps** → đăng ký webhook → tạo mã → gửi `/link <mã>` cho bot. Sau đó chat với server ngay từ Telegram.

## 🛡️ Bảo mật credential

- Mật khẩu đăng nhập: **hash** (Better Auth).
- SSH/aaPanel creds: **envelope encryption** — mỗi record có DEK ngẫu nhiên (AES-256-GCM), DEK bọc bằng
  `KEK = HKDF-SHA256(APP_MASTER_KEY, salt=user.id)`. Giải mã chỉ ở server (api/worker), **không gửi cho client
  hay đưa vào ngữ cảnh LLM**. Mọi lần giải mã được audit-log.
- **Local Agent** loại bỏ hẳn việc lưu creds: chạy local trên server của bạn.
- Đánh đổi: server + `APP_MASTER_KEY` + DB **kỹ thuật** giải mã được → giữ master key trong secret manager,
  hạn chế host access. Đổi lại: **giám sát 24/7** không cần phiên đăng nhập.

## 🧑‍💻 Phát triển (local, không Docker)

```bash
# api
cd api && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
APP_MASTER_KEY=... INTERNAL_SERVICE_TOKEN=... DATABASE_URL=... uvicorn app.main:app --reload
pytest -q

# web
cd web && npm install && npm run db:push && npm run seed:admin && npm run dev   # http://localhost:3000

# gateway
cd gateway && pip install -r requirements.txt && AGENT_SECRET=... INTERNAL_SERVICE_TOKEN=... uvicorn main:app --port 8090

# agent
cd agent && go build -o aapanel-ai-agent . && go vet ./...
```

## 📁 Cấu trúc

```
web/       Next.js dashboard + Chat AI (app router, components, drizzle schema)
api/       FastAPI: routes (chat, inspect, servers, agent, chatops, misc),
           llm/ (agent loop + client), tools/registry.py, crypto/, connectors/
gateway/   Cầu nối long-poll cho Local Agent
agent/     Agent Go (1 file main.go, stdlib-only)
docker-compose.yml
.env.example
```

## 🗺️ Roadmap / ghi chú

- Rotation `APP_MASTER_KEY` (re-wrap toàn bộ DEK) — cần runbook.
- Lên KMS (hiện dùng env; `api/app/crypto/master_key.py` là điểm tách để migrate).
- Nâng transport agent long-poll → WebSocket/NATS khi scale lên hàng trăm/nghìn agent.
- Release binary agent (cross-compile) để khỏi tự build.

## 📄 License

[MIT](LICENSE) © 2026 sonlh26 — tự do dùng, sửa, phân phối.

---

⭐ Thấy hữu ích thì cho một star nhé. Issue/PR đều hoan nghênh!
