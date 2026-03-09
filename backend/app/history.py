from __future__ import annotations

from typing import Any, Dict, List, Optional

from redis.asyncio import Redis

from .config import settings


def updates_stream_key(doc_id: str) -> str:
    return f"doc:{doc_id}:updates"


def snapshots_stream_key(doc_id: str) -> str:
    return f"doc:{doc_id}:snapshots"


async def append_update(redis: Redis, doc_id: str, *, data_b64: str, client_id: int, ts_ms: int) -> str:
    key = updates_stream_key(doc_id)
    return await redis.xadd(
        key,
        fields={"data": data_b64, "clientId": str(client_id), "ts": str(ts_ms)},
        maxlen=settings.updates_maxlen,
        approximate=True,
    )


async def get_last_update_id(redis: Redis, doc_id: str) -> str:
    key = updates_stream_key(doc_id)
    rows = await redis.xrevrange(key, max="+", min="-", count=1)
    if not rows:
        return "0-0"
    return rows[0][0]


async def add_snapshot(redis: Redis, doc_id: str, *, version: str, data_b64: str, ts_ms: int) -> str:
    key = snapshots_stream_key(doc_id)
    return await redis.xadd(
        key,
        fields={"version": version, "data": data_b64, "ts": str(ts_ms)},
        maxlen=settings.snapshots_maxlen,
        approximate=True,
    )


async def get_latest_snapshot(redis: Redis, doc_id: str) -> Optional[Dict[str, Any]]:
    key = snapshots_stream_key(doc_id)
    rows = await redis.xrevrange(key, max="+", min="-", count=1)
    if not rows:
        return None
    snapshot_id, fields = rows[0]
    return {"id": snapshot_id, **fields}


async def list_snapshots(redis: Redis, doc_id: str, *, limit: int = 50) -> List[Dict[str, Any]]:
    key = snapshots_stream_key(doc_id)
    rows = await redis.xrevrange(key, max="+", min="-", count=limit)
    return [{"id": snapshot_id, **fields} for snapshot_id, fields in rows]


async def get_snapshot(redis: Redis, doc_id: str, snapshot_id: str) -> Optional[Dict[str, Any]]:
    key = snapshots_stream_key(doc_id)
    rows = await redis.xrange(key, min=snapshot_id, max=snapshot_id, count=1)
    if not rows:
        return None
    _, fields = rows[0]
    return {"id": snapshot_id, **fields}


async def replay_updates(redis: Redis, doc_id: str, *, after_stream_id: str, limit: int = 5000) -> List[str]:
    key = updates_stream_key(doc_id)
    min_id = f"({after_stream_id}" if after_stream_id != "0-0" else "0-0"
    rows = await redis.xrange(key, min=min_id, max="+", count=limit)
    return [fields["data"] for _, fields in rows if "data" in fields]

