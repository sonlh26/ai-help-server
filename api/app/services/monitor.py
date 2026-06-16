"""Always-on monitoring. Worker decrypts creds via APP_MASTER_KEY (no session needed),
checks systemd services per server, records alerts + service_status, notifies on down."""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from app import db
from app.config import settings
from app.connectors.ssh import SSHConnector
from app.crypto.envelope import decrypt_secret
from app.services import notify, settings as settings_svc


def _loads(v: Any) -> Any:
    if v is None:
        return None
    return json.loads(v) if isinstance(v, str) else v


def _ssh_for_row(row) -> SSHConnector:
    secrets = _loads(row["secrets"]) or {}

    def dec(key: str) -> Optional[str]:
        blob = secrets.get(key)
        return decrypt_secret(blob) if blob else None

    return SSHConnector(
        host=row["ssh_host"] or "", port=row["ssh_port"] or 22, username=row["ssh_username"] or "root",
        password=dec("ssh_password"), private_key_content=dec("ssh_private_key"),
        key_passphrase=dec("ssh_key_passphrase"),
    )


async def _owner_email(user_id: str) -> str:
    try:
        row = await db.fetchrow('SELECT email FROM "user" WHERE id = $1', user_id)
        return row["email"] if row else ""
    except Exception:  # noqa: BLE001
        return ""


async def _record_transition(row, svc_name: str, active: bool) -> None:
    server_id, user_id, name = row["id"], row["user_id"], row["name"]
    prev = await db.fetchrow(
        "SELECT active FROM service_status WHERE server_id = $1 AND name = $2", server_id, svc_name
    )
    was_active = prev["active"] if prev else None
    await db.execute(
        """INSERT INTO service_status (server_id, name, active, checked_at, since)
           VALUES ($1,$2,$3, now(), now())
           ON CONFLICT (server_id, name) DO UPDATE
             SET active = EXCLUDED.active, checked_at = now(),
                 since = CASE WHEN service_status.active IS DISTINCT FROM EXCLUDED.active
                              THEN now() ELSE service_status.since END""",
        server_id, svc_name, active,
    )
    alert = None
    if was_active is None and not active:
        alert = ("error", f"Dịch vụ '{svc_name}' đang KHÔNG hoạt động.")
    elif was_active and not active:
        alert = ("error", f"Dịch vụ '{svc_name}' vừa bị NGẮT (down).")
    elif was_active is False and active:
        alert = ("info", f"Dịch vụ '{svc_name}' đã hoạt động trở lại.")
    if alert:
        level, msg = alert
        await db.execute(
            "INSERT INTO alerts (server_id, user_id, level, message, created_at) VALUES ($1,$2,$3,$4, now())",
            server_id, user_id, level, f"[{name}] {msg}",
        )
        if level == "error":
            ncfg = await settings_svc.notify_config()
            notify.notify_alert(ncfg, level, f"[{name}] {msg}", await _owner_email(user_id))


async def check_server(row) -> None:
    services: List[str] = _loads(row["monitor_services"]) or []
    if not services:
        return
    ssh = _ssh_for_row(row)
    for svc_name in services:
        try:
            res = await asyncio.to_thread(ssh.exec, f"systemctl is-active {svc_name}", 20)
            active = res["stdout"].strip() == "active"
        except Exception:  # noqa: BLE001
            active = False
        await _record_transition(row, svc_name, active)


async def run_once() -> None:
    rows = await db.fetch(
        "SELECT * FROM servers WHERE monitor_enabled = true AND ssh_enabled = true"
    )
    for row in rows:
        try:
            await check_server(row)
        except Exception:  # noqa: BLE001 - one server failure must not stop the rest
            continue


async def loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await run_once()
        except Exception:  # noqa: BLE001
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(15, settings.monitor_interval_seconds))
        except asyncio.TimeoutError:
            pass
