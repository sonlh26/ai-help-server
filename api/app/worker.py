"""Monitoring worker entrypoint: `python -m app.worker`.

Runs the always-on monitoring loop. Has APP_MASTER_KEY in env so it can decrypt
credentials without an end-user session (the accepted security trade-off)."""
from __future__ import annotations

import asyncio

from app import db
from app.services import monitor


async def _main() -> None:
    stop = asyncio.Event()
    try:
        await monitor.loop(stop)
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(_main())
