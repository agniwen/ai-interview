import pytest

from dispatch_context import DispatchQuestion
from interview_question_task import (
    InterviewQuestionProgress,
    QuestionOutcomeStatus,
    build_question_task_group,
)


def _question(difficulty: str = "medium") -> DispatchQuestion:
    return DispatchQuestion(
        id="question-1",
        content="请介绍一次线上故障排查经历。",
        difficulty=difficulty,
        evaluation_focus="确认候选人能够定位并复盘线上故障",
        follow_up_directions="追问定位信号、根因和预防措施",
    )


def test_medium_question_becomes_insufficient_instead_of_starting_a_third_follow_up():
    progress = InterviewQuestionProgress(_question(), started_at=10.0)

    assert progress.record_follow_up("说明了告警现象", now=20.0) is None
    assert progress.record_follow_up("补充了定位过程", now=30.0) is None
    outcome = progress.record_follow_up("仍未说明根因", now=40.0)

    assert outcome is not None
    assert outcome.status is QuestionOutcomeStatus.INSUFFICIENT
    assert outcome.follow_up_count == 2
    assert outcome.answer_summary == "仍未说明根因"


def test_hard_question_has_no_fixed_follow_up_limit():
    progress = InterviewQuestionProgress(_question("hard"), started_at=10.0)

    for index in range(12):
        assert (
            progress.record_follow_up(f"第 {index + 1} 次补充", now=20.0 + index)
            is None
        )

    assert progress.follow_up_count == 12


def test_skip_requires_confirmation_and_records_zero_credit_process_outcome():
    progress = InterviewQuestionProgress(_question(), started_at=10.0)

    assert progress.request_skip_confirmation() is True
    assert progress.request_skip_confirmation() is False
    outcome = progress.record_skipped(now=30.0)

    assert outcome.status is QuestionOutcomeStatus.SKIPPED
    assert outcome.answer_summary is None


def test_reopened_question_increments_revision_and_preserves_follow_up_count():
    progress = InterviewQuestionProgress(
        _question(),
        initial_follow_up_count=2,
        revision=2,
        started_at=50.0,
    )

    outcome = progress.record_answered("补充说明了根因和预防措施", now=70.0)

    assert outcome.revision == 2
    assert outcome.follow_up_count == 2
    assert outcome.status is QuestionOutcomeStatus.ANSWERED
    assert outcome.to_payload() == {
        "answerSummary": "补充说明了根因和预防措施",
        "difficulty": "medium",
        "endedAtSecs": 70.0,
        "evaluationFocus": "确认候选人能够定位并复盘线上故障",
        "followUpCount": 2,
        "followUpDirections": "追问定位信号、根因和预防措施",
        "question": "请介绍一次线上故障排查经历。",
        "questionId": "question-1",
        "reason": None,
        "revision": 2,
        "startedAtSecs": 50.0,
        "status": "answered",
    }


def test_task_group_uses_stable_ids_and_disables_context_summarization():
    questions = (
        _question("easy"),
        DispatchQuestion(
            id="question-2",
            content="如何设计服务降级？",
            difficulty="hard",
            evaluation_focus=None,
            follow_up_directions=None,
        ),
    )

    group = build_question_task_group(questions)

    assert group.summarizes_chat_context is False
    assert group.task_ids == ("question-1", "question-2")


def test_question_rejects_an_unknown_difficulty():
    with pytest.raises(ValueError):
        InterviewQuestionProgress(_question("extreme"), started_at=10.0)


def test_third_consecutive_off_topic_answer_ends_the_round():
    progress = InterviewQuestionProgress(_question(), started_at=10.0)

    assert progress.record_off_topic(now=20.0) is None
    assert progress.record_off_topic(now=30.0) is None
    outcome = progress.record_off_topic(now=40.0)

    assert outcome is not None
    assert outcome.status is QuestionOutcomeStatus.INTERRUPTED
    assert outcome.reason == "candidate_ended_round"


def test_repeated_explicit_abuse_ends_the_round_after_one_warning():
    progress = InterviewQuestionProgress(_question(), started_at=10.0)

    assert progress.record_abuse(now=20.0) is None
    outcome = progress.record_abuse(now=30.0)

    assert outcome is not None
    assert outcome.status is QuestionOutcomeStatus.INTERRUPTED
    assert outcome.reason == "candidate_ended_round"


def test_candidate_can_end_the_whole_round_without_skipping_only_the_current_question():
    progress = InterviewQuestionProgress(_question(), started_at=10.0)

    outcome = progress.record_candidate_ended_round(now=20.0)

    assert outcome.status is QuestionOutcomeStatus.INTERRUPTED
    assert outcome.reason == "candidate_ended_round"
