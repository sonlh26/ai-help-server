"""Server-detail data endpoints (disk / services / sites / databases / cron) + actions.
All ownership-scoped via build_decrypted_config. Reads use SSH or aaPanel; writes require_write."""
from __future__ import annotations

import json
import re
import shlex
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.connectors.aapanel import AaPanelConnector
from app.connectors.ssh import SSHConnector
from app.internal_auth import Principal, require_principal, require_write
from app.services import approvals as approvals_svc
from app.services import servers as svc
from app.tools.registry import SERVICE_NAME_RE, ToolExecutor

router = APIRouter(prefix="/servers/{server_id}", tags=["inspect"])


async def _cfg(principal: Principal, server_id: str) -> Dict[str, Any]:
    cfg = await svc.build_decrypted_config(principal, server_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    return cfg


def _ssh(cfg: Dict[str, Any]) -> SSHConnector:
    s = cfg["ssh"]
    if not s["enabled"]:
        raise HTTPException(status_code=400, detail="Server chưa bật SSH.")
    return SSHConnector(
        host=s["host"], port=s["port"], username=s["username"], password=s.get("password"),
        private_key_content=s.get("private_key_content"), key_passphrase=s.get("key_passphrase"),
    )


def _panel(cfg: Dict[str, Any]) -> AaPanelConnector:
    p = cfg["aapanel"]
    if not p["enabled"]:
        raise HTTPException(status_code=400, detail="Server chưa bật aaPanel API.")
    return AaPanelConnector(p["base_url"], p["api_key"] or "", p["verify_ssl"])


def _int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


# ---------- Disk ----------
@router.get("/disk")
async def disk(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    cfg = await _cfg(principal, server_id)
    out = _ssh(cfg).exec(
        "df -PT -B1 -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null", timeout=40
    )
    disks: List[Dict[str, Any]] = []
    total = used = 0
    for line in out["stdout"].splitlines()[1:]:
        parts = line.split()
        if len(parts) < 7:
            continue
        fs, ftype, size_b, used_b, avail_b, pct, mount = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]
        size_i, used_i = _int(size_b), _int(used_b)
        total += size_i
        used += used_i
        disks.append({
            "filesystem": fs, "type": ftype, "mount": mount,
            "total_bytes": size_i, "used_bytes": used_i, "avail_bytes": _int(avail_b),
            "percent": _int(pct.rstrip("%")),
        })
    full = sum(d["used_bytes"] for d in disks if d["percent"] >= 90)
    return {"disks": disks, "total_bytes": total, "used_bytes": used, "free_bytes": total - used, "near_full_bytes": full}


@router.get("/disk/top-dirs")
async def disk_top_dirs(
    server_id: str, path: str = "/", limit: int = 15, principal: Principal = Depends(require_principal)
) -> Dict[str, Any]:
    """Top sub-directories by size under `path` (du -xd1). Slow on large trees → on-demand."""
    if not re.match(r"^/[A-Za-z0-9_./\-]*$", path or ""):
        raise HTTPException(status_code=400, detail="Đường dẫn không hợp lệ (phải là đường dẫn tuyệt đối).")
    limit = max(1, min(int(limit or 15), 50))
    cfg = await _cfg(principal, server_id)
    q = shlex.quote(path.rstrip("/") or "/")
    out = _ssh(cfg).exec(f"du -xd1 -B1 {q} 2>/dev/null | sort -rn | head -n {limit + 1}", timeout=120)
    base = path.rstrip("/") or "/"
    dirs: List[Dict[str, Any]] = []
    biggest = 0
    for line in out["stdout"].splitlines():
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        size_b, dpath = _int(parts[0]), parts[1].strip()
        if dpath == base:  # skip the parent total
            continue
        biggest = max(biggest, size_b)
        dirs.append({"path": dpath, "bytes": size_b})
    for d in dirs:
        d["percent_of_top"] = round(d["bytes"] / biggest * 100) if biggest else 0
    return {"path": base, "dirs": dirs}


class OptimizeIn(BaseModel):
    dry_run: bool = True


@router.post("/disk/optimize")
async def disk_optimize(server_id: str, body: OptimizeIn, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    require_write(principal)
    cfg = await _cfg(principal, server_id)
    result = ToolExecutor(cfg).execute("optimize_disk", {"dry_run": body.dry_run})
    return {"result": result}


# ---------- Services (systemd) ----------
# "Important" = web / database / cache / critical infra services users actually care
# about (keeping sites & apps up). Everything else is hidden by default in the UI.
_IMPORTANT_SERVICES = {
    # web servers
    "nginx", "apache2", "httpd", "openlitespeed", "lshttpd", "caddy", "lighttpd", "tomcat", "tomcat9",
    # databases
    "mysql", "mysqld", "mariadb", "postgresql", "postgres", "mongod", "redis", "redis-server",
    # cache / queue
    "memcached", "rabbitmq-server",
    # ftp / mail
    "pure-ftpd", "vsftpd", "proftpd", "postfix", "dovecot",
    # ssh / container
    "ssh", "sshd", "docker", "containerd",
}
# php-fpm with or without a version suffix: php-fpm, php8.2-fpm, php7.4-fpm…
_IMPORTANT_RE = re.compile(r"^php(\d(\.\d)?)?-fpm$")


def _is_important(name: str) -> bool:
    return name in _IMPORTANT_SERVICES or bool(_IMPORTANT_RE.match(name))


@router.get("/services")
async def services(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    cfg = await _cfg(principal, server_id)
    out = _ssh(cfg).exec(
        "systemctl list-units --type=service --all --no-pager --no-legend --plain 2>/dev/null", timeout=40
    )
    items: List[Dict[str, Any]] = []
    important = 0
    for line in out["stdout"].splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4 or not parts[0].endswith(".service"):
            continue
        unit, load, active, sub = parts[0], parts[1], parts[2], parts[3]
        desc = parts[4] if len(parts) > 4 else ""
        name = unit[:-len(".service")]
        is_imp = _is_important(name)
        if is_imp:
            important += 1
        items.append({
            "name": name, "unit": unit, "load": load,
            "active": active, "sub": sub, "running": active == "active",
            "description": desc, "important": is_imp,
        })
    return {"services": items, "total": len(items), "important_total": important}


class ServiceActionIn(BaseModel):
    name: str
    action: str


@router.post("/services/action")
async def service_action(server_id: str, body: ServiceActionIn, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    require_write(principal)
    if not SERVICE_NAME_RE.match(body.name or ""):
        raise HTTPException(status_code=400, detail="Tên dịch vụ không hợp lệ.")
    if body.action not in ("start", "stop", "restart", "reload"):
        raise HTTPException(status_code=400, detail="Hành động không hợp lệ.")
    cfg = await _cfg(principal, server_id)
    result = ToolExecutor(cfg).execute("service_action", {"name": body.name, "action": body.action})
    return {"result": result}


# ---------- Sites (aaPanel, with SSH fallback) ----------
# Read nginx vhosts directly so the site list still works when the aaPanel API is
# blocked/rate-limited. Covers aaPanel's vhost dir + standard nginx locations.
_SITES_DISCOVERY = r"""
for f in /www/server/panel/vhost/nginx/*.conf /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] || continue
  b=$(basename "$f"); b=${b%.conf}
  case "$b" in 0.*|php*|*default*|ssl) continue;; esac
  sn=$(grep -m1 -oP 'server_name\s+\K[^;]+' "$f" 2>/dev/null | awk '{print $1}')
  dom=${sn:-$b}
  root=$(grep -m1 -oP 'root\s+\K[^;]+' "$f" 2>/dev/null | tr -d ' ')
  if grep -qiE 'fastcgi_pass|php-fpm|[.]php' "$f" 2>/dev/null; then t=PHP; else t=Static; fi
  echo "$dom|$root|$t"
done | sort -u
"""


def _sites_via_ssh(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = _ssh(cfg).exec(_SITES_DISCOVERY, timeout=40)["stdout"]
    rows: List[Dict[str, Any]] = []
    seen = set()
    for line in out.splitlines():
        if "|" not in line:
            continue
        parts = line.split("|")
        dom = parts[0].strip()
        if not dom or dom in seen or dom in ("_", "localhost"):
            continue
        seen.add(dom)
        rows.append({
            "name": dom,
            "type": (parts[2].strip() if len(parts) > 2 else "Website") or "Website",
            "path": parts[1].strip() if len(parts) > 1 else "",
            "status": 1,  # vhost present = serving
        })
    return rows


@router.get("/sites")
async def sites(server_id: str, principal: Principal = Depends(require_principal)) -> Any:
    cfg = await _cfg(principal, server_id)
    # 1) Prefer aaPanel (richer metadata) when it actually returns sites.
    if cfg["aapanel"]["enabled"]:
        try:
            resp = _panel(cfg).sites()
            data = resp.get("data") if isinstance(resp, dict) else resp
            if isinstance(data, list) and data:
                return {"data": data, "total": len(data)}
        except Exception:  # noqa: BLE001
            pass
    # 2) SSH fallback (aaPanel blocked / disabled / empty).
    if cfg["ssh"]["enabled"]:
        try:
            rows = _sites_via_ssh(cfg)
            return {"data": rows, "total": len(rows), "source": "ssh"}
        except Exception:  # noqa: BLE001
            pass
    return {"data": [], "total": 0}


_MYSQL_SYS = {"information_schema", "performance_schema", "mysql", "sys"}
_MONGO_SYS = {"admin", "config", "local"}

# One SSH round-trip discovering databases across engines. Each engine is best-effort
# (missing client / no auth -> empty section, silently skipped). MySQL tries the
# aaPanel-stored root password first, then socket auth — so it works even when the
# aaPanel API itself is rate-limited/blocked. MySQL output is TAB-separated (mysql -B),
# PostgreSQL uses '|'.
_DB_DISCOVERY = """
echo '@@MYSQL@@'
PW=$(cat /www/server/panel/config/mysql_root.pl 2>/dev/null)
MYQ='SELECT table_schema, COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables GROUP BY table_schema'
mysql -uroot ${PW:+-p$PW} -N -B -e "$MYQ" 2>/dev/null || mysql -N -B -e "$MYQ" 2>/dev/null
echo '@@PGSQL@@'
sudo -n -u postgres psql -At -F'|' -c "SELECT datname, pg_database_size(datname) FROM pg_database WHERE NOT datistemplate AND datname<>'postgres'" 2>/dev/null
echo '@@MONGO@@'
mongosh --quiet --eval "print(JSON.stringify(db.adminCommand({listDatabases:1})))" 2>/dev/null || mongo --quiet --eval "print(JSON.stringify(db.adminCommand({listDatabases:1})))" 2>/dev/null
echo '@@END@@'
"""


def _parse_db_ssh(out: str, rows: Dict[str, Dict[str, Any]]) -> None:
    """Merge SSH-discovered databases (MySQL sizes, PostgreSQL, MongoDB) into `rows`
    keyed by 'type:name' (so a MySQL size update merges with the aaPanel metadata row)."""
    section = None
    mongo_buf: List[str] = []
    for line in out.splitlines():
        s = line.strip()
        if s.startswith("@@") and s.endswith("@@"):
            section = s.strip("@")
            continue
        if section in ("MYSQL", "PGSQL"):
            sep = "\t" if section == "MYSQL" else "|"
            if sep not in line:
                continue
            name, size = line.split(sep, 1)
            name = name.strip()
            try:
                size_i = int(size.strip())
            except ValueError:
                size_i = None
            if section == "MYSQL":
                if name in _MYSQL_SYS:
                    continue
                key = f"mysql:{name}"
                if key in rows:
                    rows[key]["size"] = size_i
                else:
                    rows[key] = {"name": name, "type": "mysql", "username": "", "ps": "", "addtime": "", "size": size_i}
            else:
                key = f"postgresql:{name}"
                rows[key] = {"name": name, "type": "postgresql", "username": "", "ps": "", "addtime": "", "size": size_i}
        elif section == "MONGO":
            mongo_buf.append(line)

    blob = "".join(mongo_buf).strip()
    if blob:
        try:
            data = json.loads(blob)
            for d in data.get("databases", []) or []:
                name = d.get("name")
                if not name or name in _MONGO_SYS:
                    continue
                rows[f"mongodb:{name}"] = {
                    "name": name, "type": "mongodb", "username": "", "ps": "",
                    "addtime": "", "size": int(d.get("sizeOnDisk") or 0),
                }
        except (ValueError, AttributeError):
            pass


@router.get("/databases")
async def databases(server_id: str, principal: Principal = Depends(require_principal)) -> Any:
    cfg = await _cfg(principal, server_id)
    rows: Dict[str, Dict[str, Any]] = {}

    # 1) aaPanel MySQL list -> name/user/note/created metadata.
    if cfg["aapanel"]["enabled"]:
        try:
            resp = _panel(cfg).databases()
            data = resp.get("data") if isinstance(resp, dict) else resp
            for r in data or []:
                name = r.get("name")
                if not name:
                    continue
                rows[f"mysql:{name}"] = {
                    "name": name, "type": "mysql",
                    "username": r.get("username") or r.get("user") or "",
                    "ps": r.get("ps") or "",
                    "addtime": r.get("addtime") or "",
                    "size": None,
                }
        except Exception:  # noqa: BLE001
            pass

    # 2) SSH discovery: MySQL sizes + PostgreSQL + MongoDB.
    if cfg["ssh"]["enabled"]:
        try:
            out = _ssh(cfg).exec(_DB_DISCOVERY, timeout=60)["stdout"]
            _parse_db_ssh(out, rows)
        except Exception:  # noqa: BLE001
            pass

    items = sorted(rows.values(), key=lambda x: (x["type"], x["name"]))
    return {"data": items, "total": len(items)}


# ---------- Cron (aaPanel, with SSH fallback) ----------
_CRON_DISCOVERY = r"""
echo '@@USER@@'
crontab -l 2>/dev/null
echo '@@SYS@@'
cat /etc/crontab /etc/cron.d/* 2>/dev/null
echo '@@END@@'
"""


def _parse_cron_line(line: str, has_user: bool):
    """Turn one crontab line into a row, or None (comment / env / malformed).
    System files (/etc/crontab, /etc/cron.d) carry an extra user field after the schedule."""
    s = line.strip()
    if not s or s.startswith("#"):
        return None
    parts = s.split()
    if "=" in parts[0] and not parts[0].startswith("@"):
        return None  # env assignment like SHELL=/bin/sh
    if parts[0].startswith("@"):  # @reboot/@daily/@hourly…
        sched = parts[0]
        rest = parts[1:]
        if has_user and rest:
            rest = rest[1:]
        cmd = " ".join(rest)
    else:
        need = 6 if has_user else 5
        if len(parts) <= need:
            return None
        sched = " ".join(parts[:5])
        cmd = " ".join(parts[need:])
    if not cmd:
        return None
    return {"name": cmd[:100], "where1": sched, "command": cmd, "status": 1}


def _cron_via_ssh(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = _ssh(cfg).exec(_CRON_DISCOVERY, timeout=40)["stdout"]
    rows: List[Dict[str, Any]] = []
    seen = set()
    section = None
    for line in out.splitlines():
        s = line.strip()
        if s in ("@@USER@@", "@@SYS@@", "@@END@@"):
            section = s.strip("@")
            continue
        if section not in ("USER", "SYS"):
            continue
        row = _parse_cron_line(line, has_user=(section == "SYS"))
        if not row:
            continue
        key = f"{row['where1']}|{row['command']}"
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)
    return rows


@router.get("/cron")
async def cron(server_id: str, principal: Principal = Depends(require_principal)) -> Any:
    cfg = await _cfg(principal, server_id)
    if cfg["aapanel"]["enabled"]:
        try:
            resp = _panel(cfg).crontab()
            data = resp.get("data") if isinstance(resp, dict) else resp
            if isinstance(data, list) and data:
                return {"data": data, "total": len(data)}
        except Exception:  # noqa: BLE001
            pass
    if cfg["ssh"]["enabled"]:
        try:
            rows = _cron_via_ssh(cfg)
            return {"data": rows, "total": len(rows), "source": "ssh"}
        except Exception:  # noqa: BLE001
            pass
    return {"data": [], "total": 0}


# ---------- Approvals ("Always allow" rules for this server) ----------
@router.get("/approvals")
async def list_approvals(server_id: str, principal: Principal = Depends(require_principal)) -> Any:
    # Ownership check via the same decryption path (404 if not owned).
    await _cfg(principal, server_id)
    rows = await approvals_svc.list_rows(principal.user_id, server_id)
    return {"data": rows, "total": len(rows)}


@router.delete("/approvals/{approval_id}")
async def delete_approval(server_id: str, approval_id: int, principal: Principal = Depends(require_principal)) -> Any:
    await approvals_svc.delete(approval_id, principal.user_id)
    return {"ok": True}
