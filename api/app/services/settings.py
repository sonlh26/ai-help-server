"""Admin-editable global settings (LLM + notifications), stored in app_settings (JSONB),
with environment values as fallback. Lets admins change AI model / alert targets without redeploy."""
from __future__ import annotations

import json
from typing import Any, Dict

from app import db
from app.config import settings as env


async def get_raw() -> Dict[str, Any]:
    try:
        row = await db.fetchrow("SELECT data FROM app_settings WHERE id = 'global'")
    except Exception:  # noqa: BLE001 - table may not exist yet on first boot
        return {}
    if not row or row["data"] is None:
        return {}
    data = row["data"]
    return json.loads(data) if isinstance(data, str) else data


async def llm_config() -> Dict[str, Any]:
    """DB overrides env where set; secrets (api_key) fall back to env if blank in DB."""
    data = (await get_raw()).get("llm") or {}
    base = env.llm_config()
    merged = dict(base)
    for k in ("provider", "base_url", "model", "temperature", "max_tokens", "api_key"):
        v = data.get(k)
        if v not in (None, ""):
            merged[k] = v
    return merged


async def notify_config() -> Dict[str, Any]:
    """Targets/enabled flags from DB; transport secrets (SMTP creds, bot token) from env."""
    n = (await get_raw()).get("notify") or {}
    return {
        "email_enabled": bool(n.get("email_enabled", bool(env.smtp_host))),
        "email_to": n.get("email_to", "") or env.smtp_from,
        "telegram_enabled": bool(n.get("telegram_enabled", bool(env.telegram_bot_token))),
        "telegram_chat_id": n.get("telegram_chat_id", "") or env.telegram_chat_id,
        "telegram_bot_token": n.get("telegram_bot_token") or env.telegram_bot_token,
        "webhook_enabled": bool(n.get("webhook_enabled", False)),
        "webhook_url": n.get("webhook_url", ""),
    }


async def chatops_config() -> Dict[str, Any]:
    """ChatOps (Telegram) config: bot token (shared with notify), webhook secret and
    public base URL. DB overrides env; env stays as fallback for existing deployments."""
    raw = await get_raw()
    c = raw.get("chatops") or {}
    n = raw.get("notify") or {}
    return {
        "telegram_bot_token": c.get("telegram_bot_token") or n.get("telegram_bot_token") or env.telegram_bot_token,
        "telegram_webhook_secret": c.get("telegram_webhook_secret") or env.telegram_webhook_secret,
        "public_base_url": (c.get("public_base_url") or env.public_base_url or "").rstrip("/"),
    }
