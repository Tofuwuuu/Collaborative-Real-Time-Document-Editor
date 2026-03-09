from __future__ import annotations

from redis.asyncio import Redis

from .config import settings


def get_redis() -> Redis:
    # decode_responses=False because we store binary via base64 strings and stream IDs.
    return Redis.from_url(settings.redis_url, decode_responses=True)

