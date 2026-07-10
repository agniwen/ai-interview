import json
import logging

import report as report_module
from agent_config import resolve_agent_name
from dispatch_context import parse_dispatch_context


class _Response:
    status_code = 503
    text = "候选人的私密面试回答"


class _FailingClient:
    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, *_args, **_kwargs):
        return _Response()


def test_agent_name_defaults_to_existing_dispatch_name():
    assert resolve_agent_name({}) == "giaogiao"
    assert resolve_agent_name({"AGENT_NAME": "  "}) == "giaogiao"


def test_agent_name_uses_trimmed_environment_override():
    assert (
        resolve_agent_name({"AGENT_NAME": "  interview-agent  "}) == "interview-agent"
    )


async def test_report_failure_log_does_not_include_transcript(caplog, monkeypatch):
    secret_transcript = _Response.text

    async def no_sleep(_seconds):
        return None

    monkeypatch.setenv("CALLBACK_BASE_URL", "https://example.test")
    monkeypatch.setattr(report_module.httpx, "AsyncClient", _FailingClient)
    monkeypatch.setattr(report_module.asyncio, "sleep", no_sleep)
    caplog.set_level(logging.ERROR, logger="agent")

    interview_context = parse_dispatch_context(
        json.dumps(
            {
                "schemaVersion": 1,
                "session": {
                    "allowTextInput": True,
                    "interviewRecordId": "record-1",
                    "roundId": "round-1",
                },
                "candidate": {"name": "候选人", "targetRole": "工程师"},
                "recording": {"enabled": False, "fileKey": None},
                "selectedInterviewer": None,
                "prompts": {
                    "system": "system",
                    "opening": "opening",
                    "closing": "closing",
                },
            }
        )
    )

    await report_module.send_report(
        interview_context=interview_context,
        room_name="room-1",
        turns=[{"role": "user", "message": secret_transcript}],
        call_successful="failed",
        started_at=1,
        ended_at=2,
        close_reason="error",
    )

    assert secret_transcript not in caplog.text
    assert "record-1" in caplog.text
    assert "room-1" in caplog.text
    assert "turn_count=1" in caplog.text
