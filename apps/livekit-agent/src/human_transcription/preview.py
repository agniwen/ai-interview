"""Bounded, ephemeral UI delivery; the durable outbox remains authoritative."""

import asyncio
import json
import logging
from collections import OrderedDict

logger = logging.getLogger(__name__)
TOPIC = "human-transcription.preview.v1"


class PreviewPublisher:
    def __init__(self, publish, scope: dict, audience: list[str]):
        self.publish = publish
        self.scope = scope
        self.audience = audience
        self.sequence = 0
        self.pending: OrderedDict[tuple, bytes] = OrderedDict()
        self.ready = asyncio.Event()

    def offer(self, event: dict) -> None:
        # LiveKit treats an empty audience as a room-wide broadcast.
        if not self.audience:
            return
        self.sequence += 1
        packet = json.dumps(
            {**self.scope, "sequence": self.sequence, "event": event},
            ensure_ascii=False,
        ).encode()
        # Leave room for RTC headers. Large sentences still arrive via SSE.
        if len(packet) > 14_000:
            return
        key = (event["streamEpoch"], event["providerTaskId"], event["itemId"])
        self.pending[key] = packet
        if len(self.pending) > 64:
            self.pending.popitem(last=False)
        self.ready.set()

    async def run(self) -> None:
        while True:
            await self.ready.wait()
            self.ready.clear()
            while self.pending:
                _, packet = self.pending.popitem(last=False)
                try:
                    # https://docs.livekit.io/transport/data/packets/
                    async with asyncio.timeout(1):
                        await self.publish(
                            packet,
                            reliable=True,
                            destination_identities=self.audience,
                            topic=TOPIC,
                        )
                except Exception:
                    logger.debug(
                        "subtitle preview unavailable; durable delivery continues"
                    )
