"""SSE event funnel + in-memory task registry for the isolated Coding Agent.

The supervisor emits events; the registry pushes them to a per-conversation SSE
stream that the UI subscribes to via GET /api/tasks/{task_id}/events. The same
payloads are also persisted on the task row for replay.
"""
import asyncio
import json
from typing import Any, Dict, List, Optional


class EventHub:
    def __init__(self):
        self._queues: Dict[str, "asyncio.Queue"] = {}

    def subscribe(self, task_id: str) -> "asyncio.Queue":
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._queues[task_id] = q
        return q

    def unsubscribe(self, task_id: str):
        self._queues.pop(task_id, None)

    def publish(self, task_id: str, event: dict):
        q = self._queues.get(task_id)
        if q is None:
            return
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            # drop oldest
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def stream(self, task_id: str, q: "asyncio.Queue", replay: Optional[list] = None):
        yield "event: connected\ndata: {}\n\n"
        # Replay persisted events first so a late subscriber sees full history.
        for ev in (replay or []):
            yield f"data: {json.dumps(ev)}\n\n"
        while True:
            try:
                ev = await asyncio.wait_for(q.get(), timeout=25)
                yield f"data: {json.dumps(ev)}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"


hub = EventHub()