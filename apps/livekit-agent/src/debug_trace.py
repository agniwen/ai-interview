"""Opt-in JSONL trace of a realtime interview for local review.

The trace contains candidate speech, saved answers and the instructions sent to
the voice model, so enable it only on development machines by setting
REALTIME_TRACE_DIR. Each room gets one append-only file.
"""

import json
import os
import time
from pathlib import Path
from typing import Any

from livekit.agents import get_job_context


def trace(event: str, **data: Any) -> None:
    directory = os.environ.get("REALTIME_TRACE_DIR", "").strip()
    if not directory:
        return
    try:
        room = get_job_context().room.name
    except RuntimeError:
        room = "local"
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    record = {"ts": round(time.time(), 3), "event": event, **data}
    with (path / f"{room}.jsonl").open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
