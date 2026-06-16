"""Append-only audit log: auth-relevant actions, credential decryptions, tool/service ops."""
from __future__ import annotations

import json
from typing import Any, Optional

from app import db


async def log(user_id: Optional[str], action: str, target: str = "", detail: Optional[Any] = None) -> None:
    try:
        await db.execute(
            """INSERT INTO audit_log (user_id, action, target, detail, created_at)
               VALUES ($1, $2, $3, $4, now())""",
            user_id,
            action,
            target,
            json.dumps(detail, ensure_ascii=False, default=str) if detail is not None else None,
        )
    except Exception:  # noqa: BLE001 - audit must never break the request path
        pass
