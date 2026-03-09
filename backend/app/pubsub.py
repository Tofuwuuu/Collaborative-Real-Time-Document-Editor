from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

from redis.asyncio import Redis

from .hub import DocHub


PUBSUB_PATTERN = "doc:*:events"


def _doc_id_from_channel(channel: str) -> Optional[str]:
    # channel format: doc:{docId}:events
    parts = channel.split(":")
    if len(parts) < 3:
        return None
    if parts[0] != "doc" or parts[-1] != "events":
        return None
    return ":".join(parts[1:-1])


async def run_pubsub_listener(
    *,
    redis: Redis,
    hub: DocHub,
    instance_id: str,
    stop_event: asyncio.Event,
) -> None:
    pubsub = redis.pubsub()
    await pubsub.psubscribe(PUBSUB_PATTERN)

    try:
        while not stop_event.is_set():
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if not message:
                continue

            channel = message.get("channel")
            data = message.get("data")
            if not isinstance(channel, str) or not isinstance(data, str):
                continue

            doc_id = _doc_id_from_channel(channel)
            if not doc_id:
                continue

            try:
                payload: Dict[str, Any] = json.loads(data)
            except Exception:
                continue

            if payload.get("origin") == instance_id:
                continue

            kind = payload.get("kind")
            if kind == "y_update":
                await hub.broadcast(
                    doc_id,
                    {"type": "y_update", "clientId": payload.get("clientId"), "data": payload.get("data")},
                )
            elif kind == "awareness":
                await hub.broadcast(
                    doc_id,
                    {"type": "awareness", "clientId": payload.get("clientId"), "data": payload.get("data")},
                )
    finally:
        try:
            await pubsub.punsubscribe(PUBSUB_PATTERN)
        finally:
            await pubsub.close()

