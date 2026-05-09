from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .hub import DocHub
from .history import get_snapshot, list_snapshots
from .pubsub import run_pubsub_listener
from .redis_client import get_redis
from .ws import handle_ws


hub = DocHub()
instance_id = uuid.uuid4().hex


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = get_redis()
    stop_event = asyncio.Event()
    task = asyncio.create_task(run_pubsub_listener(redis=redis, hub=hub, instance_id=instance_id, stop_event=stop_event))
    app.state.redis = redis
    app.state.stop_event = stop_event
    app.state.pubsub_task = task
    yield
    stop_event.set()
    try:
        await task
    finally:
        await redis.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {"ok": True}


@app.get("/api/docs/{doc_id}/history")
async def history(doc_id: str):
    redis = app.state.redis
    return await list_snapshots(redis, doc_id, limit=50)


@app.get("/api/docs/{doc_id}/snapshot/{snapshot_id}")
async def snapshot(doc_id: str, snapshot_id: str):
    redis = app.state.redis
    snap = await get_snapshot(redis, doc_id, snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="snapshot not found")
    return snap


@app.websocket("/ws/docs/{doc_id}")
async def ws_docs(doc_id: str, websocket: WebSocket):
    redis = app.state.redis
    await handle_ws(doc_id=doc_id, ws=websocket, hub=hub, redis=redis, instance_id=instance_id)
