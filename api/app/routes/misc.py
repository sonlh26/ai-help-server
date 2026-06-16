"""Alerts (list/filter/mark-read), skills list, LLM/notify tests."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.internal_auth import Principal, require_principal, require_write
from app.llm.client import LLMClient
from app.services import notify
from app.services import settings as settings_svc
from app.skills import SKILLS
from app.tools.registry import TOOL_SCHEMAS

router = APIRouter(tags=["misc"])


@router.get("/skills")
async def list_skills(_: Principal = Depends(require_principal)) -> List[Dict[str, str]]:
    return SKILLS


@router.get("/tools")
async def list_tools(_: Principal = Depends(require_principal)) -> List[Dict[str, Any]]:
    """Danh sách công cụ AI có thể gọi, kèm mô tả và tên tham số (để hiển thị ở tab Tools)."""
    out: List[Dict[str, Any]] = []
    for t in TOOL_SCHEMAS:
        props = (t.get("parameters") or {}).get("properties") or {}
        required = set((t.get("parameters") or {}).get("required") or [])
        params = [
            {
                "name": name,
                "type": (spec or {}).get("type", "any"),
                "description": (spec or {}).get("description", ""),
                "required": name in required,
            }
            for name, spec in props.items()
        ]
        out.append({"name": t["name"], "description": t.get("description", ""), "params": params})
    return out


@router.get("/models")
async def list_models(_: Principal = Depends(require_principal)) -> Dict[str, Any]:
    """Liệt kê model khả dụng từ provider LLM (OpenAI-compatible /models hoặc Anthropic),
    kèm model đang dùng. Lỗi mạng được nuốt -> trả danh sách rỗng + model hiện tại."""
    cfg = await settings_svc.llm_config()
    provider = (cfg.get("provider") or "openai").lower()
    base_url = (cfg.get("base_url") or "").rstrip("/")
    api_key = cfg.get("api_key") or ""
    current = cfg.get("model") or ""

    models: List[str] = []
    error: Optional[str] = None
    if base_url and api_key:
        try:
            if provider == "anthropic":
                headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
            else:
                headers = {"Authorization": f"Bearer {api_key}"}
            with httpx.Client(timeout=20) as client:
                resp = client.get(base_url + "/models", headers=headers)
            if resp.status_code >= 400:
                error = f"Provider trả về {resp.status_code}."
            else:
                data = resp.json()
                items = data.get("data") if isinstance(data, dict) else data
                for it in items or []:
                    mid = it.get("id") if isinstance(it, dict) else str(it)
                    if mid:
                        models.append(mid)
                models = sorted(set(models))
        except Exception as exc:  # noqa: BLE001
            error = str(exc)
    else:
        error = "Chưa cấu hình LLM base_url/api_key."

    # Luôn đảm bảo model hiện tại có trong danh sách để user thấy lựa chọn đang dùng.
    if current and current not in models:
        models = [current, *models]
    return {"provider": provider, "current": current, "models": models, "error": error}


@router.get("/alerts")
async def list_alerts(
    principal: Principal = Depends(require_principal),
    level: Optional[str] = None,
    status: Optional[str] = None,
    server_id: Optional[str] = None,
) -> Dict[str, Any]:
    where = []
    args: List[Any] = []
    if not principal.is_admin:
        args.append(principal.user_id)
        where.append(f"user_id = ${len(args)}")
    if level:
        args.append(level)
        where.append(f"level = ${len(args)}")
    if server_id:
        args.append(server_id)
        where.append(f"server_id = ${len(args)}")
    if status == "unread":
        where.append("read_at IS NULL")
    elif status == "read":
        where.append("read_at IS NOT NULL")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = await db.fetch(f"SELECT * FROM alerts{clause} ORDER BY created_at DESC LIMIT 200", *args)

    # counts (respecting ownership only)
    cargs: List[Any] = []
    cclause = ""
    if not principal.is_admin:
        cargs.append(principal.user_id)
        cclause = " WHERE user_id = $1"
    crow = await db.fetchrow(
        f"SELECT count(*) total, count(*) FILTER (WHERE read_at IS NULL) unread FROM alerts{cclause}", *cargs
    )
    svc = await db.fetch(
        ("SELECT ss.* FROM service_status ss JOIN servers s ON s.id=ss.server_id WHERE s.user_id=$1 ORDER BY ss.checked_at DESC LIMIT 200"
         if not principal.is_admin else
         "SELECT * FROM service_status ORDER BY checked_at DESC LIMIT 200"),
        *([principal.user_id] if not principal.is_admin else []),
    )
    return {
        "alerts": [dict(r) for r in rows],
        "services": [dict(r) for r in svc],
        "counts": {"total": crow["total"], "unread": crow["unread"], "read": crow["total"] - crow["unread"]},
    }


async def _alert_owned(principal: Principal, alert_id: int) -> bool:
    row = await db.fetchrow("SELECT user_id FROM alerts WHERE id = $1", alert_id)
    return bool(row) and (principal.is_admin or row["user_id"] == principal.user_id)


@router.post("/alerts/{alert_id}/read")
async def mark_read(alert_id: int, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    if not await _alert_owned(principal, alert_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy cảnh báo.")
    await db.execute("UPDATE alerts SET read_at = now() WHERE id = $1 AND read_at IS NULL", alert_id)
    return {"ok": True}


@router.post("/alerts/read-all")
async def mark_all_read(principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    if principal.is_admin:
        await db.execute("UPDATE alerts SET read_at = now() WHERE read_at IS NULL")
    else:
        await db.execute("UPDATE alerts SET read_at = now() WHERE read_at IS NULL AND user_id = $1", principal.user_id)
    return {"ok": True}


@router.post("/test/llm")
async def test_llm(_: Principal = Depends(require_principal)) -> Dict[str, Any]:
    try:
        client = LLMClient(await settings_svc.llm_config())
        resp = client.complete("Bạn là trợ lý.", [{"role": "user", "content": "Trả lời đúng 1 từ: ok"}], [])
        return {"ok": True, "detail": client.parse(resp)["text"][:200]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": str(exc)}


@router.post("/test/notify/{channel}")
async def test_notify(channel: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    cfg = await settings_svc.notify_config()
    msg = "✅ Tin nhắn kiểm tra từ AI Server Manager."
    if channel == "telegram":
        return notify.send_telegram(msg, cfg.get("telegram_chat_id", ""), cfg.get("telegram_bot_token", ""))
    if channel == "email":
        row = await db.fetchrow('SELECT email FROM "user" WHERE id = $1', principal.user_id)
        to = cfg.get("email_to") or (row["email"] if row else "")
        return notify.send_email(to, "[AI Server Manager] Kiểm tra", msg)
    if channel == "webhook":
        return notify.send_webhook(cfg.get("webhook_url", ""), {"test": True, "message": msg})
    return {"ok": False, "detail": f"Kênh không hợp lệ: {channel}"}
