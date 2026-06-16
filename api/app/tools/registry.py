"""Định nghĩa các công cụ (tools) mà AI được phép gọi và lớp thực thi chúng."""
from __future__ import annotations

import inspect
import json
import os
import re
import shlex
from typing import Any, Dict, List, Optional

import httpx

from app.connectors.aapanel import AaPanelConnector
from app.connectors.ssh import SSHConnector

SERVICE_NAME_RE = re.compile(r"^[A-Za-z0-9_.@\-]+$")
VALID_ACTIONS = {"status", "start", "stop", "restart", "reload", "enable", "disable"}

# Commands inside run_ssh_command that delete, edit config files, or change system/service
# state → require explicit user confirmation (a confirm card) before executing.
_DESTRUCTIVE_RE = re.compile(
    r"(\brm\b|\brmdir\b|\bunlink\b|\bshred\b|\bmv\b|\bdd\b|\bmkfs|\bfdisk\b|\bparted\b|\btruncate\b|"
    r"\bchmod\b|\bchown\b|\bchattr\b|\bkill\b|\bkillall\b|\bpkill\b|\breboot\b|\bshutdown\b|\bhalt\b|"
    r"\bsed\s+-i|\btee\b|>>?|"
    r"systemctl\s+(stop|restart|disable|kill|mask)|service\s+\S+\s+(stop|restart)|"
    r"\bcrontab\b|\buserdel\b|\busermod\b|\bpasswd\b|\biptables\b|\bufw\b|firewall-cmd|"
    r"apt(-get)?\s+(remove|purge|autoremove)|yum\s+(remove|erase)|dnf\s+remove|"
    r"docker\s+(rm|rmi|stop|kill|prune|system\s+prune)|"
    r"\bdrop\s+(table|database)|\bdelete\s+from\b|\bmysqladmin\b)",
    re.IGNORECASE,
)


def is_risky(name: str, args: Optional[Dict[str, Any]]) -> Optional[str]:
    """Return a Vietnamese reason if this tool call needs confirmation, else None.
    Covers: delete / edit config files / change service or disk state."""
    args = args or {}
    if name == "run_ssh_command":
        cmd = args.get("command", "") or ""
        return "Lệnh SSH có thể xoá/sửa file hoặc đổi trạng thái hệ thống." if _DESTRUCTIVE_RE.search(cmd) else None
    if name == "optimize_disk":
        return "Dọn dẹp & xoá file để giải phóng ổ cứng (thực thi thật)." if args.get("dry_run") is False else None
    if name == "service_action":
        act = args.get("action")
        return f"'{act}' dịch vụ '{args.get('name')}' — đổi trạng thái dịch vụ." if act and act != "status" else None
    if name == "aapanel_service_admin":
        return f"'{args.get('action')}' dịch vụ panel '{args.get('name')}'."
    if name == "aapanel_site_action":
        return f"'{args.get('action')}' website '{args.get('site_name')}'."
    return None


def is_remember_eligible(name: str) -> bool:
    """Whether a risky action may be remembered as "Always". Arbitrary shell
    (run_ssh_command) is NEVER remember-able — undeclared commands always reconfirm."""
    return name != "run_ssh_command"


def approval_key(name: str, args: Optional[Dict[str, Any]]) -> str:
    """Canonical key for an "Always allow" rule, scoped to the action + key args
    (NOT the whole tool). Used to match stored approvals."""
    args = args or {}
    if name == "service_action":
        return f"service_action:{args.get('name')}:{args.get('action')}"
    if name == "aapanel_service_admin":
        return f"aapanel_service_admin:{args.get('name')}:{args.get('action')}"
    if name == "aapanel_site_action":
        return f"aapanel_site_action:{args.get('site_name')}:{args.get('action')}"
    if name == "optimize_disk":
        return "optimize_disk:exec"
    if name == "run_ssh_command":
        # Exact-command scope (only relevant if ever persisted; not remember-eligible).
        return f"run_ssh_command:{(args.get('command') or '').strip()}"
    return name


def approval_label(name: str, args: Optional[Dict[str, Any]]) -> str:
    """Human-readable label for the approvals management UI."""
    reason = is_risky(name, args)
    return reason or name


# Schema dạng "canonical" — sẽ được chuyển sang định dạng OpenAI hoặc Anthropic.
TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "name": "run_ssh_command",
        "description": (
            "Chạy một lệnh shell bất kỳ trên server qua SSH. Dùng cho các tác vụ chưa có công cụ "
            "chuyên biệt. LƯU Ý: với lệnh có tính phá huỷ (xoá file, dừng dịch vụ...) phải hỏi xác "
            "nhận người dùng trước khi chạy."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Lệnh shell cần chạy."},
                "purpose": {"type": "string", "description": "Mục đích ngắn gọn của lệnh."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "check_disk_usage",
        "description": "Kiểm tra dung lượng ổ cứng: bảng df và các thư mục chiếm nhiều dung lượng nhất.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "optimize_disk",
        "description": (
            "Dọn dẹp để giải phóng dung lượng ổ cứng (cache gói cài đặt, log journald cũ, log xoay "
            "vòng .gz, file tạm cũ). Mặc định dry_run=true chỉ xem trước; đặt dry_run=false để thực thi."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dry_run": {
                    "type": "boolean",
                    "description": "true = chỉ liệt kê việc sẽ làm; false = thực thi dọn dẹp.",
                }
            },
        },
    },
    {
        "name": "analyze_disk_usage",
        "description": (
            "Phân tích dung lượng đĩa (DRY-RUN, không xoá gì) và trả về dữ liệu CÓ CẤU TRÚC để hiển thị: "
            "tổng quan phân vùng /, top thư mục chiếm nhiều dung lượng nhất, và ước tính dung lượng có thể "
            "giải phóng an toàn (log cũ > 7 ngày, cache gói cài đặt, docker rác) kèm danh sách mục đề xuất dọn. "
            "Dùng tool này khi người dùng hỏi vì sao đầy đĩa / muốn tối ưu / dọn dẹp. Để THỰC THI dọn dẹp thật, "
            "sau khi người dùng xác nhận hãy gọi optimize_disk với dry_run=false."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "threshold_mb": {
                    "type": "integer",
                    "description": "Ngưỡng tối thiểu (MB) để liệt kê một mục dọn dẹp. Mặc định 100.",
                }
            },
        },
    },
    {
        "name": "list_services",
        "description": "Liệt kê các dịch vụ systemd và trạng thái. Có thể lọc theo từ khoá.",
        "parameters": {
            "type": "object",
            "properties": {
                "filter": {"type": "string", "description": "Từ khoá lọc tên dịch vụ (tuỳ chọn)."}
            },
        },
    },
    {
        "name": "service_action",
        "description": "Xem trạng thái hoặc điều khiển một dịch vụ systemd (status/start/stop/restart/reload/enable/disable).",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Tên dịch vụ, vd: nginx, mysqld, redis."},
                "action": {
                    "type": "string",
                    "enum": sorted(VALID_ACTIONS),
                    "description": "Hành động cần thực hiện.",
                },
            },
            "required": ["name", "action"],
        },
    },
    {
        "name": "tail_logs",
        "description": "Đọc các dòng cuối của một file log.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Đường dẫn file log."},
                "lines": {"type": "integer", "description": "Số dòng cuối cần đọc (mặc định 100)."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "aapanel_info",
        "description": "Lấy thông tin hệ thống từ aaPanel API: tổng quan hệ thống, ổ đĩa, mạng.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "aapanel_sites",
        "description": "Liệt kê các website đang quản lý trong aaPanel.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "aapanel_databases",
        "description": "Liệt kê các database trong aaPanel.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "aapanel_cron_list",
        "description": "Liệt kê các tác vụ định kỳ (crontab) trong aaPanel.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "aapanel_service_admin",
        "description": "Điều khiển dịch vụ do aaPanel quản lý (nginx, mysqld, php, redis, pure-ftpd...). action: start/stop/restart/reload.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Tên dịch vụ panel quản lý."},
                "action": {"type": "string", "enum": ["start", "stop", "restart", "reload"]},
            },
            "required": ["name", "action"],
        },
    },
    {
        "name": "aapanel_site_action",
        "description": "Bật hoặc tắt một website trong aaPanel (cần site_id và site_name lấy từ aapanel_sites). action: start/stop.",
        "parameters": {
            "type": "object",
            "properties": {
                "site_id": {"description": "ID website (từ aapanel_sites)."},
                "site_name": {"type": "string", "description": "Tên website."},
                "action": {"type": "string", "enum": ["start", "stop"]},
            },
            "required": ["site_id", "site_name", "action"],
        },
    },
    {
        "name": "aapanel_ssl_info",
        "description": "Xem thông tin chứng chỉ SSL của một website (ngày hết hạn...).",
        "parameters": {
            "type": "object",
            "properties": {"site_name": {"type": "string", "description": "Tên website."}},
            "required": ["site_name"],
        },
    },
    {
        "name": "get_system_resources",
        "description": "Lấy nhanh tài nguyên hệ thống qua SSH: load average, CPU cores, RAM (dùng/tổng), disk /, uptime, OS.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_top_processes",
        "description": "Top tiến trình theo CPU và theo RAM (qua SSH). Dùng để chẩn đoán tiến trình ngốn tài nguyên.",
        "parameters": {
            "type": "object",
            "properties": {"count": {"type": "integer", "description": "Số tiến trình mỗi bảng (mặc định 10)."}},
        },
    },
    {
        "name": "list_listening_ports",
        "description": "Liệt kê các cổng đang lắng nghe và tiến trình tương ứng (ss -tlnp) qua SSH.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_website_config",
        "description": "Đọc file cấu hình nginx (fallback apache) của một website qua SSH. Dùng để chẩn đoán 403/502/rewrite/SSL.",
        "parameters": {
            "type": "object",
            "properties": {"domain": {"type": "string", "description": "Tên miền website."}},
            "required": ["domain"],
        },
    },
    {
        "name": "get_website_access_logs",
        "description": "Đọc log truy cập gần đây của một website (/www/wwwlogs/<domain>.log) qua SSH.",
        "parameters": {
            "type": "object",
            "properties": {
                "domain": {"type": "string", "description": "Tên miền website."},
                "lines": {"type": "integer", "description": "Số dòng cuối (mặc định 100)."},
            },
            "required": ["domain"],
        },
    },
    {
        "name": "get_ssh_login_logs",
        "description": "Xem lịch sử/đăng nhập SSH gần đây và các lần đăng nhập thất bại (last + log auth) qua SSH. Dùng dò brute-force.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_firewall_rules",
        "description": "Liệt kê quy tắc tường lửa hiện tại (ufw / firewalld / iptables) qua SSH.",
        "parameters": {"type": "object", "properties": {}},
    },
]


# Tools the Local Agent implements (Go). In agent-mode the LLM is only offered these —
# no aaPanel_* (agent has no panel API) and no run_ssh_command (arbitrary shell).
AGENT_TOOLS = {
    "check_disk_usage",
    "optimize_disk",
    "analyze_disk_usage",
    "list_services",
    "service_action",
    "tail_logs",
    "get_system_resources",
    "get_top_processes",
    "list_listening_ports",
    "get_website_config",
    "get_website_access_logs",
    "get_ssh_login_logs",
    "get_firewall_rules",
}


def tool_schemas_for(connection_type: str, caps: Optional[set] = None) -> List[Dict[str, Any]]:
    """In agent-mode, restrict the offered tools to what the agent can run. If `caps`
    (the live agent's declared tools) is given, intersect with it — so an older agent
    is only offered what it actually supports (handles version skew)."""
    if connection_type != "agent":
        return TOOL_SCHEMAS
    allowed = AGENT_TOOLS if caps is None else (AGENT_TOOLS & set(caps))
    return [t for t in TOOL_SCHEMAS if t["name"] in allowed]


def agent_capabilities(server_id: str) -> Optional[set]:
    """Ask the gateway which tools the connected agent declared. None if unknown/offline."""
    base = os.environ.get("GATEWAY_INTERNAL_URL", "http://gateway:8090").rstrip("/")
    token = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    try:
        with httpx.Client(timeout=8) as c:
            r = c.get(f"{base}/capabilities/{server_id}", headers={"X-Internal-Token": token})
        d = r.json()
        if d.get("online") and isinstance(d.get("tools"), list) and d["tools"]:
            return set(d["tools"])
    except Exception:  # noqa: BLE001
        pass
    return None


def _fmt(data: Any) -> str:
    if isinstance(data, str):
        return data
    return json.dumps(data, ensure_ascii=False, default=str)


# ---- Disk-usage analysis: parse raw shell output into a structured result ----
_UNIT = {"": 1, "K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4, "P": 1024**5}
_HUMAN_RE = re.compile(r"([\d.]+)\s*([KMGTP]?)i?B?", re.IGNORECASE)


def _human_to_bytes(s: str) -> int:
    m = _HUMAN_RE.search(s or "")
    if not m:
        return 0
    try:
        val = float(m.group(1))
    except ValueError:
        return 0
    return int(val * _UNIT.get(m.group(2).upper(), 1))


def _bytes_label(n: int) -> str:
    n = max(0, int(n))
    if n >= 1024**3:
        return f"{n / 1024**3:.1f} GB"
    if n >= 1024**2:
        return f"{n / 1024**2:.1f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def parse_disk_analysis(out: str, threshold: int) -> Dict[str, Any]:
    """Turn the delimited @@SECTION@@ shell output into the structured payload the UI renders."""
    sections: Dict[str, List[str]] = {}
    cur: Optional[str] = None
    for line in out.splitlines():
        stripped = line.strip()
        if stripped.startswith("@@") and stripped.endswith("@@"):
            cur = stripped.strip("@")
            sections[cur] = []
        elif cur is not None:
            sections[cur].append(line)

    # df -B1 /  ->  Filesystem 1B-blocks Used Available Use% Mounted-on
    total = used = 0
    percent = 0.0
    for l in sections.get("DF", []):
        f = l.split()
        if len(f) >= 5:
            try:
                total, used, percent = int(f[1]), int(f[2]), float(f[4].rstrip("%"))
            except ValueError:
                pass
            break

    # du -xb -d1 /  ->  "<bytes>\t<path>"
    dirs: List[Dict[str, Any]] = []
    for l in sections.get("TOP", []):
        parts = l.split("\t") if "\t" in l else l.split(None, 1)
        if len(parts) < 2:
            continue
        try:
            b = int(parts[0])
        except ValueError:
            continue
        path = parts[1].strip()
        if path in ("/", ""):
            continue
        dirs.append({"path": path, "bytes": b})
    dirs.sort(key=lambda x: x["bytes"], reverse=True)
    top_dirs = [
        {
            "path": d["path"],
            "size": _bytes_label(d["bytes"]),
            "percent": round(d["bytes"] / total * 100, 1) if total else 0.0,
        }
        for d in dirs[:6]
    ]

    def _first_int(key: str) -> int:
        for l in sections.get(key, []):
            l = l.strip()
            if l.isdigit():
                return int(l)
        return 0

    logs7d = _first_int("LOGS")
    apt = _first_int("APT")
    docker_b = 0
    for l in sections.get("DOCKER", []):
        m = re.search(r"([\d.]+\s*[KMGT]?B)\s*(?:\([^)]*\))?\s*$", l.strip())
        if m:
            docker_b += _human_to_bytes(m.group(1))

    rec_items: List[Dict[str, Any]] = []
    if logs7d > 0:
        rec_items.append({"label": "Log files (older than 7 days)", "size": _bytes_label(logs7d)})
    if docker_b > 0:
        rec_items.append({"label": "Docker system (dangling)", "size": _bytes_label(docker_b)})
    if apt > 0:
        rec_items.append({"label": "Package cache", "size": _bytes_label(apt)})
    reclaimable_total = logs7d + docker_b + apt

    items: List[Dict[str, Any]] = []
    for l in sections.get("ITEMS", []):
        if "\t" not in l:
            continue
        sz, path = l.split("\t", 1)
        try:
            b = int(sz)
        except ValueError:
            continue
        if b < threshold:
            continue
        items.append(
            {
                "id": len(items) + 1,
                "type": "Log file",
                "path": path.strip(),
                "size": _bytes_label(b),
                "action": "Xóa (older than 7 days)",
                "safe": True,
            }
        )

    return {
        "tool": "analyze_disk_usage",
        "mode": "dry-run",
        "summary": {
            "total": _bytes_label(total),
            "used": _bytes_label(used),
            "used_percent": round(percent, 1),
        },
        "top_dirs": top_dirs,
        "reclaimable": {
            "total": _bytes_label(reclaimable_total),
            "total_bytes": reclaimable_total,
            "items": rec_items,
        },
        "cleanup_items": items,
        "note": "Phân tích dry-run, chưa xoá gì. Cần người dùng xác nhận trước khi thực thi dọn dẹp.",
    }


class ToolExecutor:
    """Giữ config hiện tại và thực thi các tool theo tên."""

    def __init__(self, cfg: Dict[str, Any]) -> None:
        self.cfg = cfg

    # ---- Tạo connector từ config ----
    def _ssh(self) -> SSHConnector:
        s = self.cfg.get("ssh", {})
        if not s.get("enabled"):
            raise RuntimeError("SSH chưa được bật trong cấu hình.")
        return SSHConnector(
            host=s.get("host", ""),
            port=s.get("port", 22),
            username=s.get("username", "root"),
            password=s.get("password") or None,
            private_key_content=s.get("private_key_content") or None,
            private_key_path=s.get("private_key_path") or None,
            key_passphrase=s.get("key_passphrase") or None,
        )

    def _panel(self) -> AaPanelConnector:
        p = self.cfg.get("aapanel", {})
        if not p.get("enabled"):
            raise RuntimeError("aaPanel API chưa được bật trong cấu hình.")
        return AaPanelConnector(
            base_url=p.get("base_url", ""),
            api_key=p.get("api_key", ""),
            verify_ssl=p.get("verify_ssl", False),
        )

    # ---- Dispatch ----
    def execute(self, name: str, args: Dict[str, Any]) -> str:
        args = args or {}
        # Agent-mode: dispatch the tool to the on-server agent via the gateway
        # (no local SSH/creds). The agent runs only its declared functions.
        if self.cfg.get("connection_type") == "agent":
            return self._dispatch_agent(name, args)
        handler = getattr(self, f"_tool_{name}", None)
        if handler is None:
            return _fmt({"error": f"Không có công cụ tên '{name}'."})
        # LLM thường thêm tham số "thừa" (vd reason/purpose) không có trong schema. Lọc chỉ giữ
        # tham số handler thực sự nhận, tránh TypeError "unexpected keyword argument".
        try:
            params = inspect.signature(handler).parameters
            has_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values())
            call_args = args if has_var_kw else {k: v for k, v in args.items() if k in params}
            return _fmt(handler(**call_args))
        except TypeError as exc:
            return _fmt({"error": f"Tham số không hợp lệ cho '{name}': {exc}"})
        except Exception as exc:  # noqa: BLE001
            return _fmt({"error": str(exc)})

    def _dispatch_agent(self, name: str, args: Dict[str, Any]) -> str:
        """Send the tool call to the on-server agent through the gateway and return its output."""
        base = os.environ.get("GATEWAY_INTERNAL_URL", "http://gateway:8090").rstrip("/")
        token = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
        try:
            with httpx.Client(timeout=70) as c:
                r = c.post(
                    base + "/dispatch",
                    headers={"X-Internal-Token": token},
                    json={"server_id": self.cfg.get("id"), "tool": name, "args": args},
                )
            d = r.json()
        except Exception as exc:  # noqa: BLE001
            return _fmt({"error": f"Không gọi được agent gateway: {exc}"})
        if d.get("ok"):
            return _fmt(d.get("result"))
        return _fmt({"error": d.get("error") or "Agent lỗi hoặc offline."})

    # ---- Các tool ----
    def _tool_run_ssh_command(self, command: str, purpose: Optional[str] = None) -> Any:
        return self._ssh().exec(command, timeout=120)

    def _tool_check_disk_usage(self) -> Any:
        cmd = (
            "echo '=== DF ==='; df -hT 2>/dev/null; "
            "echo '=== INODES ==='; df -i 2>/dev/null | head -20; "
            "echo '=== TOP THƯ MỤC (/) ==='; "
            "du -xhd1 / 2>/dev/null | sort -rh | head -15; "
            "echo '=== TOP THƯ MỤC (/var) ==='; "
            "du -xhd1 /var 2>/dev/null | sort -rh | head -10"
        )
        return self._ssh().exec(cmd, timeout=120)

    def _tool_optimize_disk(self, dry_run: bool = True) -> Any:
        if dry_run:
            return {
                "dry_run": True,
                "se_lam": [
                    "apt-get clean / yum clean all (xoá cache gói cài đặt)",
                    "journalctl --vacuum-time=7d (giữ log journald 7 ngày)",
                    "xoá log xoay vòng cũ (*.gz, *.1) trong /var/log",
                    "xoá file tạm trong /tmp cũ hơn 7 ngày",
                ],
                "ghi_chu": "Gọi lại với dry_run=false để thực hiện. Nên xác nhận với người dùng trước.",
            }
        script = (
            "set +e; "
            "command -v apt-get >/dev/null && apt-get clean -y; "
            "command -v yum >/dev/null && yum clean all; "
            "command -v journalctl >/dev/null && journalctl --vacuum-time=7d; "
            "find /var/log -type f \\( -name '*.gz' -o -name '*.1' -o -name '*.old' \\) -delete 2>/dev/null; "
            "find /tmp -type f -atime +7 -delete 2>/dev/null; "
            "echo '=== Dung lượng sau khi dọn ==='; df -hT"
        )
        result = self._ssh().exec(script, timeout=180)
        result["dry_run"] = False
        return result

    def _tool_analyze_disk_usage(self, threshold_mb: int = 100) -> Any:
        threshold = max(0, int(threshold_mb or 100)) * 1024 * 1024
        # One round-trip; sections are delimited so we can parse server-side into structured JSON.
        script = (
            "echo '@@DF@@'; df -B1 / 2>/dev/null | tail -1; "
            "echo '@@TOP@@'; du -xb -d1 / 2>/dev/null | sort -rn | head -12; "
            "echo '@@LOGS@@'; find /var/log -type f -mtime +7 "
            "\\( -name '*.gz' -o -name '*.[0-9]' -o -name '*.old' \\) -printf '%s\\n' 2>/dev/null "
            "| awk '{s+=$1} END{print s+0}'; "
            "echo '@@APT@@'; du -sb /var/cache/apt/archives /var/cache/yum 2>/dev/null "
            "| awk '{s+=$1} END{print s+0}'; "
            "echo '@@DOCKER@@'; docker system df 2>/dev/null | tail -n +2; "
            "echo '@@ITEMS@@'; find /var/log -type f -mtime +7 "
            "\\( -name '*.gz' -o -name '*.[0-9]' -o -name '*.old' \\) -printf '%s\\t%p\\n' 2>/dev/null "
            "| sort -rn | head -8; "
            "echo '@@END@@'"
        )
        result = self._ssh().exec(script, timeout=120)
        out = result.get("stdout", "") if isinstance(result, dict) else str(result)
        return parse_disk_analysis(out, threshold)

    def _tool_list_services(self, filter: Optional[str] = None) -> Any:  # noqa: A002
        cmd = "systemctl list-units --type=service --all --no-pager --no-legend"
        if filter:
            cmd += " | grep -i " + shlex.quote(filter)
        return self._ssh().exec(cmd, timeout=60)

    def _tool_service_action(self, name: str, action: str) -> Any:
        if not SERVICE_NAME_RE.match(name or ""):
            raise ValueError(f"Tên dịch vụ không hợp lệ: {name!r}")
        if action not in VALID_ACTIONS:
            raise ValueError(f"Hành động không hợp lệ: {action!r}")
        safe = shlex.quote(name)
        if action == "status":
            cmd = f"systemctl is-active {safe}; echo '---'; systemctl status {safe} --no-pager -l | head -25"
        else:
            cmd = f"systemctl {action} {safe}; echo '--- trạng thái sau lệnh ---'; systemctl is-active {safe}"
        return self._ssh().exec(cmd, timeout=90)

    def _tool_tail_logs(self, path: str, lines: int = 100) -> Any:
        lines = max(1, min(int(lines or 100), 1000))
        cmd = f"tail -n {lines} {shlex.quote(path)}"
        return self._ssh().exec(cmd, timeout=60)

    def _tool_aapanel_info(self) -> Any:
        panel = self._panel()
        return {
            "system": panel.system_total(),
            "disk": panel.disk_info(),
            "network": panel.network(),
        }

    def _tool_aapanel_sites(self) -> Any:
        return self._panel().sites()

    def _tool_aapanel_databases(self) -> Any:
        return self._panel().databases()

    def _tool_aapanel_cron_list(self) -> Any:
        return self._panel().crontab()

    def _tool_aapanel_service_admin(self, name: str, action: str) -> Any:
        if not SERVICE_NAME_RE.match(name or ""):
            raise ValueError(f"Tên dịch vụ không hợp lệ: {name!r}")
        if action not in ("start", "stop", "restart", "reload"):
            raise ValueError(f"Hành động không hợp lệ: {action!r}")
        return self._panel().service_admin(name, action)

    def _tool_aapanel_site_action(self, site_id: Any, site_name: str, action: str) -> Any:
        if action not in ("start", "stop"):
            raise ValueError(f"Hành động không hợp lệ: {action!r}")
        return self._panel().site_action(site_id, site_name, action)

    def _tool_aapanel_ssl_info(self, site_name: str) -> Any:
        return self._panel().ssl_info(site_name)

    # ---- Thông tin/handle qua SSH (đáng tin cậy trên mọi server Linux) ----
    def _tool_get_system_resources(self) -> Any:
        cmd = (
            "echo '=== LOAD/UPTIME ==='; uptime; "
            "echo '=== CPU CORES ==='; nproc; "
            "echo '=== MEM ==='; free -h; "
            "echo '=== DISK / ==='; df -hT /; "
            "echo '=== OS ==='; (cat /etc/os-release 2>/dev/null | grep PRETTY_NAME || uname -a)"
        )
        return self._ssh().exec(cmd, timeout=40)

    def _tool_get_top_processes(self, count: int = 10) -> Any:
        n = max(1, min(int(count or 10), 30))
        cmd = (
            f"echo '=== TOP {n} CPU ==='; ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n {n + 1}; "
            f"echo '=== TOP {n} MEM ==='; ps -eo pid,user,%cpu,%mem,comm --sort=-%mem | head -n {n + 1}"
        )
        return self._ssh().exec(cmd, timeout=40)

    def _tool_list_listening_ports(self) -> Any:
        cmd = "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null"
        return self._ssh().exec(cmd, timeout=40)

    def _tool_get_website_config(self, domain: str) -> Any:
        if not re.match(r"^[A-Za-z0-9_.\-]+$", domain or ""):
            raise ValueError(f"Tên miền không hợp lệ: {domain!r}")
        d = shlex.quote(domain)
        cmd = (
            f"for f in /www/server/panel/vhost/nginx/{d}.conf "
            f"/www/server/panel/vhost/apache/{d}.conf; do "
            f"if [ -f \"$f\" ]; then echo \"==== $f ====\"; cat \"$f\"; fi; done; "
            f"echo '(nếu trống: kiểm tra lại domain bằng aapanel_sites)'"
        )
        return self._ssh().exec(cmd, timeout=40)

    def _tool_get_website_access_logs(self, domain: str, lines: int = 100) -> Any:
        if not re.match(r"^[A-Za-z0-9_.\-]+$", domain or ""):
            raise ValueError(f"Tên miền không hợp lệ: {domain!r}")
        n = max(1, min(int(lines or 100), 1000))
        log = shlex.quote(f"/www/wwwlogs/{domain}.log")
        cmd = f"tail -n {n} {log} 2>/dev/null || echo 'Không tìm thấy log (kiểm tra domain).'"
        return self._ssh().exec(cmd, timeout=40)

    def _tool_get_ssh_login_logs(self) -> Any:
        cmd = (
            "echo '=== ĐĂNG NHẬP GẦN ĐÂY ==='; last -n 30 2>/dev/null | head -30; "
            "echo '=== THẤT BẠI GẦN ĐÂY ==='; "
            "(grep -i 'failed password' /var/log/auth.log 2>/dev/null || "
            "grep -i 'failed password' /var/log/secure 2>/dev/null || "
            "journalctl _COMM=sshd 2>/dev/null | grep -i fail) | tail -30"
        )
        return self._ssh().exec(cmd, timeout=40)

    def _tool_get_firewall_rules(self) -> Any:
        cmd = (
            "if command -v ufw >/dev/null; then echo '=== UFW ==='; ufw status verbose; "
            "elif command -v firewall-cmd >/dev/null; then echo '=== FIREWALLD ==='; firewall-cmd --list-all; "
            "else echo '=== IPTABLES ==='; iptables -L -n --line-numbers; fi"
        )
        return self._ssh().exec(cmd, timeout=40)
