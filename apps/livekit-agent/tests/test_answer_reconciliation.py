import asyncio
import logging
import time

import pytest
from livekit.agents import ToolError
from test_realtime_interview_agent import context

from realtime_interview_agent import AnswerUpdate, RealtimeInterviewAgent


async def test_transcript_recovers_answers_without_voice_tool_calls():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 10)
    await agent.reconcile_answers()
    state = await agent.get_interview_state()
    assert state["questions"][1]["status"] == "answered"
    await agent._memory_sync_task
    assert "q2｜answered｜团队解散" in agent.instructions
    agent.finalize_missing_question_outcomes("candidate_ended_round")
    assert agent.question_outcomes[1].answer_summary == "团队解散"


async def test_rejects_agent_quotes_and_invented_evidence():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "a1", "quote": "团队解散"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("a1", "agent", "是否团队解散？", 1)
    agent.observe_turn("u1", "user", "不是", 2)
    await agent.reconcile_answers()
    assert agent.question_outcomes == ()


async def test_stale_extraction_rechecks_new_correction_and_tools_cannot_erase_it():
    started = asyncio.Event()
    release = asyncio.Event()
    calls = []

    async def extract(questions, turns):
        calls.append(turns)
        if len(calls) == 1:
            started.set()
            await release.wait()
        last = turns[-1]
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": last["message"],
                "evidence": [{"turn_id": last["id"], "quote": last["message"]}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "月薪50000，团队50人", 1)
    task = asyncio.create_task(agent.reconcile_answers())
    await started.wait()
    agent.observe_turn("u2", "user", "更正：月薪42000，团队50人", 2)
    release.set()
    await task
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1", status="in_progress", answer_summary="团队50人"
            )
        ]
    )
    assert agent.question_outcomes[0].answer_summary == "更正：月薪42000，团队50人"
    assert len(calls) == 2


async def test_failed_extraction_preserves_existing_answers_and_can_retry():
    async def extract(questions, turns):
        raise TimeoutError("provider timeout")

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    await agent.record_answers(
        updates=[
            AnswerUpdate(question_id="q2", status="answered", answer_summary="团队解散")
        ]
    )
    assert agent.question_outcomes[0].answer_summary == "团队解散"
    assert (await agent.get_interview_state())["reconciliation_status"] == "failed"


async def test_failed_new_revision_does_not_overwrite_tool_correction_with_stale_fact():
    async def extract(questions, turns):
        if len(turns) > 1:
            raise TimeoutError("provider timeout")
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "管理3人",
                "evidence": [{"turn_id": "u1", "quote": "管理3人"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "管理3人", 1)
    await agent.reconcile_answers()
    agent.observe_turn("u2", "user", "更正：管理5人", 2)
    await agent.record_answers(
        updates=[
            AnswerUpdate(question_id="q1", status="answered", answer_summary="管理5人")
        ]
    )
    assert agent.question_outcomes[0].answer_summary == "管理5人"


async def test_instruction_sync_failure_retries_verified_facts(monkeypatch):
    async def extract(questions, turns):
        return [
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    original = agent.update_instructions
    calls = 0

    async def sync(instructions):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ConnectionError("session update failed")
        await original(instructions)

    monkeypatch.setattr(agent, "update_instructions", sync)
    agent.observe_turn("u1", "user", "团队解散", 1)
    await agent.reconcile_answers()
    await agent._memory_sync_task
    assert (await agent.get_interview_state())["reconciliation_status"] == "ready"
    await agent._memory_sync_task
    assert agent._memory_sync_status == "ready"
    assert calls == 2


async def test_omitted_question_does_not_reuse_stale_verification_for_new_correction():
    async def extract(questions, turns):
        if len(turns) > 1:
            return []
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "管理3人",
                "evidence": [{"turn_id": "u1", "quote": "管理3人"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "管理3人", 1)
    await agent.reconcile_answers()
    agent.observe_turn("u2", "user", "更正：管理5人", 2)
    await agent.record_answers(
        updates=[
            AnswerUpdate(question_id="q1", status="answered", answer_summary="管理5人")
        ]
    )
    assert agent.question_outcomes[0].answer_summary == "管理5人"


async def test_voice_tool_can_finish_while_memory_transport_waits_for_ack(monkeypatch):
    started, release = asyncio.Event(), asyncio.Event()

    async def extract(questions, turns):
        return [
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)

    async def update(instructions):
        started.set()
        await release.wait()

    monkeypatch.setattr(agent, "update_instructions", update)
    agent.observe_turn("u1", "user", "团队解散", 1)
    agent.schedule_reconciliation()
    await started.wait()
    try:
        state = await asyncio.wait_for(
            agent.record_answers(
                updates=[
                    AnswerUpdate(
                        question_id="q2", status="answered", answer_summary="团队解散"
                    )
                ]
            ),
            0.2,
        )
        assert state["updated"]["q2"]["status"] == "answered"
    finally:
        release.set()
        await agent._reconcile_task
        await agent._memory_sync_task


async def test_null_summary_does_not_discard_other_verified_answers():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "in_progress",
                "answer_summary": None,
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            },
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            },
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    await agent.reconcile_answers()
    assert [(q.question_id, q.answer_summary) for q in agent.question_outcomes] == [
        ("q2", "团队解散")
    ]


async def test_stopping_followup_preserves_verified_facts_without_reopening_draft():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "in_progress",
                "answer_summary": "负责接口开发，月薪9000；团队情况拒绝透露",
                "covered_topics": ["职责"],
                "evidence": [{"turn_id": "u1", "quote": "月薪9000"}],
            },
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            },
        ]

    for status in ("skipped", "insufficient"):
        agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
        agent.observe_turn(
            "u1", "user", "负责接口开发，月薪9000。团队解散。其他不说了，现在结束。", 1
        )
        await agent.record_answers(
            updates=[
                AnswerUpdate(
                    question_id="q1",
                    status=status,
                    answer_summary="不愿补充",
                    reason="候选人拒绝补充其他细节",
                )
            ]
        )
        state = await agent.get_interview_state()
        assert state["completed"] == 2
        assert state["questions"][0]["status"] == status
        assert "月薪9000" in state["questions"][0]["answer_summary"]
        await agent.finish_interview(
            reason="completed", final_question_id="", final_answer_summary=""
        )
        assert agent._closing


def _hanging_extractor():
    calls = []

    async def extract(questions, turns):
        calls.append(turns)
        await asyncio.Event().wait()

    return extract, calls


async def test_saving_answers_never_waits_for_slow_reconciliation():
    extract, _calls = _hanging_extractor()
    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    agent.schedule_reconciliation()
    try:
        state = await asyncio.wait_for(
            agent.record_answers(
                updates=[
                    AnswerUpdate(
                        question_id="q2", status="answered", answer_summary="团队解散"
                    )
                ]
            ),
            0.2,
        )
        assert state["updated"]["q2"]["status"] == "answered"
    finally:
        agent._reconcile_task.cancel()


async def test_state_check_waits_only_briefly_and_reports_running(monkeypatch):
    monkeypatch.setattr("realtime_interview_agent.STATE_RECONCILE_WAIT_SECONDS", 0.05)
    extract, _calls = _hanging_extractor()
    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    try:
        state = await asyncio.wait_for(agent.get_interview_state(), 0.5)
        assert state["reconciliation_status"] == "running"
    finally:
        agent._reconcile_task.cancel()


async def test_finish_waits_only_briefly_for_reconciliation(monkeypatch):
    monkeypatch.setattr("realtime_interview_agent.FINISH_RECONCILE_WAIT_SECONDS", 0.05)
    extract, _calls = _hanging_extractor()
    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    try:
        with pytest.raises(ToolError, match="尚未处理"):
            await asyncio.wait_for(
                agent.finish_interview(
                    reason="completed", final_question_id="", final_answer_summary=""
                ),
                0.5,
            )
    finally:
        agent._reconcile_task.cancel()


async def test_failed_revision_is_retried_only_after_new_speech_or_at_session_end():
    calls = []

    async def extract(questions, turns):
        calls.append(len(turns))
        raise TimeoutError("provider timeout")

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    await agent.get_interview_state()
    await agent.record_answers(
        updates=[
            AnswerUpdate(question_id="q2", status="answered", answer_summary="团队解散")
        ]
    )
    assert (await agent.get_interview_state())["reconciliation_status"] == "failed"
    assert calls == [1]

    agent.observe_turn("u2", "user", "补充一下", 2)
    await agent.get_interview_state()
    assert calls == [1, 2]

    # The post-call report path still makes a final attempt for this revision.
    await agent.reconcile_answers()
    assert calls == [1, 2, 2]


async def test_reconciliation_cannot_stop_a_question_that_was_never_raised():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q2",
                "status": "skipped",
                "answer_summary": "候选人只询问记录情况",
                "reason": "候选人未回答该问题",
                "evidence": [{"turn_id": "u1", "quote": "你那边记下来了吗"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "我前面说的你那边记下来了吗", 1)
    await agent.reconcile_answers()
    state = await agent.get_interview_state()
    assert state["questions"][1]["status"] == "unasked"
    assert state["remaining_question_ids"] == ["q1", "q2"]


async def test_reconciliation_keeps_a_refusal_for_a_question_already_raised():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q2",
                "status": "skipped",
                "answer_summary": "",
                "reason": "不方便透露",
                "evidence": [{"turn_id": "u1", "quote": "这个不方便说"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    await agent.set_active_topics(question_ids=["q2"])
    agent.observe_turn("u1", "user", "这个不方便说", 1)
    await agent.reconcile_answers()
    assert (await agent.get_interview_state())["questions"][1]["status"] == "skipped"


async def test_reconciliation_receives_saved_summaries_to_preserve_facts():
    seen = []

    async def extract(questions, turns):
        seen.append({q["question_id"]: q.get("saved_summary") for q in questions})
        return []

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1",
                status="answered",
                answer_summary="在优品汇做了一年半",
            )
        ]
    )
    agent.observe_turn("u1", "user", "在优品汇做了一年半", 1)
    await agent.reconcile_answers()
    assert seen[-1] == {"q1": "在优品汇做了一年半", "q2": None}


async def test_reconciliation_finishing_after_close_is_not_an_error(caplog):
    started, release = asyncio.Event(), asyncio.Event()

    async def extract(questions, turns):
        started.set()
        await release.wait()
        return [
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    task = agent.schedule_reconciliation()
    await started.wait()
    await agent.finish_interview(
        reason="candidate_requested", final_question_id="", final_answer_summary=""
    )
    with caplog.at_level(logging.ERROR, logger="realtime_interview_agent"):
        release.set()
        await task
    assert not caplog.records
    assert agent._reconciliation_status != "failed"


async def test_an_empty_summary_does_not_fail_the_whole_reconciliation():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "in_progress",
                "answer_summary": "",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            },
            {
                "question_id": "q2",
                "status": "answered",
                "answer_summary": "团队解散",
                "evidence": [{"turn_id": "u1", "quote": "团队解散"}],
            },
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队解散", 1)
    await agent.reconcile_answers()
    state = await agent.get_interview_state()
    assert state["reconciliation_status"] == "ready"
    assert [q["status"] for q in state["questions"]] == ["unasked", "answered"]


async def test_questions_the_interviewer_raised_are_not_reported_as_unasked():
    async def extract(questions, turns):
        return {"answers": [], "asked_question_ids": ["q2"]}

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("a1", "agent", "您离职的原因是什么？", 1)
    agent.observe_turn("u1", "user", "先不聊这个，讲个笑话吧", 2)
    await agent.reconcile_answers()
    agent.finalize_missing_question_outcomes("candidate_ended_round")
    statuses = {o.question_id: o.status.value for o in agent.question_outcomes}
    assert statuses == {"q1": "unasked", "q2": "interrupted"}


async def test_transcript_cannot_override_what_the_voice_model_heard_in_that_turn():
    # The voice model hears the audio; the transcript of the same turn is a
    # weaker ASR copy (COO→CEO, 两万一→2万) and must not overwrite it.
    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "汇报给CEO，月薪2万",
                "evidence": [{"turn_id": "u1", "quote": "汇报给CEO，月薪2万"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    started = time.time()
    await agent.record_answer(
        question_id="q1", status="answered", answer_summary="汇报给COO，月薪21000元"
    )
    agent.observe_turn("u1", "user", "汇报给CEO，月薪2万", 5, started_at=started)
    await agent.reconcile_answers()
    assert agent.question_outcomes[0].answer_summary == "汇报给COO，月薪21000元"


async def test_transcript_still_fills_a_turn_the_voice_model_did_not_record():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "负责订单服务，团队8人",
                "evidence": [{"turn_id": "u2", "quote": "团队8人"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    await agent.record_answer(
        question_id="q1", status="in_progress", answer_summary="负责订单服务"
    )
    agent.observe_turn("u2", "user", "团队8人", 9, started_at=time.time() + 1)
    await agent.reconcile_answers()
    assert agent.question_outcomes[0].answer_summary == "负责订单服务，团队8人"


async def test_a_rejected_voice_call_does_not_block_reconciled_facts():
    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "in_progress",
                "answer_summary": "团队8人",
                "evidence": [{"turn_id": "u1", "quote": "团队8人"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "团队8人", 1, started_at=time.time() - 5)
    with pytest.raises(ToolError):
        await agent.record_answer(
            question_id="q1", status="in_progress", answer_summary=""
        )
    await agent.reconcile_answers()
    assert agent.question_outcomes[0].answer_summary == "团队8人"


async def test_reconciled_facts_from_a_later_turn_are_not_reverted():
    # A later run may cite only the older turn; facts verified from a turn the
    # voice model never heard must survive it.
    results = [
        {
            "question_id": "q1",
            "status": "in_progress",
            "answer_summary": "负责订单，团队8人",
            "evidence": [
                {"turn_id": "u1", "quote": "负责订单"},
                {"turn_id": "u2", "quote": "团队8人"},
            ],
        },
        {
            "question_id": "q1",
            "status": "in_progress",
            "answer_summary": "负责订单，团队8人",
            "evidence": [{"turn_id": "u1", "quote": "负责订单"}],
        },
    ]
    calls = []

    async def extract(questions, turns):
        calls.append(turns)
        return [results[len(calls) - 1]]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "负责订单", 1, started_at=time.time() - 5)
    await agent.record_answer(
        question_id="q1", status="in_progress", answer_summary="负责订单"
    )
    agent.observe_turn("u2", "user", "团队8人", 2, started_at=time.time() + 1)
    await agent.reconcile_answers()
    agent.observe_turn("u3", "user", "嗯", 3, started_at=time.time() + 2)
    await agent.reconcile_answers()
    assert len(calls) == 2
    assert agent.question_outcomes[0].answer_summary == "负责订单，团队8人"


async def test_a_voice_correction_survives_an_earlier_verification():
    # Right after a verification, a voice correction is briefly replaced by
    # the verified facts; once its own turn is transcribed the correction wins.
    calls = []

    async def extract(questions, turns):
        calls.append(turns)
        if len(calls) == 1:
            return [
                {
                    "question_id": "q1",
                    "status": "answered",
                    "answer_summary": "月薪2万，团队8人",
                    "evidence": [{"turn_id": "u2", "quote": "团队8人"}],
                }
            ]
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "月薪2万3，团队8人",
                "evidence": [{"turn_id": "u3", "quote": "月薪2万3"}],
            }
        ]

    agent = RealtimeInterviewAgent(context(), answer_extractor=extract)
    agent.observe_turn("u1", "user", "月薪两万一", 1, started_at=time.time() - 9)
    await agent.record_answer(
        question_id="q1", status="answered", answer_summary="月薪21000元"
    )
    await asyncio.sleep(0.01)
    agent.observe_turn("u2", "user", "团队8人", 2, started_at=time.time())
    await agent.reconcile_answers()
    await asyncio.sleep(0.01)
    started = time.time()
    await agent.record_answer(
        question_id="q1", status="answered", answer_summary="月薪23000元，团队8人"
    )
    agent.observe_turn("u3", "user", "月薪2万3", 3, started_at=started)
    await agent.reconcile_answers()
    assert agent.question_outcomes[0].answer_summary == "月薪23000元，团队8人"


async def test_stopping_an_incomplete_item_is_not_undone_by_verification():
    # A verification may call an item answered without covering every required
    # topic; the interviewer's decision to stop asking must still stand, or
    # finishing is rejected forever.
    from dataclasses import replace

    from dispatch_context import (
        DispatchFollowUpContract,
        DispatchFollowUpFacet,
        DispatchQuestion,
    )

    question = DispatchQuestion(
        "q1",
        "用过哪些AI工具",
        "easy",
        None,
        None,
        DispatchFollowUpContract(
            "all_required",
            (DispatchFollowUpFacet("a", "工具"), DispatchFollowUpFacet("b", "效率")),
        ),
    )

    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "用ChatGPT写方案",
                "covered_topics": ["工具"],
                "evidence": [{"turn_id": "u1", "quote": "用ChatGPT写方案"}],
            }
        ]

    agent = RealtimeInterviewAgent(
        replace(context(), questions=(question,)), answer_extractor=extract
    )
    agent.observe_turn("u1", "user", "用ChatGPT写方案", 1)
    await agent.reconcile_answers()
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1",
                status="insufficient",
                answer_summary="用ChatGPT写方案",
                reason="候选人没说效率",
            )
        ]
    )
    assert agent.question_outcomes[0].status.value == "insufficient"


async def test_topics_the_interviewer_confirmed_are_not_dropped_by_verification():
    # A verification that labels fewer topics must not reopen an item the
    # interviewer has fully covered; finishing would be rejected forever.
    from dataclasses import replace

    from dispatch_context import (
        DispatchFollowUpContract,
        DispatchFollowUpFacet,
        DispatchQuestion,
    )

    question = DispatchQuestion(
        "q1",
        "用过哪些AI工具",
        "easy",
        None,
        None,
        DispatchFollowUpContract(
            "all_required",
            (DispatchFollowUpFacet("a", "工具"), DispatchFollowUpFacet("b", "效率")),
        ),
    )

    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "用ChatGPT写方案，省一半时间",
                "covered_topics": ["效率"],
                "evidence": [{"turn_id": "u1", "quote": "用ChatGPT写方案，省一半时间"}],
            }
        ]

    agent = RealtimeInterviewAgent(
        replace(context(), questions=(question,)), answer_extractor=extract
    )
    agent.observe_turn("u1", "user", "用ChatGPT写方案，省一半时间", 1)
    await agent.reconcile_answers()
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1",
                status="answered",
                answer_summary="用ChatGPT写方案，省一半时间",
                covered_topics=["工具", "效率"],
            )
        ]
    )
    assert agent.question_outcomes[0].status.value == "answered"


async def test_topics_verified_from_the_transcript_survive_the_voice_wording():
    # The voice model's wording wins for a turn it heard, but topics the
    # verification confirmed must still count, or the item is chased forever.
    from dataclasses import replace

    from dispatch_context import (
        DispatchFollowUpContract,
        DispatchFollowUpFacet,
        DispatchQuestion,
    )

    question = DispatchQuestion(
        "q1",
        "最近一份工作的薪酬",
        "medium",
        None,
        None,
        DispatchFollowUpContract(
            "all_required",
            (
                DispatchFollowUpFacet("a", "具体月薪"),
                DispatchFollowUpFacet("b", "具体年薪"),
            ),
        ),
    )

    async def extract(questions, turns):
        return [
            {
                "question_id": "q1",
                "status": "answered",
                "answer_summary": "月薪2万，13薪",
                "covered_topics": ["具体月薪", "具体年薪"],
                "evidence": [{"turn_id": "u1", "quote": "月薪2万13薪"}],
            }
        ]

    agent = RealtimeInterviewAgent(
        replace(context(), questions=(question,)), answer_extractor=extract
    )
    started = time.time()
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1",
                status="in_progress",
                answer_summary="月薪21000元，13薪",
                covered_topics=["具体月薪"],
            )
        ]
    )
    agent.observe_turn("u1", "user", "月薪2万13薪", 1, started_at=started)
    await agent.reconcile_answers()
    outcome = agent.question_outcomes[0]
    assert outcome.answer_summary == "月薪21000元，13薪"
    assert outcome.status.value == "answered"
