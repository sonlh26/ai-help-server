"""Notifications: Telegram + Email (SMTP) + Webhook. Transport secrets from env;
targets/enabled flags passed in from DB-backed settings (services.settings.notify_config)."""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from typing import Any, Dict, Optional

import httpx

from app.config import settings as env


def send_telegram(message: str, chat_id: str = "", token: str = "") -> Dict[str, object]:
    token = token or env.telegram_bot_token
    chat_id = chat_id or env.telegram_chat_id
    if not (token and chat_id):
        return {"ok": False, "detail": "Chưa cấu hình Telegram (bot token + chat id)."}
    try:
        with httpx.Client(timeout=20) as client:
            resp = client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": message},
            )
            resp.raise_for_status()
        return {"ok": True, "detail": "Đã gửi Telegram."}
    except httpx.HTTPError as exc:
        return {"ok": False, "detail": f"Lỗi Telegram: {exc}"}


def send_email(to_addr: str, subject: str, body: str) -> Dict[str, object]:
    host = env.smtp_host
    from_addr = env.smtp_from or env.smtp_username
    if not (host and from_addr and to_addr):
        return {"ok": False, "detail": "Chưa cấu hình SMTP (env) hoặc thiếu người nhận."}
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body)
    try:
        port = env.smtp_port
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=20, context=ssl.create_default_context()) as srv:
                if env.smtp_username:
                    srv.login(env.smtp_username, env.smtp_password)
                srv.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as srv:
                if env.smtp_use_tls:
                    srv.starttls(context=ssl.create_default_context())
                if env.smtp_username:
                    srv.login(env.smtp_username, env.smtp_password)
                srv.send_message(msg)
        return {"ok": True, "detail": "Đã gửi Email."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": f"Lỗi Email: {exc}"}


def send_webhook(url: str, payload: Dict[str, Any]) -> Dict[str, object]:
    if not url:
        return {"ok": False, "detail": "Chưa cấu hình Webhook URL."}
    try:
        with httpx.Client(timeout=20) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
        return {"ok": True, "detail": "Đã gửi Webhook."}
    except httpx.HTTPError as exc:
        return {"ok": False, "detail": f"Lỗi Webhook: {exc}"}


def notify_alert(cfg: Optional[Dict[str, Any]], level: str, message: str, email_to: str = "") -> None:
    """Best-effort fan-out to enabled channels. Never raises into the monitoring loop."""
    cfg = cfg or {}
    text = f"⚠️ [AI Server Manager] {message}"
    try:
        if cfg.get("telegram_enabled", True):
            send_telegram(text, cfg.get("telegram_chat_id", ""), cfg.get("telegram_bot_token", ""))
        if cfg.get("email_enabled", True):
            send_email(email_to or cfg.get("email_to", ""), "[AI Server Manager] Cảnh báo", text)
        if cfg.get("webhook_enabled") and cfg.get("webhook_url"):
            send_webhook(cfg["webhook_url"], {"level": level, "message": message})
    except Exception:  # noqa: BLE001
        pass
