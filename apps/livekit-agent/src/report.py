import asyncio
import logging
import os
import time

import httpx

from agent_config import resolve_agent_name
from dispatch_context import InterviewDispatchContext

logger = logging.getLogger("agent")


async def send_report(
    interview_context: InterviewDispatchContext,
    room_name: str,
    turns: list[dict],
    call_successful: str,
    started_at: float,
    ended_at: float,
    close_reason: str,
    recording: dict | None = None,
    metrics: dict | None = None,
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
        "interviewRecordId": interview_context.session.interview_record_id,
        "scheduleEntryId": interview_context.session.round_id,
        "agentId": resolve_agent_name(),
        "status": "completed",
        "callSuccessful": call_successful,
        "transcript": turns,
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started_at)),
        "endedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ended_at)),
        "metadata": {
            "roomName": room_name,
            "closeReason": close_reason,
        },
        "metrics": metrics or {},
        "recording": recording,
    }

    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Agent-Secret"] = secret

    url = f"{base_url.rstrip('/')}/api/agent/report"

    # Short timeout — the backend is supposed to return as soon as the
    # transcript is saved; the LLM summary runs in the background.
    # 退避 1s / 2s: 总共 3 次尝试, 失败后不再 sleep 直接落到末尾错误日志.
    # 之前固定 1s 间隔两次重试会撞在同一后端压力窗口里.
    # Exponential backoff (1s, 2s): 3 total attempts, no trailing sleep after
    # the last failure. The previous fixed-1s strategy landed both retries
    # inside the same backend pressure window during transient overload.
    backoff_seconds = (1, 2)
    total_attempts = len(backoff_seconds) + 1
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(total_attempts):
            try:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code < 300:
                    logger.info("report sent successfully: %s turns", len(turns))
                    return
                logger.error(
                    "report API returned %d: conversation_id=%s interview_record_id=%s",
                    resp.status_code,
                    room_name,
                    interview_context.session.interview_record_id,
                )
            except Exception:
                logger.exception("failed to send report (attempt %d)", attempt + 1)

            if attempt < len(backoff_seconds):
                await asyncio.sleep(backoff_seconds[attempt])

    logger.error(
        "report send failed after retries: conversation_id=%s "
        "interview_record_id=%s schedule_entry_id=%s turn_count=%d "
        "close_reason=%s",
        room_name,
        interview_context.session.interview_record_id,
        interview_context.session.round_id,
        len(turns),
        close_reason,
    )
