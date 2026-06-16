"""Agent Gateway — bridges the cloud API <-> on-server agents (long-poll, MVP).

Why: let the agent run ON the user's server (local privileges) so SSH creds never
leave the box. The agent is the dial-out side (firewall-friendly, no inbound port):

  agent  --GET  /agent/poll?token=...-->  (held until a job or timeout)  -->  job
  agent  --POST /agent/result?token=...->  result
  API    --POST /dispatch (X-Internal-Token)-->  enqueue job, await agent result

Auth: a per-server HMAC token (signed server_id). Few-dozen agents -> single
process, in-memory registry. WS/NATS are later upgrades; long-poll keeps the MVP
dependency-free on the agent side (Go stdlib only).

Protocol (JSON):
  job    : {"job_id": str, "tool": str, "args": {...}}   (gateway -> agent)
  result : {"job_id": str, "ok": bool, "result": str, "error": str?}  (agent -> gateway)
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
import time
import uuid
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

AGENT_SECRET = os.environ.get("AGENT_SECRET", "")
INTERNAL_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
POLL_TIMEOUT = float(os.environ.get("AGENT_POLL_TIMEOUT", "25"))
JOB_TIMEOUT = float(os.environ.get("AGENT_JOB_TIMEOUT", "60"))
ONLINE_WINDOW = 60.0  # agent considered offline if not seen within this many seconds

app = FastAPI(title="Agent Gateway")


class ServerState:
    def __init__(self) -> None:
        self.jobs: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue()
        self.results: Dict[str, "asyncio.Future[Dict[str, Any]]"] = {}
        self.last_seen: float = 0.0
        self.caps: list = []  # tool names the connected agent declared it can run


_servers: Dict[str, ServerState] = {}


def _srv(server_id: str) -> ServerState:
    s = _servers.get(server_id)
    if s is None:
        s = ServerState()
        _servers[server_id] = s
    return s


# ---- token (HMAC-signed server_id; the API issues these with the same secret) ----
def make_token(server_id: str) -> str:
    sig = hmac.new(AGENT_SECRET.encode(), server_id.encode(), hashlib.sha256).hexdigest()[:32]
    raw = f"{server_id}.{sig}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def verify_token(token: str) -> Optional[str]:
    if not AGENT_SECRET or not token:
        return None
    try:
        pad = "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(token + pad).decode()
        server_id, sig = raw.rsplit(".", 1)
    except Exception:  # noqa: BLE001
        return None
    expect = hmac.new(AGENT_SECRET.encode(), server_id.encode(), hashlib.sha256).hexdigest()[:32]
    return server_id if hmac.compare_digest(sig, expect) else None


def _online(s: ServerState) -> bool:
    return (time.time() - s.last_seen) < ONLINE_WINDOW


@app.get("/healthz")
async def healthz() -> Dict[str, Any]:
    return {"ok": True, "online": [sid for sid, s in _servers.items() if _online(s)]}


# ---- agent side (long-poll) ----
@app.post("/agent/hello")
async def agent_hello(token: str, request: Request) -> Dict[str, Any]:
    """Agent announces the tools it can run (capabilities handshake)."""
    server_id = verify_token(token)
    if not server_id:
        raise HTTPException(status_code=401, detail="bad token")
    s = _srv(server_id)
    s.last_seen = time.time()
    body = await request.json()
    tools = body.get("tools")
    if isinstance(tools, list):
        s.caps = [str(t) for t in tools]
    return {"ok": True}


@app.get("/capabilities/{server_id}")
async def capabilities(server_id: str, x_internal_token: str = Header(default="")) -> Dict[str, Any]:
    if not INTERNAL_TOKEN or not hmac.compare_digest(x_internal_token, INTERNAL_TOKEN):
        raise HTTPException(status_code=401, detail="internal auth failed")
    s = _srv(server_id)
    return {"online": _online(s), "tools": s.caps if _online(s) else []}


@app.get("/agent/poll")
async def agent_poll(token: str) -> Any:
    server_id = verify_token(token)
    if not server_id:
        raise HTTPException(status_code=401, detail="bad token")
    s = _srv(server_id)
    s.last_seen = time.time()
    try:
        job = await asyncio.wait_for(s.jobs.get(), timeout=POLL_TIMEOUT)
        return job
    except asyncio.TimeoutError:
        return JSONResponse({"job_id": None})  # nothing yet → agent re-polls


@app.post("/agent/result")
async def agent_result(token: str, request: Request) -> Dict[str, Any]:
    server_id = verify_token(token)
    if not server_id:
        raise HTTPException(status_code=401, detail="bad token")
    s = _srv(server_id)
    s.last_seen = time.time()
    body = await request.json()
    fut = s.results.get(body.get("job_id"))
    if fut and not fut.done():
        fut.set_result(body)
    return {"ok": True}


# ---- API side ----
@app.post("/dispatch")
async def dispatch(request: Request, x_internal_token: str = Header(default="")) -> Dict[str, Any]:
    if not INTERNAL_TOKEN or not hmac.compare_digest(x_internal_token, INTERNAL_TOKEN):
        raise HTTPException(status_code=401, detail="internal auth failed")
    body = await request.json()
    server_id = body.get("server_id")
    tool = body.get("tool")
    args = body.get("args") or {}
    if not server_id or not tool:
        raise HTTPException(status_code=400, detail="server_id + tool required")

    s = _srv(server_id)
    if not _online(s):
        return {"ok": False, "error": "agent offline"}

    job_id = uuid.uuid4().hex
    fut: "asyncio.Future[Dict[str, Any]]" = asyncio.get_event_loop().create_future()
    s.results[job_id] = fut
    await s.jobs.put({"job_id": job_id, "tool": tool, "args": args})
    try:
        res = await asyncio.wait_for(fut, timeout=float(body.get("timeout") or JOB_TIMEOUT))
        return {"ok": bool(res.get("ok", True)), "result": res.get("result"), "error": res.get("error")}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "agent timeout"}
    finally:
        s.results.pop(job_id, None)
