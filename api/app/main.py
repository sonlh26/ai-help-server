"""FastAPI api service. Not publicly exposed; only the web service calls it (internal token).
All routes require a Principal forwarded by web."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db
from app.routes import agent, chat, chatops, inspect, misc, servers


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await db.close_pool()


app = FastAPI(title="AI Server Manager API", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"ok": True}


app.include_router(servers.router)
app.include_router(inspect.router)
app.include_router(agent.router)
app.include_router(chat.router)
app.include_router(chatops.router)
app.include_router(misc.router)
