import logging

from test_realtime_interview_agent import context

from realtime_interview_agent import AnswerUpdate, RealtimeInterviewAgent


async def test_debug_logs_collected_answers_and_corrections_without_duplicate_snapshots(
    caplog,
):
    caplog.set_level(logging.DEBUG, logger="realtime_interview_agent")
    agent = RealtimeInterviewAgent(context())
    initial = AnswerUpdate(
        question_id="q1", status="in_progress", answer_summary="负责需求访谈"
    )
    await agent.record_answers(updates=[initial])
    await agent.record_answers(updates=[initial])
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1",
                status="answered",
                answer_summary="负责需求访谈和上线，耗时降低40%",
            )
        ]
    )
    records = [r for r in caplog.records if hasattr(r, "lk.pii.collected_information")]
    assert len(records) == 2
    first = getattr(records[0], "lk.pii.collected_information")[0]
    latest = getattr(records[1], "lk.pii.collected_information")[0]
    assert first["answer_summary"] == "负责需求访谈"
    assert latest["answer_summary"] == "负责需求访谈和上线，耗时降低40%"
    assert latest["question_id"] == "q1"
    assert latest["question"] == "项目职责"
    assert latest["status"] == "answered"
    assert latest["revision"] == 2
    assert "missing_topics" in latest


async def test_info_level_does_not_log_candidate_answers(caplog):
    caplog.set_level(logging.INFO, logger="realtime_interview_agent")
    agent = RealtimeInterviewAgent(context())
    await agent.record_answers(
        updates=[
            AnswerUpdate(
                question_id="q1",
                status="answered",
                answer_summary="不应出现在生产INFO日志中的候选人回答",
            )
        ]
    )
    assert not any(hasattr(r, "lk.pii.collected_information") for r in caplog.records)
    assert "不应出现在生产INFO日志" not in caplog.text
