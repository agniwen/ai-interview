"""Durable callbacks, retained until the server acknowledges the raw report."""

import asyncio
import hashlib
import json
import logging
import os
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

import httpx

logger = logging.getLogger("agent.report_outbox")


def outbox_directory() -> Path:
    return Path(os.environ.get("AGENT_REPORT_OUTBOX_DIR", ".data/report-outbox"))


def persist_report(
    base_url: str, payload: dict, *, directory: Path | None = None
) -> Path:
    directory = directory if directory is not None else outbox_directory()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    contents = json.dumps(
        {"baseUrl": base_url.rstrip("/"), "payload": payload},
        ensure_ascii=False,
        sort_keys=True,
    ).encode()
    destination = directory / f"{hashlib.sha256(contents).hexdigest()}.json"
    fd, temporary = tempfile.mkstemp(dir=directory, prefix=".pending-")
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(contents)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, destination)
        directory_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return destination


async def replay_pending_reports(
    client: httpx.AsyncClient,
    base_url: str,
    secret: str,
    *,
    directory: Path | None = None,
) -> None:
    directory = directory if directory is not None else outbox_directory()
    # Immutable file names make concurrent sends harmless: server receipts dedupe
    # the exact payload, and neither sender can remove a different report.
    for path in sorted(directory.glob("*.json"))[:100]:
        try:
            envelope = json.loads(path.read_text())
            if envelope["baseUrl"] != base_url.rstrip("/"):
                continue
            response = await client.post(
                f"{base_url.rstrip('/')}/api/agent/report",
                json=envelope["payload"],
                headers={"X-Agent-Secret": secret},
            )
            if 200 <= response.status_code < 300:
                path.unlink(missing_ok=True)
            else:
                logger.warning(
                    "report remains pending: receipt=%s status=%d",
                    path.stem,
                    response.status_code,
                )
        except FileNotFoundError:
            continue
        except Exception:
            logger.exception("report replay deferred: receipt=%s", path.stem)


async def watch_reports() -> None:
    from report import callback_uses_environment

    base_url = os.environ["CALLBACK_BASE_URL"]
    secret = os.environ.get("AGENT_CALLBACK_SECRET", "")
    async with httpx.AsyncClient(
        timeout=15, trust_env=callback_uses_environment(base_url)
    ) as client:
        while True:
            await replay_pending_reports(client, base_url, secret)
            await asyncio.sleep(30)


@contextmanager
def report_recovery_process():
    """Run outside per-session job processes so reports survive their shutdown."""
    if not os.environ.get("CALLBACK_BASE_URL") or not any(
        command in sys.argv[1:] for command in ("start", "dev")
    ):
        yield
        return
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve())])
    try:
        yield
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(watch_reports())
