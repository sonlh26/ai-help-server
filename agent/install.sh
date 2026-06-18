#!/usr/bin/env bash
# Cài đặt aaPanel AI Agent thành systemd service trên server cần quản lý.
# Chạy TRONG thư mục agent/ (nơi có main.go). Idempotent: chạy lại để cập nhật token/url.
#
# Dùng (lấy GATEWAY_URL + AGENT_TOKEN từ UI: Server → Local Agent → lệnh cài):
#   sudo GATEWAY_URL=https://gw.example.com:8090 AGENT_TOKEN=xxxx bash install.sh
# hoặc:
#   sudo bash install.sh --gateway https://gw.example.com:8090 --token xxxx
set -euo pipefail

GO_VERSION="1.23.4"
BIN=/usr/local/bin/aapanel-ai-agent
UNIT=/etc/systemd/system/aapanel-ai-agent.service
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---- tham số: env hoặc --flags ----
GATEWAY_URL="${GATEWAY_URL:-}"
AGENT_TOKEN="${AGENT_TOKEN:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --gateway) GATEWAY_URL="$2"; shift 2;;
    --token)   AGENT_TOKEN="$2"; shift 2;;
    *) echo "Tham số lạ: $1"; exit 1;;
  esac
done
[ -z "$GATEWAY_URL" ] && read -rp "GATEWAY_URL (vd https://gw.example.com:8090): " GATEWAY_URL
[ -z "$AGENT_TOKEN" ] && read -rp "AGENT_TOKEN (lấy ở UI): " AGENT_TOKEN
[ -z "$GATEWAY_URL" ] || [ -z "$AGENT_TOKEN" ] && { echo "❌ Thiếu GATEWAY_URL hoặc AGENT_TOKEN."; exit 1; }
[ "$(id -u)" = 0 ] || { echo "❌ Cần chạy bằng root (sudo)."; exit 1; }
[ -f "$SRC_DIR/main.go" ] || { echo "❌ Không thấy main.go — hãy chạy trong thư mục agent/."; exit 1; }

# ---- 1) Đảm bảo có Go (tự cài bản chính thức nếu thiếu) ----
if ! command -v go >/dev/null 2>&1; then
  echo "==> Chưa có Go, cài Go ${GO_VERSION}..."
  case "$(uname -m)" in
    x86_64) GA=amd64;; aarch64|arm64) GA=arm64;;
    *) echo "❌ Kiến trúc $(uname -m) chưa hỗ trợ tự cài Go — cài Go thủ công rồi chạy lại."; exit 1;;
  esac
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GA}.tar.gz" -o /tmp/go.tgz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tgz && rm -f /tmp/go.tgz
fi
export PATH="$PATH:/usr/local/go/bin"
echo "==> Go: $(go version)"

# ---- 2) Build binary (stdlib-only, không cần mạng cho deps) ----
echo "==> Build agent..."
( cd "$SRC_DIR" && CGO_ENABLED=0 go build -trimpath -o "$BIN" . )
chmod 755 "$BIN"
echo "    -> $BIN"

# ---- 3) systemd service (token nhúng trong unit, chmod 600 vì chứa secret) ----
echo "==> Tạo systemd service..."
cat > "$UNIT" <<EOF
[Unit]
Description=aaPanel AI Agent (on-server tool bridge)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=GATEWAY_URL=${GATEWAY_URL}
Environment=AGENT_TOKEN=${AGENT_TOKEN}
ExecStart=${BIN}
Restart=always
RestartSec=5
# Agent quản trị server (dịch vụ/đĩa/log...) nên chạy root như panel.
User=root

[Install]
WantedBy=multi-user.target
EOF
chmod 600 "$UNIT"

# ---- 4) Enable + (re)start ----
systemctl daemon-reload
systemctl enable aapanel-ai-agent >/dev/null 2>&1 || true
systemctl restart aapanel-ai-agent

sleep 2
echo "==> Trạng thái:"
systemctl --no-pager --full status aapanel-ai-agent | head -12 || true

cat <<DONE

==================== XONG ====================
Binary : $BIN
Service: aapanel-ai-agent  (đã enable + start)
Gateway: ${GATEWAY_URL}

Lệnh hữu ích:
  journalctl -u aapanel-ai-agent -f      # xem log realtime
  systemctl restart aapanel-ai-agent     # khởi động lại
  systemctl stop aapanel-ai-agent        # dừng
Cập nhật token/url: chạy lại  sudo GATEWAY_URL=.. AGENT_TOKEN=.. bash install.sh
Gỡ cài: systemctl disable --now aapanel-ai-agent && rm -f $UNIT $BIN && systemctl daemon-reload
==============================================
DONE
