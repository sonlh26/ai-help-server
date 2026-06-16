"""Runtime settings from environment."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(v: str, default: bool = False) -> bool:
    if v is None or v == "":
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    database_url: str = os.environ.get("DATABASE_URL", "")
    internal_service_token: str = os.environ.get("INTERNAL_SERVICE_TOKEN", "")

    llm_provider: str = os.environ.get("LLM_PROVIDER", "openai")
    llm_base_url: str = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1")
    llm_api_key: str = os.environ.get("LLM_API_KEY", "")
    llm_model: str = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    llm_temperature: float = float(os.environ.get("LLM_TEMPERATURE", "0.2") or 0.2)
    llm_max_tokens: int = int(os.environ.get("LLM_MAX_TOKENS", "2048") or 2048)

    smtp_host: str = os.environ.get("SMTP_HOST", "")
    smtp_port: int = int(os.environ.get("SMTP_PORT", "587") or 587)
    smtp_username: str = os.environ.get("SMTP_USERNAME", "")
    smtp_password: str = os.environ.get("SMTP_PASSWORD", "")
    smtp_from: str = os.environ.get("SMTP_FROM", "")
    smtp_use_tls: bool = _bool(os.environ.get("SMTP_USE_TLS", "true"), True)

    telegram_bot_token: str = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.environ.get("TELEGRAM_CHAT_ID", "")
    # ChatOps: shared secret in the Telegram webhook URL path + the app's public base URL.
    telegram_webhook_secret: str = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
    public_base_url: str = os.environ.get("PUBLIC_BASE_URL", "")

    monitor_interval_seconds: int = int(os.environ.get("MONITOR_INTERVAL_SECONDS", "60") or 60)

    def llm_config(self) -> dict:
        return {
            "provider": self.llm_provider,
            "base_url": self.llm_base_url,
            "api_key": self.llm_api_key,
            "model": self.llm_model,
            "temperature": self.llm_temperature,
            "max_tokens": self.llm_max_tokens,
        }


settings = Settings()
