"""Server records + per-user secret vault. Ownership scoping enforced on every call.

Secrets stored encrypted (envelope, per-user-id) in servers.secrets JSONB. Public DTOs
NEVER include secrets — only boolean has_* flags. Decryption happens only here, server-side,
and is audit-logged."""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from app import db
from app.crypto.envelope import decrypt_secret, encrypt_secret
from app.internal_auth import Principal
from app.services import audit

SECRET_KEYS = ["ssh_password", "ssh_private_key", "ssh_key_passphrase", "aapanel_api_key"]


# ---------- mapping ----------
def _loads(v: Any) -> Any:
    if v is None:
        return None
    return json.loads(v) if isinstance(v, str) else v


def _public(row) -> Dict[str, Any]:
    secrets = _loads(row["secrets"]) or {}
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "name": row["name"],
        "note": row["note"] or "",
        "connection_type": (row["connection_type"] if "connection_type" in row else "ssh") or "ssh",
        "ssh": {
            "enabled": row["ssh_enabled"],
            "host": row["ssh_host"] or "",
            "port": row["ssh_port"] or 22,
            "username": row["ssh_username"] or "root",
            "has_password": bool(secrets.get("ssh_password")),
            "has_private_key": bool(secrets.get("ssh_private_key")),
        },
        "aapanel": {
            "enabled": row["aapanel_enabled"],
            "base_url": row["aapanel_base_url"] or "",
            "verify_ssl": row["aapanel_verify_ssl"],
            "has_api_key": bool(secrets.get("aapanel_api_key")),
        },
        "monitor": {
            "enabled": row["monitor_enabled"],
            "interval_seconds": row["monitor_interval"] or 60,
            "services": _loads(row["monitor_services"]) or [],
        },
    }


# ---------- queries (ownership-scoped) ----------
async def list_servers(principal: Principal) -> List[Dict[str, Any]]:
    if principal.is_admin:
        rows = await db.fetch("SELECT * FROM servers ORDER BY created_at DESC")
    else:
        rows = await db.fetch(
            "SELECT * FROM servers WHERE user_id = $1 ORDER BY created_at DESC", principal.user_id
        )
    return [_public(r) for r in rows]


async def _row_owned(principal: Principal, server_id: str):
    row = await db.fetchrow("SELECT * FROM servers WHERE id = $1", server_id)
    if not row:
        return None
    if not principal.is_admin and row["user_id"] != principal.user_id:
        return None  # treat as not found → no cross-user existence leak
    return row


async def get_server(principal: Principal, server_id: str) -> Optional[Dict[str, Any]]:
    row = await _row_owned(principal, server_id)
    return _public(row) if row else None


def _validate_payload(payload: Dict[str, Any]) -> None:
    """Reject malformed aaPanel base_url (only http/https with a host). Prevents file://,
    gopher://, etc. Private/loopback IPs are intentionally allowed (self-hosted panels)."""
    panel = payload.get("aapanel") or {}
    base_url = (panel.get("base_url") or "").strip()
    if base_url:
        parsed = urlparse(base_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("aaPanel base_url phải là URL http(s) hợp lệ, vd http://1.2.3.4:8888")


def _encrypt_provided(secrets: Dict[str, Any], payload: Dict[str, Any], owner_id: str) -> Dict[str, Any]:
    """Encrypt only provided non-empty secrets; absent/None keeps existing; '' clears."""
    mapping = {
        "ssh_password": (payload.get("ssh") or {}).get("password"),
        "ssh_private_key": (payload.get("ssh") or {}).get("private_key"),
        "ssh_key_passphrase": (payload.get("ssh") or {}).get("key_passphrase"),
        "aapanel_api_key": (payload.get("aapanel") or {}).get("api_key"),
    }
    out = dict(secrets)
    for key, val in mapping.items():
        if val is None:
            continue
        if val == "":
            out.pop(key, None)
        else:
            out[key] = encrypt_secret(val, owner_id)
    return out


async def create_server(principal: Principal, payload: Dict[str, Any]) -> Dict[str, Any]:
    _validate_payload(payload)
    owner_id = principal.user_id
    server_id = uuid.uuid4().hex[:16]
    secrets = _encrypt_provided({}, payload, owner_id)
    ssh = payload.get("ssh") or {}
    panel = payload.get("aapanel") or {}
    mon = payload.get("monitor") or {}
    await db.execute(
        """INSERT INTO servers
           (id, user_id, name, note, ssh_enabled, ssh_host, ssh_port, ssh_username,
            aapanel_enabled, aapanel_base_url, aapanel_verify_ssl,
            monitor_enabled, monitor_interval, monitor_services, secrets, connection_type, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now(), now())""",
        server_id, owner_id, payload.get("name") or "Server", payload.get("note") or "",
        bool(ssh.get("enabled")),
        ssh.get("host") or "", int(ssh.get("port") or 22), ssh.get("username") or "root",
        bool(panel.get("enabled")), panel.get("base_url") or "", bool(panel.get("verify_ssl")),
        bool(mon.get("enabled")), int(mon.get("interval_seconds") or 60),
        json.dumps(mon.get("services") or []), json.dumps(secrets),
        "agent" if payload.get("connection_type") == "agent" else "ssh",
    )
    await audit.log(principal.user_id, "server.create", server_id, {"name": payload.get("name")})
    return await get_server(principal, server_id)


async def update_server(principal: Principal, server_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    _validate_payload(payload)
    row = await _row_owned(principal, server_id)
    if not row:
        return None
    owner_id = row["user_id"]  # AAD must match the original owner
    secrets = _encrypt_provided(_loads(row["secrets"]) or {}, payload, owner_id)
    ssh = payload.get("ssh") or {}
    panel = payload.get("aapanel") or {}
    mon = payload.get("monitor") or {}
    await db.execute(
        """UPDATE servers SET
             name=$2, note=$14, ssh_enabled=$3, ssh_host=$4, ssh_port=$5, ssh_username=$6,
             aapanel_enabled=$7, aapanel_base_url=$8, aapanel_verify_ssl=$9,
             monitor_enabled=$10, monitor_interval=$11, monitor_services=$12,
             secrets=$13, connection_type=$15, updated_at=now()
           WHERE id=$1""",
        server_id, payload.get("name") or row["name"], bool(ssh.get("enabled", row["ssh_enabled"])),
        ssh.get("host", row["ssh_host"]) or "", int(ssh.get("port") or row["ssh_port"] or 22),
        ssh.get("username", row["ssh_username"]) or "root",
        bool(panel.get("enabled", row["aapanel_enabled"])), panel.get("base_url", row["aapanel_base_url"]) or "",
        bool(panel.get("verify_ssl", row["aapanel_verify_ssl"])),
        bool(mon.get("enabled", row["monitor_enabled"])), int(mon.get("interval_seconds") or row["monitor_interval"] or 60),
        json.dumps(mon.get("services") if mon.get("services") is not None else (_loads(row["monitor_services"]) or [])),
        json.dumps(secrets),
        payload.get("note") if payload.get("note") is not None else (row["note"] or ""),
        ("agent" if payload.get("connection_type") == "agent"
         else "ssh" if payload.get("connection_type") == "ssh"
         else (row["connection_type"] if "connection_type" in row else "ssh")),
    )
    await audit.log(principal.user_id, "server.update", server_id)
    return await get_server(principal, server_id)


async def delete_server(principal: Principal, server_id: str) -> bool:
    row = await _row_owned(principal, server_id)
    if not row:
        return False
    await db.execute("DELETE FROM servers WHERE id = $1", server_id)
    await audit.log(principal.user_id, "server.delete", server_id)
    return True


# ---------- decrypted runtime (api-side only) ----------
async def build_decrypted_config(principal: Principal, server_id: str) -> Optional[Dict[str, Any]]:
    """Return a config dict with PLAINTEXT secrets for ToolExecutor/connectors.

    Lives only in api memory for the request. Audit-logs the decryption."""
    row = await _row_owned(principal, server_id)
    if not row:
        return None

    conn = (row["connection_type"] if "connection_type" in row else "ssh") or "ssh"
    # Agent-mode: no SSH/aaPanel creds to decrypt — tools dispatch to the on-server agent.
    if conn == "agent":
        return {
            "id": row["id"],
            "name": row["name"],
            "connection_type": "agent",
            "ssh": {"enabled": False},
            "aapanel": {"enabled": False},
        }

    secrets = _loads(row["secrets"]) or {}

    def dec(key: str) -> Optional[str]:
        blob = secrets.get(key)
        return decrypt_secret(blob) if blob else None

    cfg = {
        "id": row["id"],
        "name": row["name"],
        "ssh": {
            "enabled": row["ssh_enabled"],
            "host": row["ssh_host"] or "",
            "port": row["ssh_port"] or 22,
            "username": row["ssh_username"] or "root",
            "password": dec("ssh_password"),
            "private_key_content": dec("ssh_private_key"),
            "key_passphrase": dec("ssh_key_passphrase"),
        },
        "aapanel": {
            "enabled": row["aapanel_enabled"],
            "base_url": row["aapanel_base_url"] or "",
            "api_key": dec("aapanel_api_key"),
            "verify_ssl": row["aapanel_verify_ssl"],
        },
    }
    await audit.log(principal.user_id, "credential.decrypt", server_id)
    return cfg
