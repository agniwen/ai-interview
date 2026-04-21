import asyncio
import json
import logging
import os
import re
import time

import httpx
import openai as openai_sdk

from prompts import EVALUATION_PROMPT, SUMMARY_PROMPT

logger = logging.getLogger("agent")


def _format_transcript(turns: list[dict]) -> str:
    lines = []
    for t in turns:
        role = "面试官" if t["role"] == "agent" else "候选人"
        lines.append(f"{role}: {t['message']}")
    return "\n".join(lines)


def _format_questions(questions: list[dict]) -> str:
    lines = []
    for q in questions:
        lines.append(
            f"{q.get('order', '')}. [{q.get('difficulty', '')}] {q.get('question', '')}"
        )
    return "\n".join(lines)


async def generate_report(
    turns: list[dict],
    interview_questions: list[dict],
) -> tuple[str | None, dict]:
    """Generate transcript summary and evaluation using LLM.

    Returns (summary, evaluation_dict). On failure returns (None, {}).
    """
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    if not api_key:
        logger.warning("DASHSCOPE_API_KEY not set, skipping report generation")
        return None, {}
    if not turns:
        return None, {}

    transcript_text = _format_transcript(turns)
    questions_text = _format_questions(interview_questions)

    client = openai_sdk.AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
    )

    summary: str | None = None
    evaluation: dict = {}

    try:
        summary_resp = await client.chat.completions.create(
            model="qwen-turbo-latest",
            messages=[
                {
                    "role": "user",
                    "content": SUMMARY_PROMPT.format(transcript=transcript_text),
                }
            ],
            extra_body={"enable_thinking": False},
        )
        summary = summary_resp.choices[0].message.content
    except Exception:
        logger.exception("failed to generate transcript summary")

    try:
        eval_resp = await client.chat.completions.create(
            model="qwen-turbo-latest",
            messages=[
                {
                    "role": "user",
                    "content": EVALUATION_PROMPT.format(
                        questions=questions_text,
                        transcript=transcript_text,
                    ),
                }
            ],
            extra_body={"enable_thinking": False},
        )
        eval_text = eval_resp.choices[0].message.content or ""
        json_match = re.search(r"\{[\s\S]*\}", eval_text)
        if json_match:
            evaluation = json.loads(json_match.group())
    except Exception:
        logger.exception("failed to generate evaluation")

    return summary, evaluation


async def send_report(
    interview_context: dict,
    room_name: str,
    turns: list[dict],
    summary: str | None,
    evaluation: dict,
    call_successful: str,
    started_at: float,
    ended_at: float,
    close_reason: str,
) -> None:
    """POST the interview report to the backend API."""
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
        "status": "done",
        "callSuccessful": call_successful,
        "transcript": turns,
        "transcriptSummary": summary,
        "evaluationCriteriaResults": evaluation,
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

    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(2):
            try:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code < 300:
                    logger.info("report sent successfully: %s", resp.json())
                    return
                logger.error("report API returned %d: %s", resp.status_code, resp.text)
            except Exception:
                logger.exception("failed to send report (attempt %d)", attempt + 1)

            if attempt == 0:
                await asyncio.sleep(2)

    logger.error(
        "report send failed after retries, payload: %s",
        json.dumps(payload, ensure_ascii=False)[:2000],
    )
