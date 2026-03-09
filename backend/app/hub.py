from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket


@dataclass
class ClientInfo:
    client_id: int
    user: Dict[str, Any]


class DocHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._doc_to_sockets: Dict[str, Set[WebSocket]] = {}
        self._socket_info: Dict[WebSocket, ClientInfo] = {}

    async def connect(self, doc_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._doc_to_sockets.setdefault(doc_id, set()).add(ws)

    async def disconnect(self, doc_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._socket_info.pop(ws, None)
            sockets = self._doc_to_sockets.get(doc_id)
            if sockets is not None:
                sockets.discard(ws)
                if not sockets:
                    self._doc_to_sockets.pop(doc_id, None)

    async def set_client_info(self, ws: WebSocket, *, client_id: int, user: Dict[str, Any]) -> None:
        async with self._lock:
            self._socket_info[ws] = ClientInfo(client_id=client_id, user=user)

    async def get_client_id(self, ws: WebSocket) -> Optional[int]:
        async with self._lock:
            info = self._socket_info.get(ws)
            return info.client_id if info else None

    async def broadcast(self, doc_id: str, message: Dict[str, Any], *, exclude_ws: WebSocket | None = None) -> None:
        async with self._lock:
            sockets = list(self._doc_to_sockets.get(doc_id, set()))

        if not sockets:
            return

        coros = []
        for ws in sockets:
            if exclude_ws is not None and ws is exclude_ws:
                continue
            coros.append(ws.send_json(message))

        if coros:
            await asyncio.gather(*coros, return_exceptions=True)

