import asyncio

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
    assert "核对后的持久事实" in agent.instructions
    assert '"answer_summary": "团队解散"' in agent.instructions
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
        assert state["questions"][1]["status"] == "answered"
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
