"""AI chat over a specific server (SSE). Decryption + tool execution happen here,
server-side, scoped to the principal. The LLM only ever receives tool OUTPUTS."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.internal_auth import Principal, require_principal
from app.llm.agent import run_agent
from app.services import approvals, audit
from app.services import servers as svc
from app.services import settings as settings_svc
from app.skills import SKILL_PROMPTS
from app.tools.registry import approval_key, approval_label, is_remember_eligible

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ConfirmIn(BaseModel):
    name: str
    args: Dict[str, Any] = {}
    remember: bool = False  # "Always" → persist an approval so it won't ask again


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = []
    skill: Optional[str] = None  # optional preset skill key
    model: Optional[str] = None  # optional per-request model override (from Models tab)
    confirm: Optional[ConfirmIn] = None  # a user-confirmed risky action to execute first


@router.post("/servers/{server_id}/chat")
async def chat(server_id: str, req: ChatRequest, principal: Principal = Depends(require_principal)) -> StreamingResponse:
    # Ownership + decryption enforced here (returns None if not owned).
    cfg = await svc.build_decrypted_config(principal, server_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Không tìm thấy server.")

    history = [{"role": m.role, "content": m.content} for m in req.messages]
    if req.skill and req.skill in SKILL_PROMPTS:
        history.append({"role": "user", "content": SKILL_PROMPTS[req.skill]})

    pre_approved = None
    if req.confirm:
        pre_approved = {"name": req.confirm.name, "args": req.confirm.args}
        await audit.log(principal.user_id, "chat.confirm_exec", server_id,
                        {"name": req.confirm.name, "args": req.confirm.args})
        # "Always" → persist an approval rule (except arbitrary shell, which never remembers).
        if req.confirm.remember and is_remember_eligible(req.confirm.name):
            await approvals.add(
                principal.user_id, server_id,
                approval_key(req.confirm.name, req.confirm.args),
                approval_label(req.confirm.name, req.confirm.args),
            )
            await audit.log(principal.user_id, "chat.approval_add", server_id,
                            {"name": req.confirm.name})
    else:
        await audit.log(principal.user_id, "chat.start", server_id, {"skill": req.skill})

    approved_keys = await approvals.list_keys(principal.user_id, server_id)

    llm_cfg = await settings_svc.llm_config()
    if req.model:
        llm_cfg = {**llm_cfg, "model": req.model}

    def event_stream():
        for event in run_agent(cfg, llm_cfg, history, pre_approved=pre_approved, approved_keys=approved_keys):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
