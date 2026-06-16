"""Local Agent enrollment + status. The agent token is an HMAC-signed server_id
(same scheme the gateway verifies); the agent presents it to dial out — no creds stored."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.internal_auth import Principal, require_principal
from app.services import servers as svc

router = APIRouter(prefix="/servers/{server_id}", tags=["agent"])


def _agent_token(server_id: str, secret: str) -> str:
    sig = hmac.new(secret.encode(), server_id.encode(), hashlib.sha256).hexdigest()[:32]
    return base64.urlsafe_b64encode(f"{server_id}.{sig}".encode()).decode().rstrip("=")


@router.post("/agent/token")
async def issue_token(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    if not await svc.get_server(principal, server_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    secret = os.environ.get("AGENT_SECRET", "")
    if not secret:
        return {"ok": False, "detail": "Chưa cấu hình AGENT_SECRET trên máy chủ."}
    token = _agent_token(server_id, secret)
    public = (os.environ.get("GATEWAY_PUBLIC_URL", "") or "").rstrip("/")
    gw = public or "<GATEWAY_PUBLIC_URL>"
    install = f"GATEWAY_URL={gw} AGENT_TOKEN={token} ./aapanel-ai-agent"
    return {"ok": True, "token": token, "gateway_url": public, "install": install}


@router.get("/agent/status")
async def agent_status(server_id: str, principal: Principal = Depends(require_principal)) -> Dict[str, Any]:
    if not await svc.get_server(principal, server_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")
    base = os.environ.get("GATEWAY_INTERNAL_URL", "http://gateway:8090").rstrip("/")
    online = False
    try:
        with httpx.Client(timeout=10) as c:
            r = c.get(base + "/healthz")
        online = server_id in (r.json().get("online") or [])
    except Exception:  # noqa: BLE001
        online = False
    return {"online": online}
