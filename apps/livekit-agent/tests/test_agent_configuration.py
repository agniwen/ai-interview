import json
import logging
from typing import ClassVar

import report as report_module
from agent_config import resolve_agent_name, resolve_self_hosted
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


class _SuccessfulResponse:
    status_code = 201


class _CapturingClient:
    calls: ClassVar[list] = []

    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return _SuccessfulResponse()


def test_agent_name_defaults_to_existing_dispatch_name():
    assert resolve_agent_name({}) == "giaogiao"
    assert resolve_agent_name({"AGENT_NAME": "  "}) == "giaogiao"


def test_agent_name_uses_trimmed_environment_override():
    assert (
        resolve_agent_name({"AGENT_NAME": "  interview-agent  "}) == "interview-agent"
    )


def test_self_hosted_mode_defaults_on_for_private_deployments():
    assert resolve_self_hosted({}) is True
    assert resolve_self_hosted({"INTERVIEW_SELF_HOSTED": "1"}) is True
    assert resolve_self_hosted({"INTERVIEW_SELF_HOSTED": "0"}) is False


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
                "schemaVersion": 2,
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
                "questions": [
                    {
                        "id": "question-1",
                        "content": "请介绍一个项目。",
                        "difficulty": "easy",
                        "evaluationFocus": None,
                        "followUpDirections": None,
                    }
                ],
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


async def test_question_checkpoint_posts_one_idempotent_outcome(monkeypatch):
    _CapturingClient.calls = []
    monkeypatch.setenv("CALLBACK_BASE_URL", "https://example.test")
    monkeypatch.setenv("AGENT_CALLBACK_SECRET", "secret")
    monkeypatch.setattr(report_module.httpx, "AsyncClient", _CapturingClient)

    await report_module.send_question_checkpoint(
        conversation_id="room-1",
        interview_record_id="record-1",
        schedule_entry_id="round-1",
        outcome={
            "answerSummary": "说明了项目职责",
            "difficulty": "easy",
            "endedAtSecs": 30,
            "evaluationFocus": None,
            "followUpCount": 0,
            "followUpDirections": None,
            "question": "请介绍一个项目。",
            "questionId": "question-1",
            "reason": None,
            "revision": 1,
            "startedAtSecs": 10,
            "status": "answered",
        },
    )

    assert _CapturingClient.calls == [
        (
            "https://example.test/api/agent/checkpoint",
            {
                "headers": {
                    "Content-Type": "application/json",
                    "X-Agent-Secret": "secret",
                },
                "json": {
                    "conversationId": "room-1",
                    "interviewRecordId": "record-1",
                    "outcome": {
                        "answerSummary": "说明了项目职责",
                        "difficulty": "easy",
                        "endedAtSecs": 30,
                        "evaluationFocus": None,
                        "followUpCount": 0,
                        "followUpDirections": None,
                        "question": "请介绍一个项目。",
                        "questionId": "question-1",
                        "reason": None,
                        "revision": 1,
                        "startedAtSecs": 10,
                        "status": "answered",
                    },
                    "scheduleEntryId": "round-1",
                },
            },
        )
    ]
