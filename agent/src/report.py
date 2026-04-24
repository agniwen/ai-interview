import asyncio
import json
import logging
import os
import time

import httpx

logger = logging.getLogger("agent")


async def send_report(
    interview_context: dict,
    room_name: str,
    turns: list[dict],
    call_successful: str,
    started_at: float,
    ended_at: float,
    close_reason: str,
) -> None:
    """POST raw transcript to the backend. Summary + evaluation are generated
    server-side asynchronously (fire-and-forget in the Node process), so this
    call should return in well under a second.

    Retries twice on transient failure; any remaining gap is handled by the
    backend recovery endpoint (`/api/agent/retry-summaries`) or by re-POSTing
    the payload manually. The backend upserts by conversationId, so retries
    are idempotent.
    """
    base_url = os.environ.get("CALLBACK_BASE_URL")
    secret = os.environ.get("AGENT_CALLBACK_SECRET")

    if not base_url:
        logger.warning("CALLBACK_BASE_URL not set, skipping report")
        return

    payload = {
        "conversationId": room_name,
        "interviewRecordId": interview_context.get("interview_record_id", ""),
        "scheduleEntryId": interview_context.get("round_id", ""),
        "agentId": "giaogiao",
        "status": "completed",
        "callSuccessful": call_successful,
        "transcript": turns,
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started_at)),
        "endedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ended_at)),
        "metadata": {
            "roomName": room_name,
            "closeReason": close_reason,
        },
    }

    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Agent-Secret"] = secret

    url = f"{base_url.rstrip('/')}/api/agent/report"

    # Short timeout — the backend is supposed to return as soon as the
    # transcript is saved; the LLM summary runs in the background.
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(2):
            try:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code < 300:
                    logger.info("report sent successfully: %s turns", len(turns))
                    return
                logger.error("report API returned %d: %s", resp.status_code, resp.text)
            except Exception:
                logger.exception("failed to send report (attempt %d)", attempt + 1)

            if attempt == 0:
                await asyncio.sleep(1)

    logger.error(
        "report send failed after retries, payload: %s",
        json.dumps(payload, ensure_ascii=False)[:2000],
    )
