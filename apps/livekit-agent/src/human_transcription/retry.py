"""The sole reconnection owner for a human participant's STT stream."""

import asyncio
from collections.abc import Awaitable, Callable


async def capture_with_retries(
    capture: Callable[[], Awaitable[bool]],
    stopping: asyncio.Event,
    delay: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    for attempt in range(3):
        if stopping.is_set():
            return
        if await capture():
            return
        if attempt < 2 and not stopping.is_set():
            await delay(attempt + 1)
