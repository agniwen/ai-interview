import json
from types import SimpleNamespace

import pytest

import interview_agent as interview_agent_module
from dispatch_context import parse_dispatch_context
from interview_agent import (
    INTERVIEW_FINAL_WRAP_SECONDS,
    INTERVIEW_HARD_GRACE_SECONDS,
    INTERVIEW_SOFT_WRAP_SECONDS,
    INTERVIEW_TIME_LIMIT_SECONDS,
    InterviewAgent,
    _is_noise_transcript,
)


def _ctx(
    *,
    candidate_name="郭靖",
    target_role="后端工程师",
    system="最终系统提示词",
    opening="你好郭靖",
    closing="再见郭靖",
):
    payload = {
        "schemaVersion": 2,
        "session": {
            "allowTextInput": True,
            "interviewRecordId": "record-1",
            "roundId": "round-1",
        },
        "candidate": {"name": candidate_name, "targetRole": target_role},
        "recording": {"enabled": False, "fileKey": None},
        "selectedInterviewer": None,
        "prompts": {
            "system": system,
            "opening": opening,
            "closing": closing,
        },
        "questions": [
            {
                "id": "question-1",
                "content": "请介绍一次故障排查经历。",
                "difficulty": "medium",
                "evaluationFocus": "确认候选人能够定位并复盘线上故障",
                "followUpDirections": "追问定位信号、根因与预防措施",
            }
        ],
    }
    return parse_dispatch_context(json.dumps(payload, ensure_ascii=False))


class _FakeSpeechHandle:
    def __init__(self):
        self.waited = False

    async def wait_for_playout(self):
        self.waited = True


class _FakeSession:
    def __init__(self):
        self.calls = []
        self.handle = _FakeSpeechHandle()

    def say(self, text, **kwargs):
        self.calls.append((text, kwargs))
        return self.handle

    async def generate_reply(self, **kwargs):
        self.calls.append((None, kwargs))
        return self.handle


def test_uses_dispatch_prompts_and_appends_chinese_language_policy():
    a = InterviewAgent(
        _ctx(
            system="TS 生成的最终 system prompt",
            opening="TS 生成的最终 opening prompt",
            closing="TS 生成的最终 closing prompt",
        )
    )

    assert a.instructions.startswith("TS 生成的最终 system prompt")
    assert "全程使用简体中文" in a.instructions
    assert a._opening_instructions == "TS 生成的最终 opening prompt"
    assert a._closing_instructions == "TS 生成的最终 closing prompt"


def test_uses_typed_candidate_fields_from_dispatch_contract():
    a = InterviewAgent(_ctx(candidate_name="王五", target_role="数据工程师"))

    assert a._candidate_name == "王五"
    assert a._target_role == "数据工程师"


@pytest.mark.asyncio
async def test_ready_candidate_runs_the_required_question_task_group(monkeypatch):
    async def ready():
        return True

    session = _FakeSession()
    a = InterviewAgent(_ctx())
    captured = {}

    class FakeGroup:
        def __await__(self):
            async def run():
                return SimpleNamespace(task_results={})

            return run().__await__()

    def fake_build_question_task_group(questions, **kwargs):
        captured["questions"] = questions
        captured["kwargs"] = kwargs
        return FakeGroup()

    async def fake_wrap_up(_tool, **_kwargs):
        return None

    monkeypatch.setattr(
        interview_agent_module,
        "ReadyCheckTask",
        lambda **_kwargs: ready(),
    )
    monkeypatch.setattr(
        interview_agent_module,
        "build_question_task_group",
        fake_build_question_task_group,
    )
    monkeypatch.setattr(interview_agent_module, "WrapUpTask", fake_wrap_up)
    monkeypatch.setattr(
        a,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=session),
    )

    await a.on_enter()

    assert [question.id for question in captured["questions"]] == ["question-1"]
    assert session.calls == []


@pytest.mark.asyncio
async def test_declined_candidate_uses_wrap_up_without_another_question(monkeypatch):
    async def declined():
        return False

    session = _FakeSession()
    a = InterviewAgent(_ctx())
    captured = {}

    async def fake_wrap_up(tool, **kwargs):
        captured["tool"] = tool
        captured["kwargs"] = kwargs

    monkeypatch.setattr(
        interview_agent_module,
        "ReadyCheckTask",
        lambda **_kwargs: declined(),
    )
    monkeypatch.setattr(interview_agent_module, "WrapUpTask", fake_wrap_up)
    monkeypatch.setattr(
        a,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=session),
    )

    await a.on_enter()

    assert captured["tool"] is a._end_call_tool
    assert captured["kwargs"] == {"ask_closing_question": False}
    assert a.call_completion_status == "partial"
    assert [outcome.status for outcome in a.question_outcomes] == ["unasked"]
    assert session.calls == []


def test_default_timeline_warns_at_21_and_hard_cuts_at_25():
    a = InterviewAgent(_ctx())

    assert INTERVIEW_SOFT_WRAP_SECONDS == 18 * 60 + 30
    assert INTERVIEW_FINAL_WRAP_SECONDS == 21 * 60
    assert a.time_limit_seconds == 24 * 60
    assert INTERVIEW_TIME_LIMIT_SECONDS + INTERVIEW_HARD_GRACE_SECONDS == 25 * 60


@pytest.mark.asyncio
async def test_user_turn_exceeded_uses_fixed_non_interruptible_cue(monkeypatch):
    session = _FakeSession()
    a = InterviewAgent(_ctx())
    monkeypatch.setattr(
        a,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=session),
    )

    await a.on_user_turn_exceeded(
        SimpleNamespace(
            accumulated_word_count=601,
            accumulated_transcript="我想继续展开讲很多项目细节。",
        )
    )

    assert session.calls == [
        (
            "我先打断一下。为了控制面试时间，请用一两句话收个尾，"
            "然后我们继续下一个问题。",
            {"allow_interruptions": False},
        )
    ]
    assert session.handle.waited is True


def test_noise_transcript_filters_punctuation_only_text():
    for text in ("", "   ", "。", "，", "...", "？！", "。 。"):
        assert _is_noise_transcript(text)


def test_noise_transcript_filters_fillers():
    for text in ("嗯", "呃。", "emmm...", "uh?"):
        assert _is_noise_transcript(text)


def test_noise_transcript_keeps_meaningful_text():
    for text in ("我有三年后端经验。", "C++", "2024 年开始做 LiveKit"):
        assert not _is_noise_transcript(text)


def test_parent_agent_does_not_expose_end_call_tool():
    a = InterviewAgent(_ctx())

    tool_names = []
    for tool in a.tools:
        info = getattr(tool, "info", None)
        name = getattr(info, "name", None) if info is not None else None
        tool_names.append(name or getattr(tool, "name", type(tool).__name__))

    assert "end_call" not in tool_names
    assert a._end_call_tool is not None


def test_finalize_missing_outcomes_prefers_workflow_stop_reason():
    a = InterviewAgent(_ctx())
    a.note_workflow_stop("candidate_ended_round")
    a.finalize_missing_question_outcomes()

    outcomes = a.question_outcomes
    assert len(outcomes) == 1
    assert outcomes[0].status.value == "unasked"
    assert outcomes[0].reason == "candidate_ended_round"


def test_has_incomplete_required_questions_before_any_outcome():
    a = InterviewAgent(_ctx())
    assert a.has_incomplete_required_questions is True
