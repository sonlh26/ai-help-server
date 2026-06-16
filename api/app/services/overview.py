"""Aggregate a clean per-server overview (gauges/cards) from aaPanel API or SSH.

Parses raw GetSystemTotal/GetDiskInfo/GetNetWork into normalized numbers so the UI
renders gauges instead of raw JSON."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.connectors.aapanel import AaPanelConnector
from app.connectors.ssh import SSHConnector


def _int(v: Any, default: int = 0) -> int:
    try:
        return int(float(str(v).replace("%", "").strip()))
    except (TypeError, ValueError):
        return default


def _ssh(cfg: Dict[str, Any]) -> SSHConnector:
    s = cfg["ssh"]
    return SSHConnector(
        host=s["host"], port=s["port"], username=s["username"], password=s.get("password"),
        private_key_content=s.get("private_key_content"), key_passphrase=s.get("key_passphrase"),
    )


def parse_aapanel(total: Dict[str, Any], disk: Any, net: Dict[str, Any], sites: Any, dbs: Any) -> Dict[str, Any]:
    """Pure parser over raw aaPanel responses (unit-testable, no network)."""
    mem_total = _int(total.get("memTotal"))
    mem_used = _int(total.get("memRealUsed"))
    mem_pct = round(mem_used / mem_total * 100) if mem_total else 0

    disks: List[Dict[str, Any]] = []
    for d in disk if isinstance(disk, list) else []:
        size = d.get("size") or []
        if len(size) >= 4:
            disks.append({
                "path": d.get("path"), "type": d.get("type"),
                "total": size[0], "used": size[1], "avail": size[2], "percent": _int(size[3]),
            })

    load = net.get("load") or {}

    def _count(x: Any) -> int:
        if isinstance(x, dict):
            data = x.get("data")
            return len(data) if isinstance(data, list) else _int(x.get("count"))
        return len(x) if isinstance(x, list) else 0

    return {
        "source": "aapanel",
        "system": {
            "os": total.get("system"), "panel_version": total.get("version"),
            "uptime": total.get("time"), "cpu_cores": _int(total.get("cpuNum")),
            "cpu_percent": _int(total.get("cpuRealUsed")),
            "mem_total_mb": mem_total, "mem_used_mb": mem_used, "mem_percent": mem_pct,
        },
        "load": {"one": load.get("one"), "five": load.get("five"), "fifteen": load.get("fifteen")},
        "disks": disks,
        "network": {
            "up": net.get("up"), "down": net.get("down"),
            "up_total": net.get("upTotal"), "down_total": net.get("downTotal"),
        },
        "sites": {"total": _count(sites)},
        "databases": {"total": _count(dbs)},
        "error": None,
    }


def _from_aapanel(cfg: Dict[str, Any]) -> Dict[str, Any]:
    p = cfg["aapanel"]
    panel = AaPanelConnector(p["base_url"], p["api_key"] or "", p["verify_ssl"])
    total = panel.system_total() or {}
    disk = panel.disk_info() or []
    try:
        net = panel.network() or {}
    except Exception:  # noqa: BLE001
        net = {}
    sites = panel.sites() or {}
    dbs = panel.databases() or {}
    result = parse_aapanel(total, disk, net, sites, dbs)
    # aaPanel API is enabled → it's an aaPanel server (baseline); SSH may refine web_server.
    result["platform"] = {"panel": "aapanel", "web_server": None, "self_configured": False}
    if cfg["ssh"]["enabled"]:
        try:
            facts = _ssh_facts(_ssh(cfg))
            detected = facts.pop("_platform", None)
            if detected:
                result["platform"]["web_server"] = detected.get("web_server")
                if detected.get("panel"):
                    result["platform"]["panel"] = detected["panel"]
            result["system"].update(facts)
        except Exception:  # noqa: BLE001
            pass
    return result


def _ssh_facts(conn: SSHConnector) -> Dict[str, Any]:
    """Returns system facts + a nested "_platform" {panel, web_server, self_configured}
    detected via cheap `test -d`/`command -v` markers (same single SSH exec)."""
    cmd = (
        "echo '#HOST'; hostname; "
        "echo '#KERNEL'; uname -r; "
        "echo '#CPU'; (lscpu 2>/dev/null | grep 'Model name' | head -1 | cut -d: -f2 | xargs || "
        "grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs); "
        "echo '#SWAP'; free -m | awk '/Swap:/{print $2, $3}'; "
        "echo '#PANEL'; if [ -d /www/server/panel ]; then echo aapanel; "
        "elif [ -d /usr/local/cpanel ]; then echo cpanel; "
        "elif [ -d /usr/local/psa ] || [ -d /opt/psa ]; then echo plesk; "
        "elif [ -d /usr/local/directadmin ]; then echo directadmin; "
        "elif [ -d /usr/local/CyberCP ]; then echo cyberpanel; "
        "elif [ -d /etc/webmin ]; then echo webmin; else echo none; fi; "
        "echo '#WEB'; (command -v nginx >/dev/null 2>&1 && echo nginx) || "
        "(command -v apache2 >/dev/null 2>&1 && echo apache) || "
        "(command -v httpd >/dev/null 2>&1 && echo apache) || "
        "(command -v openlitespeed >/dev/null 2>&1 && echo openlitespeed) || echo none"
    )
    out = conn.exec(cmd, timeout=30)["stdout"]
    sec: Dict[str, str] = {}
    cur = None
    for line in out.splitlines():
        if line.startswith("#"):
            cur = line[1:].strip()
            sec[cur] = ""
        elif cur is not None:
            sec[cur] += line + "\n"
    swap = (sec.get("SWAP", "") or "").split()
    panel = (sec.get("PANEL", "").strip() or "none")
    web = (sec.get("WEB", "").strip() or "none")
    return {
        "hostname": (sec.get("HOST", "").strip() or None),
        "kernel": (sec.get("KERNEL", "").strip() or None),
        "cpu_model": (sec.get("CPU", "").strip() or None),
        "swap_total_mb": _int(swap[0]) if len(swap) > 0 else 0,
        "swap_used_mb": _int(swap[1]) if len(swap) > 1 else 0,
        "_platform": {
            "panel": panel if panel != "none" else None,
            "web_server": web if web != "none" else None,
            "self_configured": panel == "none",
        },
    }


def _from_ssh(cfg: Dict[str, Any]) -> Dict[str, Any]:
    conn = _ssh(cfg)
    cmd = (
        "echo '#CORES'; nproc; "
        "echo '#LOAD'; cat /proc/loadavg; "
        "echo '#MEM'; free -m | awk '/Mem:/{print $2, $3}'; "
        "echo '#CPU'; top -bn1 | awk '/Cpu\\(s\\)/{print $2+$4}'; "
        "echo '#UP'; uptime -p 2>/dev/null; "
        "echo '#OS'; (grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'\"' -f2 || uname -sr); "
        "echo '#DISK'; df -P -B1 / | awk 'NR==2{print $2, $3, $5}'"
    )
    out = conn.exec(cmd, timeout=40)["stdout"]
    sections: Dict[str, str] = {}
    cur = None
    for line in out.splitlines():
        if line.startswith("#"):
            cur = line[1:].strip()
            sections[cur] = ""
        elif cur is not None:
            sections[cur] += line + "\n"

    cores = _int(sections.get("CORES", "0"))
    load_parts = (sections.get("LOAD", "") or "").split()
    mem_parts = (sections.get("MEM", "") or "").split()
    mem_total = _int(mem_parts[0]) if len(mem_parts) > 0 else 0
    mem_used = _int(mem_parts[1]) if len(mem_parts) > 1 else 0
    disk_parts = (sections.get("DISK", "") or "").split()
    disk_total = _int(disk_parts[0]) if len(disk_parts) > 0 else 0
    disk_used = _int(disk_parts[1]) if len(disk_parts) > 1 else 0
    disk_pct = _int(disk_parts[2]) if len(disk_parts) > 2 else 0

    def _gb(b: int) -> str:
        return f"{round(b / 1024 ** 3, 1)}G" if b else "0G"

    system = {
        "os": (sections.get("OS", "").strip() or None),
        "panel_version": None,
        "uptime": (sections.get("UP", "").strip() or None),
        "cpu_cores": cores,
        "cpu_percent": _int(sections.get("CPU", "0")),
        "mem_total_mb": mem_total, "mem_used_mb": mem_used,
        "mem_percent": round(mem_used / mem_total * 100) if mem_total else 0,
    }
    platform = None
    try:
        facts = _ssh_facts(conn)
        platform = facts.pop("_platform", None)
        system.update(facts)
    except Exception:  # noqa: BLE001
        pass
    return {
        "source": "ssh",
        "system": system,
        "platform": platform,
        "load": {
            "one": load_parts[0] if len(load_parts) > 0 else None,
            "five": load_parts[1] if len(load_parts) > 1 else None,
            "fifteen": load_parts[2] if len(load_parts) > 2 else None,
        },
        "disks": [{"path": "/", "total": _gb(disk_total), "used": _gb(disk_used), "percent": disk_pct}],
        "network": {},
        "sites": None,
        "databases": None,
        "error": None,
    }


def build_overview(cfg: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if cfg["aapanel"]["enabled"]:
            return _from_aapanel(cfg)
        if cfg["ssh"]["enabled"]:
            return _from_ssh(cfg)
        return {"source": None, "error": "Server chưa bật SSH hoặc aaPanel API."}
    except Exception as exc:  # noqa: BLE001
        return {"source": None, "error": str(exc)}
