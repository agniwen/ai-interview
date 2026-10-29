"""Publish provider recovery as UI-only status, never as candidate evidence."""

import asyncio
import logging
import uuid

from transcript_replay import (
    ATTR_SEGMENT_ID,
    ATTR_TRANSCRIPTION_FINAL,
    TRANSCRIPTION_TOPIC,
)

logger = logging.getLogger(__name__)


class ConnectionNotifications:
    def __init__(self, participant):
        self._participant = participant
        self._tail: asyncio.Task | None = None

    def __call__(self, state: str) -> None:
        previous = self._tail

        async def publish():
            if previous is not None:
                await previous
            try:
                writer = await self._participant.stream_text(
                    topic=TRANSCRIPTION_TOPIC,
                    attributes={
                        ATTR_SEGMENT_ID: f"connection-{uuid.uuid4().hex}",
                        ATTR_TRANSCRIPTION_FINAL: "true",
                        "interview.connection_state": state,
                    },
                )
                await writer.write(
                    "已重新连接，可以继续面试。"
                    if state == "reconnected"
                    else "连接暂时中断，正在自动重连，请稍候。"
                )
                await writer.aclose()
            except Exception:
                logger.exception("Could not publish interview connection status")

        self._tail = asyncio.create_task(publish())

    async def aclose(self):
        if self._tail is not None:
            await self._tail
