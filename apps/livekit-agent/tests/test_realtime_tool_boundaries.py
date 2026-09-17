"""Deterministic tool guards, complementary to real-room voice E2E."""

import pytest
from livekit.agents import ToolError
from test_realtime_interview_agent import context

from realtime_interview_agent import RealtimeInterviewAgent


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("set_active_topics", {"question_ids": []}),
        ("set_active_topics", {"question_ids": ["q1", "unknown"]}),
        (
            "record_answer",
            {
                "question_id": "unknown",
                "status": "answered",
                "answer_summary": "订单服务",
            },
        ),
        (
            "record_answer",
            {"question_id": "q1", "status": "answered", "answer_summary": "  "},
        ),
        (
            "record_answer",
            {"question_id": "q1", "status": "in_progress", "answer_summary": ""},
        ),
        (
            "record_answer",
            {
                "question_id": "q1",
                "status": "skipped",
                "answer_summary": "",
                "reason": " ",
            },
        ),
        (
            "record_answer",
            {
                "question_id": "q1",
                "status": "insufficient",
                "answer_summary": "订单服务",
            },
        ),
        (
            "finish_interview",
            {
                "reason": "completed",
                "final_question_id": "",
                "final_answer_summary": "",
            },
        ),
        (
            "finish_interview",
            {
                "reason": "time_limit",
                "final_question_id": "",
                "final_answer_summary": "",
            },
        ),
    ],
)
async def test_rejected_tool_arguments_leave_session_usable(tool, arguments):
    agent = RealtimeInterviewAgent(context())
    before = await agent.get_interview_state()
    with pytest.raises(ToolError):
        await getattr(agent, tool)(**arguments)
    after = await agent.get_interview_state()
    for field in (
        "completed",
        "active_question_ids",
        "remaining_question_ids",
        "questions",
    ):
        assert after[field] == before[field]
    recovered = await agent.record_answer(
        question_id="q1", status="in_progress", answer_summary="负责订单服务"
    )
    assert recovered["completed"] == 0
    assert agent.question_outcomes[0].answer_summary == "负责订单服务"


async def test_duplicate_topic_ids_and_answers_do_not_inflate_progress():
    agent = RealtimeInterviewAgent(context())
    state = await agent.set_active_topics(question_ids=["q1", "q1"])
    assert state["active_question_ids"] == ["q1"]
    for _ in range(3):
        state = await agent.record_answer(
            question_id="q1", status="answered", answer_summary="负责订单服务"
        )
    assert state["completed"] == 1
    assert agent.question_outcomes[0].revision == 1


async def test_late_tool_call_cannot_reopen_or_mutate_closed_interview():
    agent = RealtimeInterviewAgent(context())
    await agent.finish_interview(
        reason="candidate_requested", final_question_id="", final_answer_summary=""
    )
    saved = tuple(outcome.to_payload() for outcome in agent.question_outcomes)
    with pytest.raises(ToolError):
        await agent.record_answer(
            question_id="q1", status="answered", answer_summary="迟到答案"
        )
    assert tuple(outcome.to_payload() for outcome in agent.question_outcomes) == saved


def test_single_answer_coverage_uses_plain_array_schema_for_realtime_provider():
    from qwen_realtime import _tool_schema

    schema = _tool_schema(RealtimeInterviewAgent(context()).record_answer)
    coverage = schema["function"]["parameters"]["properties"]["covered_topics"]
    assert coverage["type"] == "array"
    assert coverage["items"]["type"] == "string"
    assert "anyOf" not in coverage
