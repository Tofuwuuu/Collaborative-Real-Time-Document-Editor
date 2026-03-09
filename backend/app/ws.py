from __future__ import annotations

import asyncio
import base64
import json
import time
import uuid
from typing import Any, Dict, Optional

from fastapi import WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from .history import add_snapshot, append_update, get_latest_snapshot, get_last_update_id, replay_updates
from .hub import DocHub


def channel_for_doc(doc_id: str) -> str:
    return f"doc:{doc_id}:events"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _is_base64(s: str) -> bool:
    try:
        base64.b64decode(s.encode("utf-8"), validate=True)
        return True
    except Exception:
        return False


async def handle_ws(
    *,
    doc_id: str,
    ws: WebSocket,
    hub: DocHub,
    redis: Redis,
    instance_id: str,
) -> None:
    await hub.connect(doc_id, ws)

    try:
        # Expect a hello early so we can de-dupe, but don't hard-fail if absent.
        await _send_sync_init(doc_id=doc_id, ws=ws, redis=redis)

        while True:
            msg = await ws.receive_json()
            if not isinstance(msg, dict):
                continue

            msg_type = msg.get("type")
            if msg_type == "hello":
                client_id = msg.get("clientId")
                user = msg.get("user") or {}
                if isinstance(client_id, int) and isinstance(user, dict):
                    await hub.set_client_info(ws, client_id=client_id, user=user)
                continue

            if msg_type == "y_update":
                data = msg.get("data")
                client_id = msg.get("clientId")
                if not isinstance(data, str) or not _is_base64(data) or not isinstance(client_id, int):
                    continue

                ts = _now_ms()
                await append_update(redis, doc_id, data_b64=data, client_id=client_id, ts_ms=ts)

                out = {"type": "y_update", "clientId": client_id, "data": data}
                await hub.broadcast(doc_id, out, exclude_ws=ws)

                await redis.publish(
                    channel_for_doc(doc_id),
                    json.dumps({"origin": instance_id, "kind": "y_update", "clientId": client_id, "data": data}),
                )
                continue

            if msg_type == "awareness":
                data = msg.get("data")
                client_id = msg.get("clientId")
                if not isinstance(data, str) or not _is_base64(data) or not isinstance(client_id, int):
                    continue

                out = {"type": "awareness", "clientId": client_id, "data": data}
                await hub.broadcast(doc_id, out, exclude_ws=ws)

                await redis.publish(
                    channel_for_doc(doc_id),
                    json.dumps({"origin": instance_id, "kind": "awareness", "clientId": client_id, "data": data}),
                )
                continue

            if msg_type == "snapshot":
                data = msg.get("data")
                if not isinstance(data, str) or not _is_base64(data):
                    continue

                last_id = await get_last_update_id(redis, doc_id)
                await add_snapshot(redis, doc_id, version=last_id, data_b64=data, ts_ms=_now_ms())
                await ws.send_json({"type": "snapshot_saved"})
                continue

    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(doc_id, ws)


async def _send_sync_init(*, doc_id: str, ws: WebSocket, redis: Redis) -> None:
    latest = await get_latest_snapshot(redis, doc_id)
    snapshot_data = latest.get("data") if latest else None
    version = latest.get("version") if latest else "0-0"
    if not isinstance(version, str):
        version = "0-0"

    updates = await replay_updates(redis, doc_id, after_stream_id=version)
    await ws.send_json({"type": "sync_init", "snapshot": snapshot_data, "updates": updates})

