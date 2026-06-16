"""ChatOps: chat with the AI from external messaging channels.

v1 implements Telegram two-way:
  - Web users create a link CODE for one of their servers (tab ChatOps).
  - They send `/link <code>` to the bot; the webhook binds chat_id -> user+server.
  - Subsequent messages from that chat run the agent on the linked server (as the
    linked user) and the answer is sent back to the chat.

The webhook is reached publicly via the web service (/api/webhooks/telegram/{secret}),
which forwards here. The path `secret` must equal TELEGRAM_WEBHOOK_SECRET. Heavy work
(agent run) happens in a background task so Telegram gets an immediate 200.
"""
from __future__ import annotations

import asyncio
import hmac
import secrets as secrets_mod
import uuid
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException
from pydantic import BaseModel

from app import db
from app.internal_auth import Principal, require_principal, require_write
from app.llm.agent import run_agent_collect
from app.services import audit, notify
from app.services import servers as svc
from app.services import settings as settings_svc

router = APIRouter(tags=["chatops"])

# Pending risky actions awaiting an inline-button tap. Keyed by a short id used in
# Telegram callback_data (≤64 bytes). In-memory (ephemeral; fine for short-lived confirms).
_PENDING: Dict[str, Dict[str, Any]] = {}
_PENDING_CAP = 500


def _describe_action(name: str, args: Dict[str, Any]) -> str:
    args = args or {}
    if name == "run_ssh_command":
        return f"Lệnh: {args.get('command', '')}"
    if name == "optimize_disk":
        return "Dọn dẹp & xoá file để giải phóng ổ cứng (thực thi thật)."
    if name == "service_action":
        return f"{args.get('action')} dịch vụ {args.get('name')}"
    if name == "aapanel_service_admin":
        return f"{args.get('action')} dịch vụ panel {args.get('name')}"
    if name == "aapanel_site_action":
        return f"{args.get('action')} website {args.get('site_name')}"
    return f"{name} {args}"


def _tg_call(token: str, method: str, payload: Dict[str, Any]) -> None:
    try:
        with httpx.Client(timeout=20) as c:
            c.post(f"https://api.telegram.org/bot{token}/{method}", json=payload)
    except Exception:  # noqa: BLE001
        pass


def _send_confirm_buttons(chat_id: str, token: str, text: str, pid: str) -> None:
    _tg_call(token, "sendMessage", {
        "chat_id": chat_id, "text": text,
        "reply_markup": {"inline_keyboard": [[
            {"text": "✅ Xác nhận", "callback_data": f"c:{pid}"},
            {"text": "❌ Hủy", "callback_data": f"x:{pid}"},
        ]]},
    })


# ---------- management (authenticated, via web proxy) ----------
class CreateLinkReq(BaseModel):
    server_id: str


@router.get("/chatops/status")
async def status(_: Principal = Depends(require_principal)) -> Dict[str, Any]:
    cfg = await settings_svc.chatops_config()
    secret = cfg["telegram_webhook_secret"]
    base = cfg["public_base_url"]
    webhook_url = f"{base}/api/webhooks/telegram/{secret}" if (base and secret) else ""
    return {
        "telegram": {
            "bot_configured": bool(cfg["telegram_bot_token"]),
            "webhook_secret_set": bool(secret),
            "public_base_url": base,
            "webhook_url": webhook_url,
        }
    }


@router.get("/chatops/links")
async def list_links(principal: Principal = Depends(require_principal)) -> List[Dict[str, Any]]:
    rows = await db.fetch(
        """SELECT l.id, l.channel, l.server_id, l.chat_id, l.code, s.name AS server_name
           FROM chatops_links l LEFT JOIN servers s ON s.id = l.server_id
           WHERE l.user_id = $1 ORDER BY l.created_at DESC""",
        principal.user_id,
    )
    return [
        {
            "id": r["id"],
            "channel": r["channel"],
            "serverId": r["server_id"],
            "serverName": r["server_name"],
            "linked": bool(r["chat_id"]),
            "code": r["code"],
        }
        for r in rows
    ]


@router.post("/chatops/links")
async def create_link(req: CreateLinkReq, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    # Ensure the server belongs to the caller.
    srv = await svc.get_server(principal, req.server_id)
    if not srv:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    code = secrets_mod.token_urlsafe(6)
    link_id = uuid.uuid4().hex[:16]
    await db.execute(
        """INSERT INTO chatops_links (id, channel, user_id, server_id, chat_id, code, created_at, updated_at)
           VALUES ($1, 'telegram', $2, $3, NULL, $4, now(), now())""",
        link_id, principal.user_id, req.server_id, code,
    )
    await audit.log(principal.user_id, "chatops.link.create", req.server_id)
    return {"id": link_id, "code": code}


@router.delete("/chatops/links/{link_id}")
async def delete_link(link_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    await db.execute("DELETE FROM chatops_links WHERE id = $1 AND user_id = $2", link_id, principal.user_id)
    return {"ok": True}


@router.post("/chatops/telegram/register")
async def register_webhook(principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    require_write(principal)
    cfg = await settings_svc.chatops_config()
    token, secret, base = cfg["telegram_bot_token"], cfg["telegram_webhook_secret"], cfg["public_base_url"]
    if not (token and secret and base):
        return {"ok": False, "detail": "Thiếu Bot token / Webhook secret / Public base URL (cấu hình ở Cài đặt)."}
    url = f"{base}/api/webhooks/telegram/{secret}"
    try:
        with httpx.Client(timeout=20) as c:
            r = c.post(f"https://api.telegram.org/bot{token}/setWebhook", json={"url": url})
        d = r.json()
        return {"ok": bool(d.get("ok")), "detail": d.get("description", "setWebhook"), "url": url}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": str(exc)}


# ---------- public webhook (forwarded by web) ----------
@router.post("/chatops/telegram/webhook/{secret}")
async def telegram_webhook(secret: str, background: BackgroundTasks, update: Dict[str, Any] = Body(default={})) -> Dict[str, Any]:
    cfg = await settings_svc.chatops_config()
    configured = cfg["telegram_webhook_secret"]
    if not configured or not hmac.compare_digest(secret, configured):
        raise HTTPException(status_code=404, detail="Not found")
    # Inline-button tap (confirm/cancel a risky action).
    cq = update.get("callback_query")
    if cq:
        background.add_task(_handle_callback, cq, cfg["telegram_bot_token"])
        return {"ok": True}
    msg = update.get("message") or update.get("edited_message") or {}
    chat = msg.get("chat") or {}
    chat_id = str(chat.get("id") or "")
    text = (msg.get("text") or "").strip()
    if chat_id and text:
        background.add_task(_handle_message, chat_id, text, cfg["telegram_bot_token"])
    return {"ok": True}


async def _handle_callback(cq: Dict[str, Any], token: str) -> None:
    """User tapped an inline button (✅/❌) on a risky-action confirm message."""
    data = cq.get("data") or ""
    chat_id = str(((cq.get("message") or {}).get("chat") or {}).get("id") or "")
    _tg_call(token, "answerCallbackQuery", {"callback_query_id": cq.get("id")})  # stop spinner
    action, _, pid = data.partition(":")
    pend = _PENDING.pop(pid, None)
    if not pend:
        notify.send_telegram("Yêu cầu xác nhận đã hết hạn. Hãy gửi lại lệnh.", chat_id, token)
        return
    if action == "x":
        notify.send_telegram("❌ Đã hủy hành động.", chat_id, token)
        return
    if action != "c":
        return
    try:
        principal = Principal(user_id=pend["user_id"], role="member")
        cfg = await svc.build_decrypted_config(principal, pend["server_id"])
        if not cfg:
            notify.send_telegram("Không truy cập được server đã liên kết.", chat_id, token)
            return
        llm_cfg = await settings_svc.llm_config()
        result = await asyncio.to_thread(
            run_agent_collect, cfg, llm_cfg, [{"role": "user", "content": pend["text"]}],
            {"name": pend["name"], "args": pend["args"]},
        )
        if result.get("confirm"):  # the AI chained another risky step → confirm again
            c = result["confirm"]
            pid2 = secrets_mod.token_hex(8)
            _stash_pending(pid2, chat_id, pend["user_id"], pend["server_id"], c, pend["text"])
            _send_confirm_buttons(chat_id, token, f"⚠️ Cần xác nhận tiếp\n{c['reason']}\n\n{_describe_action(c['name'], c['args'])}", pid2)
        else:
            notify.send_telegram("✅ Đã thực hiện.\n\n" + result.get("text", ""), chat_id, token)
        await audit.log(pend["user_id"], "chatops.telegram.confirm_exec", pend["server_id"], {"name": pend["name"]})
    except Exception as exc:  # noqa: BLE001
        notify.send_telegram(f"⚠️ Lỗi khi thực hiện: {exc}", chat_id, token)


def _stash_pending(pid: str, chat_id: str, user_id: str, server_id: str, confirm: Dict[str, Any], text: str) -> None:
    if len(_PENDING) >= _PENDING_CAP:
        _PENDING.pop(next(iter(_PENDING)), None)
    _PENDING[pid] = {
        "chat_id": chat_id, "user_id": user_id, "server_id": server_id,
        "name": confirm["name"], "args": confirm["args"], "text": text,
    }


async def _handle_message(chat_id: str, text: str, token: str) -> None:
    """Route a Telegram message: link commands, then agent chat on the linked server."""
    try:
        if text.startswith("/start") or text == "/help":
            notify.send_telegram(
                "Xin chào! Gửi /link <mã> (lấy mã ở tab ChatOps trên web) để liên kết chat này với một server, "
                "rồi hỏi mình bất cứ điều gì về server đó. Dùng /unlink để hủy.",
                chat_id, token,
            )
            return
        if text.startswith("/link"):
            await _do_link(chat_id, text[5:].strip(), token)
            return
        if text.startswith("/unlink"):
            await db.execute("UPDATE chatops_links SET chat_id = NULL, updated_at = now() WHERE chat_id = $1", chat_id)
            notify.send_telegram("Đã hủy liên kết chat này.", chat_id, token)
            return

        row = await db.fetchrow(
            "SELECT * FROM chatops_links WHERE channel = 'telegram' AND chat_id = $1 LIMIT 1", chat_id
        )
        if not row:
            notify.send_telegram(
                "Chat này chưa liên kết server. Gửi /link <mã> (lấy mã ở tab ChatOps trên web).", chat_id, token
            )
            return

        principal = Principal(user_id=row["user_id"], role="member")
        cfg = await svc.build_decrypted_config(principal, row["server_id"])
        if not cfg:
            notify.send_telegram("Không truy cập được server đã liên kết (có thể đã bị xóa).", chat_id, token)
            return

        llm_cfg = await settings_svc.llm_config()
        result = await asyncio.to_thread(run_agent_collect, cfg, llm_cfg, [{"role": "user", "content": text}])
        if result.get("confirm"):
            c = result["confirm"]
            pid = secrets_mod.token_hex(8)
            _stash_pending(pid, chat_id, row["user_id"], row["server_id"], c, text)
            _send_confirm_buttons(
                chat_id, token,
                f"⚠️ Cần xác nhận hành động\n{c['reason']}\n\n{_describe_action(c['name'], c['args'])}", pid,
            )
        else:
            notify.send_telegram(result.get("text", ""), chat_id, token)
        await audit.log(row["user_id"], "chatops.telegram.chat", row["server_id"])
    except Exception as exc:  # noqa: BLE001
        notify.send_telegram(f"⚠️ Lỗi xử lý: {exc}", chat_id, token)


async def _do_link(chat_id: str, code: str, token: str) -> None:
    if not code:
        notify.send_telegram("Cú pháp: /link <mã>", chat_id, token)
        return
    row = await db.fetchrow("SELECT * FROM chatops_links WHERE channel = 'telegram' AND code = $1 LIMIT 1", code)
    if not row:
        notify.send_telegram("Mã liên kết không hợp lệ hoặc đã được dùng.", chat_id, token)
        return
    await db.execute(
        "UPDATE chatops_links SET chat_id = $1, code = NULL, updated_at = now() WHERE id = $2", chat_id, row["id"]
    )
    srv = await db.fetchrow("SELECT name FROM servers WHERE id = $1", row["server_id"])
    name = srv["name"] if srv else row["server_id"]
    notify.send_telegram(f"✅ Đã liên kết với server \"{name}\". Hãy hỏi mình bất cứ điều gì về server này.", chat_id, token)
    await audit.log(row["user_id"], "chatops.telegram.linked", row["server_id"])
