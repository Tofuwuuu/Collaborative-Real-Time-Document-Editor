from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    updates_maxlen: int = int(os.getenv("UPDATES_MAXLEN", "20000"))
    snapshots_maxlen: int = int(os.getenv("SNAPSHOTS_MAXLEN", "200"))


settings = Settings()

