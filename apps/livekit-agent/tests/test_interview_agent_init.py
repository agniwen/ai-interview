import json
from types import SimpleNamespace

import pytest

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
        "schemaVersion": 1,
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


def test_uses_final_prompts_from_dispatch_contract_without_rebuilding():
    a = InterviewAgent(
        _ctx(
            system="TS 生成的最终 system prompt",
            opening="TS 生成的最终 opening prompt",
            closing="TS 生成的最终 closing prompt",
        )
    )

    assert a.instructions == "TS 生成的最终 system prompt"
    assert a._opening_instructions == "TS 生成的最终 opening prompt"
    assert a._closing_instructions == "TS 生成的最终 closing prompt"


def test_uses_typed_candidate_fields_from_dispatch_contract():
    a = InterviewAgent(_ctx(candidate_name="王五", target_role="数据工程师"))

    assert a._candidate_name == "王五"
    assert a._target_role == "数据工程师"


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
