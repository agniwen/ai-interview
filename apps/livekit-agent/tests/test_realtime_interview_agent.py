from dataclasses import replace

import pytest
from livekit.agents import ToolError
from test_interview_agent_init import _ctx

from dispatch_context import DispatchQuestion
from realtime_interview_agent import AnswerUpdate, RealtimeInterviewAgent


def context():
    return replace(
        _ctx(),
        questions=(
            DispatchQuestion("q1", "项目职责", "medium", "实际参与", "职责和成果"),
            DispatchQuestion("q2", "离职原因", "easy", None, None),
        ),
    )


async def test_cross_question_answers_and_progress_are_saved_without_task_order():
    checkpoints = []

    async def save(outcome):
        checkpoints.append(outcome)

    agent = RealtimeInterviewAgent(context(), on_question_completed=save)
    state = await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q2", status="answered", answer_summary="团队解散"
            ),
            AnswerUpdate(
                question_id="q1",
                status="answered",
                answer_summary="负责订单服务",
                covered_topics=["职责"],
            ),
        ]
    )
    assert state["total"] == 2
    assert state["completed"] == 2
    assert state["remaining_question_ids"] == []
    assert [q.question_id for q in checkpoints] == ["q2", "q1"]
    assert {q.question_id: q.answer_summary for q in agent.question_outcomes} == {
        "q1": "负责订单服务",
        "q2": "团队解散",
    }


async def test_corrections_have_new_revision_and_identical_retries_are_idempotent():
    agent = RealtimeInterviewAgent(context())
    first = AnswerUpdate(
        question_id="q1", status="answered", answer_summary="负责订单服务"
    )
    await agent.record_answers(updates=[first])
    await agent.record_answers(updates=[first])
    assert agent.question_outcomes[0].revision == 1
    await agent.record_answers(
        updates=[first.model_copy(update={"answer_summary": "负责订单服务和部署"})]
    )
    assert agent.question_outcomes[0].revision == 2


async def test_drafts_and_refusals_follow_the_checkpoint_contract():
    agent = RealtimeInterviewAgent(context())
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1", status="in_progress", answer_summary="负责订单服务"
            )
        ]
    )
    draft = agent.question_outcomes[0].to_payload()
    assert draft["status"] == "in_progress"
    assert draft["reason"] is None
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q2",
                status="skipped",
                answer_summary="",
                reason="候选人不方便说明离职原因",
            )
        ]
    )
    skipped = agent.question_outcomes[1].to_payload()
    assert skipped["reason"] is None
    assert "不方便" in skipped["answerSummary"]


async def test_finishing_saves_the_final_answer_before_deciding_completeness():
    agent = RealtimeInterviewAgent(context())
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1", status="answered", answer_summary="负责订单服务"
            )
        ]
    )
    await agent.finish_interview(
        reason="completed",
        final_question_id="q2",
        final_answer_summary="团队解散",
    )
    assert agent.call_completion_status == "success"
    assert all(outcome.status == "answered" for outcome in agent.question_outcomes)


async def test_invalid_batch_does_not_partially_save_or_invent_question_ids():
    agent = RealtimeInterviewAgent(context())
    with pytest.raises(ToolError):
        await agent.record_answers(
            updates=[
                AnswerUpdate(
                    question_id="q1", status="answered", answer_summary="实际回答"
                ),
                AnswerUpdate(
                    question_id="unknown", status="answered", answer_summary="虚构题目"
                ),
            ]
        )
    assert agent.question_outcomes == ()
    with pytest.raises(ToolError):
        await agent.record_answers(
            updates=[
                AnswerUpdate(question_id="q1", status="answered", answer_summary=" ")
            ]
        )


async def test_partial_answer_survives_disconnect_without_becoming_complete():
    agent = RealtimeInterviewAgent(context())
    await agent.set_active_topics(question_ids=["q1"])
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1", status="in_progress", answer_summary="提到了订单项目"
            )
        ]
    )
    state = await agent.get_interview_state()
    assert state["completed"] == 0
    assert state["active_question_ids"] == ["q1"]
    agent.finalize_missing_question_outcomes("reconnect_grace_expired")
    outcomes = {q.question_id: q for q in agent.question_outcomes}
    assert outcomes["q1"].status.value == "interrupted"
    assert outcomes["q1"].answer_summary == "提到了订单项目"
    assert outcomes["q2"].status.value == "unasked"


async def test_finish_reports_missing_information_but_allows_candidate_to_stop():
    agent = RealtimeInterviewAgent(context())
    with pytest.raises(ToolError, match="尚未处理"):
        await agent.finish_interview(
            reason="completed", final_question_id="", final_answer_summary=""
        )
    closing = await agent.finish_interview(
        reason="candidate_requested", final_question_id="", final_answer_summary=""
    )
    assert agent.call_completion_status == "partial"
    assert agent.workflow_stop_reason == "candidate_ended_round"
    assert [tool.info.name for tool in closing.tools[0].tools] == ["end_call"]


def test_prompt_uses_information_goals_instead_of_old_pipeline_rules():
    agent = RealtimeInterviewAgent(context())
    assert "信息清单" in agent.instructions
    assert "一次回答" in agent.instructions
    assert "逐题状态机" not in agent.instructions
    assert {tool.info.name for tool in agent.tools} == {
        "get_interview_state",
        "set_active_topics",
        "record_answer",
        "finish_interview",
    }


async def test_early_exit_cannot_turn_the_exit_request_into_an_answer():
    agent = RealtimeInterviewAgent(context())
    await agent.set_active_topics(question_ids=["q1"])
    with pytest.raises(ToolError):
        await agent.finish_interview(
            reason="candidate_requested",
            final_question_id="q1",
            final_answer_summary="有急事需要结束",
        )
    assert not agent.question_outcomes
    await agent.finish_interview(
        reason="candidate_requested",
        final_question_id="",
        final_answer_summary="",
    )
    assert agent.question_outcomes[0].status.value == "interrupted"
