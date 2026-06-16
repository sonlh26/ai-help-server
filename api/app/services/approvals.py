"""'Always allow' rules for risky tool calls, scoped per (user, server).

When a (user_id, server_id, rule_key) row exists, the agent auto-runs that action
without asking again. Table owned/migrated by web (Drizzle: tool_approvals)."""
from __future__ import annotations

from typing import Any, Dict, List, Set

from app import db


async def list_keys(user_id: str, server_id: str) -> Set[str]:
    try:
        rows = await db.fetch(
            "SELECT rule_key FROM tool_approvals WHERE user_id = $1 AND server_id = $2",
            user_id, server_id,
        )
    except Exception:  # noqa: BLE001 - table may not exist yet on first boot
        return set()
    return {r["rule_key"] for r in rows}


async def list_rows(user_id: str, server_id: str) -> List[Dict[str, Any]]:
    rows = await db.fetch(
        "SELECT id, rule_key, label, created_at FROM tool_approvals "
        "WHERE user_id = $1 AND server_id = $2 ORDER BY created_at DESC",
        user_id, server_id,
    )
    return [dict(r) for r in rows]


async def add(user_id: str, server_id: str, rule_key: str, label: str) -> None:
    await db.execute(
        "INSERT INTO tool_approvals (user_id, server_id, rule_key, label, created_at) "
        "VALUES ($1, $2, $3, $4, now()) "
        "ON CONFLICT (user_id, server_id, rule_key) DO NOTHING",
        user_id, server_id, rule_key, label,
    )


async def delete(approval_id: int, user_id: str) -> None:
    await db.execute("DELETE FROM tool_approvals WHERE id = $1 AND user_id = $2", approval_id, user_id)
