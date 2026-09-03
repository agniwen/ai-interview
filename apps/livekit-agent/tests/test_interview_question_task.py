import asyncio
from types import SimpleNamespace

import pytest
from livekit.agents import AgentTask, ModelSettings, llm

from dispatch_context import DispatchQuestion
from interview_question_task import (
    InterviewQuestionProgress,
    InterviewQuestionTask,
    QuestionOutcomeStatus,
    QuestionTurnAction,
    _InterviewQuestionDraft,
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


@pytest.mark.asyncio
async def test_question_rejects_trailing_turn_until_prompt_finishes_playing():
    task = InterviewQuestionTask(_question())
    prompt_started = asyncio.Event()
    release_prompt = asyncio.Event()
    spoken: list[tuple[str, bool | None]] = []

    class SpeechHandle:
        async def wait_for_playout(self) -> None:
            await release_prompt.wait()

    class Session:
        def update_options(self, **_options) -> None:
            return None

        def say(self, text: str, *, allow_interruptions: bool | None = None):
            spoken.append((text, allow_interruptions))
            prompt_started.set()
            return SpeechHandle()

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    enter_task = asyncio.create_task(task.on_enter())
    await prompt_started.wait()
    await asyncio.sleep(0)

    assert not enter_task.done()
    assert spoken == [(_question().content, False)]

    await task.submit_question_decision(
        _run_context("trailing-previous-answer"),
        action=QuestionTurnAction.ANSWERED,
        answer_summary="上一题的尾句",
    )
    assert not task.done()

    release_prompt.set()
    await enter_task
    await task.submit_question_decision(
        _run_context("current-question-answer"),
        action=QuestionTurnAction.ANSWERED,
        answer_summary="当前题真实回答",
    )

    assert _task_result(task).answer_summary == "当前题真实回答"


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


def test_question_instructions_reject_polite_thanks_as_end_signal():
    from interview_question_task import _question_instructions

    instructions = _question_instructions(_question())

    assert "谢谢" in instructions
    assert "不是结束整轮的信号" in instructions
    assert "禁止在本题流程中向候选人道别" in instructions


def test_question_instructions_forbid_repeating_collected_information():
    task = InterviewQuestionTask(_question())

    assert "不得复述或总结候选人已经提供的信息" in task.instructions
    assert "一个或多个尚未收集到的短要点" in task.instructions
    assert "不得复述当前题目" in task.instructions
    assert "同一发言中先提供了实质性部分答案" in task.instructions
    assert "仍需填写 answer_summary 和 covered_topics" in task.instructions


@pytest.mark.asyncio
async def test_candidate_turn_requires_a_question_state_tool():
    task = InterviewQuestionTask(_question())
    model_settings = ModelSettings(tool_choice="auto")

    stream = task.llm_node(llm.ChatContext.empty(), [], model_settings)

    assert model_settings.tool_choice == {
        "type": "function",
        "function": {"name": "submit_question_decision"},
    }
    await stream.aclose()


@pytest.mark.asyncio
async def test_candidate_turn_suppresses_text_before_the_state_tool(monkeypatch):
    async def upstream():
        yield llm.ChatChunk(
            id="chunk-1",
            delta=llm.ChoiceDelta(content="你刚才已经说明了告警现象。"),
        )
        yield llm.ChatChunk(
            id="chunk-2",
            delta=llm.ChoiceDelta(
                tool_calls=[
                    llm.FunctionToolCall(
                        name="submit_question_decision",
                        arguments=('{"action":"answered","answer_summary":"已覆盖"}'),
                        call_id="call-1",
                    )
                ]
            ),
        )

    def fake_llm_node(self, chat_ctx, tools, model_settings):
        return upstream()

    monkeypatch.setattr(AgentTask, "llm_node", fake_llm_node)
    task = InterviewQuestionTask(_question())

    chunks = [
        chunk
        async for chunk in task.llm_node(
            llm.ChatContext.empty(), [], ModelSettings(tool_choice="auto")
        )
    ]

    assert chunks[0].delta is not None
    assert chunks[0].delta.content is None
    assert chunks[0].delta.tool_calls[0].name == "submit_question_decision"


@pytest.mark.asyncio
async def test_candidate_turn_rejects_multiple_decisions_without_forwarding_either(
    monkeypatch,
):
    async def upstream():
        yield llm.ChatChunk(
            id="chunk-1",
            delta=llm.ChoiceDelta(
                tool_calls=[
                    llm.FunctionToolCall(
                        name="submit_question_decision",
                        arguments=('{"action":"answered","answer_summary":"已覆盖"}'),
                        call_id="call-1",
                    ),
                    llm.FunctionToolCall(
                        name="submit_question_decision",
                        arguments=('{"action":"follow_up","missing_topic":"根因"}'),
                        call_id="call-2",
                    ),
                ]
            ),
        )

    monkeypatch.setattr(AgentTask, "llm_node", lambda *_args: upstream())
    task = InterviewQuestionTask(_question())

    chunks = [
        chunk
        async for chunk in task.llm_node(
            llm.ChatContext.empty(), [], ModelSettings(tool_choice="auto")
        )
    ]

    assert all(
        not chunk.delta or not chunk.delta.tool_calls
        for chunk in chunks
        if isinstance(chunk, llm.ChatChunk)
    )
    assert "没有处理成功" in "".join(
        chunk.delta.content or ""
        for chunk in chunks
        if isinstance(chunk, llm.ChatChunk) and chunk.delta
    )


@pytest.mark.asyncio
async def test_tool_disabled_fallback_suppresses_model_recap(monkeypatch):
    async def upstream():
        yield llm.ChatChunk(
            id="fallback",
            delta=llm.ChoiceDelta(content="FALLBACK_RECAP_SECRET"),
        )

    monkeypatch.setattr(AgentTask, "llm_node", lambda *_args: upstream())
    task = InterviewQuestionTask(_question())

    chunks = [
        chunk
        async for chunk in task.llm_node(
            llm.ChatContext.empty(), [], ModelSettings(tool_choice="none")
        )
    ]
    visible = "".join(
        chunk.delta.content or ""
        for chunk in chunks
        if isinstance(chunk, llm.ChatChunk) and chunk.delta
    )

    assert "FALLBACK_RECAP_SECRET" not in visible
    assert "没有处理成功" in visible


@pytest.mark.asyncio
async def test_follow_up_speaks_only_a_configured_missing_topic():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    session = Session()
    task._get_activity_or_raise = lambda: SimpleNamespace(session=session)  # type: ignore[method-assign]

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="候选人说明了告警现象和定位信号",
        missing_topic="根因",
    )

    assert spoken == ["请补充根因。"]
    assert task.progress.follow_up_count == 1


@pytest.mark.asyncio
async def test_follow_up_never_requests_an_explicitly_covered_topic():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="候选人已经说明定位信号和根因",
        missing_topic="预防措施",
        covered_topics=["定位信号", "根因"],
    )

    assert spoken == ["请补充预防措施。"]


@pytest.mark.asyncio
async def test_topic_word_inside_a_negative_answer_is_not_treated_as_covered():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="根因暂时没有定位出来",
        missing_topic="根因",
        covered_topics=[],
    )

    assert spoken == ["请补充根因。"]


@pytest.mark.asyncio
async def test_explicit_coverage_id_prevents_reasking_a_semantic_answer():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="最终定位到线程池耗尽",
        missing_topic="预防措施",
        covered_topics=["根因"],
    )

    assert spoken == ["请补充预防措施。"]


@pytest.mark.asyncio
async def test_covered_and_missing_topic_conflict_fails_closed_without_guessing():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="最终定位到线程池耗尽",
        missing_topic="根因",
        covered_topics=["根因"],
    )

    assert spoken == ["请补充一个尚未说明的关键点。"]


@pytest.mark.asyncio
async def test_covered_topics_are_accumulated_across_follow_up_turns():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="说明了定位信号",
        missing_topic="根因",
        covered_topics=["定位信号"],
    )
    await task.submit_question_decision(
        _run_context("turn-2"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="补充了根因",
        missing_topic="定位信号",
        covered_topics=["根因"],
    )

    assert spoken == ["请补充根因。", "请补充一个尚未说明的关键点。"]


@pytest.mark.asyncio
async def test_covered_topics_survive_a_revisit_revision():
    draft = _InterviewQuestionDraft()
    first_task = InterviewQuestionTask(_question(), draft=draft)

    class SilentSession:
        def say(self, _text: str):
            return None

    first_task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=SilentSession()
    )
    await first_task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="说明了定位信号",
        missing_topic="根因",
        covered_topics=["定位信号"],
    )
    await first_task.submit_question_decision(
        _run_context("turn-2"),
        action=QuestionTurnAction.REQUEST_SKIP,
    )
    await first_task.submit_question_decision(
        _run_context("turn-3"),
        action=QuestionTurnAction.CONFIRM_SKIP,
    )

    spoken: list[str] = []

    class RecordingSession:
        def say(self, text: str):
            spoken.append(text)

    revisited_task = InterviewQuestionTask(
        _question(),
        previous_outcome=_task_result(first_task),
        draft=draft,
    )
    revisited_task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=RecordingSession()
    )
    await revisited_task.submit_question_decision(
        _run_context("revision-2"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="继续补充",
        missing_topic="定位信号",
        covered_topics=[],
    )

    assert spoken == ["请补充一个尚未说明的关键点。"]


@pytest.mark.asyncio
async def test_meta_turn_cannot_mark_a_topic_as_covered():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.WAIT,
        covered_topics=["根因"],
    )
    await task.submit_question_decision(
        _run_context("turn-2"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="尚未回答根因",
        missing_topic="根因",
        covered_topics=[],
    )

    assert spoken[-1] == "请补充根因。"


@pytest.mark.asyncio
async def test_trusted_technical_follow_up_topics_are_not_overfiltered():
    question = DispatchQuestion(
        id="question-1",
        content="请介绍容量规划方法。",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions="追问系统容量和问题定位",
    )
    task = InterviewQuestionTask(question)
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="候选人只介绍了估算公式",
        missing_topic="系统容量",
    )

    assert spoken == ["请补充系统容量。"]


@pytest.mark.asyncio
async def test_follow_up_speaks_a_topic_from_natural_language_directions():
    question = DispatchQuestion(
        id="question-1",
        content="请介绍一次线上故障排查经历。",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions=(
            "根据候选人回答判断是否说明了故障根因、定位依据和预防措施"
        ),
    )
    task = InterviewQuestionTask(question)
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="候选人只说明了告警现象",
        missing_topic="故障根因",
    )

    assert spoken == ["请补充故障根因。"]


@pytest.mark.asyncio
async def test_follow_up_can_ask_multiple_topics_in_one_turn():
    question = DispatchQuestion(
        id="question-1",
        content="请介绍一次线上故障排查经历。",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions=(
            "根据候选人回答判断是否说明了故障根因、定位依据和预防措施"
        ),
    )
    task = InterviewQuestionTask(question)
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="候选人只说明了告警现象",
        missing_topic="故障根因、定位依据",
        covered_topics=[],
    )

    assert spoken == ["请补充故障根因、定位依据。"]


@pytest.mark.asyncio
async def test_follow_up_drops_already_covered_topics_from_a_multi_topic_request():
    question = DispatchQuestion(
        id="question-1",
        content="请介绍一次线上故障排查经历。",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions="追问定位信号、根因和预防措施",
    )
    task = InterviewQuestionTask(question)
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="已说明定位信号",
        missing_topic="定位信号、根因",
        covered_topics=["定位信号"],
    )

    assert spoken == ["请补充根因。"]


@pytest.mark.asyncio
async def test_follow_up_keeps_conjunction_words_inside_a_single_topic():
    question = DispatchQuestion(
        id="question-1",
        content="请介绍一次系统优化经历。",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions="追问系统饱和度、服务亲和力、涉及范围",
    )
    task = InterviewQuestionTask(question)
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="部分回答",
        missing_topic="服务亲和力",
    )

    assert spoken == ["请补充服务亲和力。"]


@pytest.mark.asyncio
async def test_follow_up_speaks_missing_topic_without_direction_whitelist():
    question = DispatchQuestion(
        id="question-1",
        content="请介绍一次项目经历。",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions="追问技术取舍和协作方式",
    )
    task = InterviewQuestionTask(question)
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="部分回答",
        missing_topic="落地过程和权衡",
    )

    assert spoken == ["请补充落地过程和权衡。"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "missing_topic",
    [
        "",
        "   ",
    ],
)
async def test_empty_missing_topic_uses_generic_follow_up(missing_topic):
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="ANSWER_SENTINEL",
        missing_topic=missing_topic,
    )

    assert spoken == ["请补充一个尚未说明的关键点。"]
    assert "ANSWER_SENTINEL" not in spoken[0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("action", "expected"),
    [
        (QuestionTurnAction.CLARIFY, "请告诉我需要澄清的具体部分。"),
        (QuestionTurnAction.WAIT, "好的，请准备好后继续。"),
        (QuestionTurnAction.CONTINUE_CURRENT, "好的，请继续回答。"),
    ],
)
async def test_meta_turns_use_fixed_text_without_consuming_follow_ups(action, expected):
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=action,
    )

    assert spoken == [expected]
    assert task.progress.follow_up_count == 0
    assert task.progress.off_topic_count == 0
    assert not task.done()


@pytest.mark.asyncio
async def test_explicit_repeat_replays_only_the_last_trusted_prompt():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="ANSWER_SECRET",
        missing_topic="根因",
    )
    await task.submit_question_decision(
        _run_context("turn-2"),
        action=QuestionTurnAction.REPEAT_PROMPT,
    )

    assert spoken == ["请补充根因。", "请补充根因。"]
    assert "ANSWER_SECRET" not in "".join(spoken)
    assert task.progress.follow_up_count == 1


@pytest.mark.asyncio
async def test_say_failure_rolls_back_the_decision_and_allows_same_turn_retry():
    task = InterviewQuestionTask(_question())

    class FailingSession:
        def say(self, _text: str):
            raise RuntimeError("speech queue unavailable")

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=FailingSession()
    )

    with pytest.raises(RuntimeError, match="speech queue unavailable"):
        await task.submit_question_decision(
            _run_context("turn-1"),
            action=QuestionTurnAction.FOLLOW_UP,
            answer_summary="PARTIAL_SECRET",
            missing_topic="根因",
        )

    assert task.progress.follow_up_count == 0
    assert task._answer_summary == ""  # type: ignore[attr-defined]
    assert task._pending_missing_topic is None  # type: ignore[attr-defined]

    spoken: list[str] = []

    class WorkingSession:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=WorkingSession()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="PARTIAL_SECRET",
        missing_topic="根因",
    )

    assert spoken == ["请补充根因。"]
    assert task.progress.follow_up_count == 1


@pytest.mark.asyncio
async def test_skip_requires_explicit_second_stage_and_can_be_cancelled():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"), action=QuestionTurnAction.REQUEST_SKIP
    )
    await task.submit_question_decision(
        _run_context("turn-2"), action=QuestionTurnAction.CONTINUE_CURRENT
    )
    await task.submit_question_decision(
        _run_context("turn-3"), action=QuestionTurnAction.REQUEST_SKIP
    )

    assert spoken == [
        "请确认是否确定跳过当前题。",
        "好的，请继续回答。",
        "请确认是否确定跳过当前题。",
    ]
    assert task.progress.skip_confirmation_pending is True
    assert not task.done()

    await task.submit_question_decision(
        _run_context("turn-4"), action=QuestionTurnAction.CONFIRM_SKIP
    )

    assert task.done()
    assert _task_result(task).status is QuestionOutcomeStatus.SKIPPED


@pytest.mark.asyncio
async def test_repeat_after_skip_request_replays_only_the_confirmation():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"), action=QuestionTurnAction.REQUEST_SKIP
    )
    await task.submit_question_decision(
        _run_context("turn-2"), action=QuestionTurnAction.REPEAT_PROMPT
    )
    await task.submit_question_decision(
        _run_context("turn-3"), action=QuestionTurnAction.CONFIRM_SKIP
    )

    assert spoken == [
        "请确认是否确定跳过当前题。",
        "请确认是否确定跳过当前题。",
    ]
    assert _question().content not in "".join(spoken)
    assert _task_result(task).status is QuestionOutcomeStatus.SKIPPED


@pytest.mark.asyncio
async def test_partial_answer_is_preserved_when_candidate_then_skips():
    task = InterviewQuestionTask(_question())

    class Session:
        def say(self, _text: str):
            return None

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.REQUEST_SKIP,
        answer_summary="PARTIAL_ANSWER_SECRET",
    )
    await task.submit_question_decision(
        _run_context("turn-2"),
        action=QuestionTurnAction.CONFIRM_SKIP,
    )

    outcome = _task_result(task)
    assert outcome.status is QuestionOutcomeStatus.SKIPPED
    assert outcome.answer_summary == "PARTIAL_ANSWER_SECRET"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "ack_action",
    [QuestionTurnAction.WAIT, QuestionTurnAction.CONTINUE_CURRENT],
)
async def test_process_ack_does_not_replace_the_prompt_used_by_repeat(ack_action):
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=ack_action,
    )
    await task.submit_question_decision(
        _run_context("turn-2"),
        action=QuestionTurnAction.REPEAT_PROMPT,
    )

    assert spoken[-1] == _question().content


@pytest.mark.asyncio
async def test_confirm_without_pending_starts_confirmation_instead_of_looping():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"), action=QuestionTurnAction.CONFIRM_SKIP
    )
    assert task.progress.skip_confirmation_pending is True
    assert not task.done()

    await task.submit_question_decision(
        _run_context("turn-2"), action=QuestionTurnAction.CONFIRM_SKIP
    )

    assert spoken == ["请确认是否确定跳过当前题。"]
    assert _task_result(task).status is QuestionOutcomeStatus.SKIPPED


@pytest.mark.asyncio
async def test_duplicate_decisions_for_one_speech_id_have_one_side_effect():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("same-turn"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="部分回答",
        missing_topic="根因",
    )
    await task.submit_question_decision(
        _run_context("same-turn"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="部分回答",
        missing_topic="预防措施",
    )

    assert spoken == ["请补充根因。"]
    assert task.progress.follow_up_count == 1


@pytest.mark.asyncio
async def test_late_decision_after_interrupt_has_no_side_effect():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    task.interrupt("time_limit")

    await task.submit_question_decision(
        _run_context("late-turn"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="迟到回答",
        missing_topic="根因",
    )

    assert spoken == []
    assert task.progress.follow_up_count == 0
    assert _task_result(task).status is QuestionOutcomeStatus.INTERRUPTED


def _run_context(speech_id: str):
    return SimpleNamespace(speech_handle=SimpleNamespace(id=speech_id))


def _task_result(task: InterviewQuestionTask):
    return task._AgentTask__fut.result()  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_answer_summary_is_internal_and_answered_is_silent():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.ANSWERED,
        answer_summary="ANSWER_SUMMARY_SECRET",
    )

    assert spoken == []
    assert _task_result(task).answer_summary == "ANSWER_SUMMARY_SECRET"


@pytest.mark.asyncio
async def test_answer_summary_preserves_information_across_follow_up_turns():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="首次说明了定位信号",
        missing_topic="根因",
    )
    await task.submit_question_decision(
        _run_context("turn-2"),
        action=QuestionTurnAction.ANSWERED,
        answer_summary="随后补充了根因和预防措施",
    )

    outcome = _task_result(task)
    assert "首次说明了定位信号" in outcome.answer_summary
    assert "随后补充了根因和预防措施" in outcome.answer_summary
    assert spoken == ["请补充根因。"]


@pytest.mark.asyncio
async def test_revisiting_answered_question_cannot_downgrade_to_insufficient():
    previous_progress = InterviewQuestionProgress(
        _question(),
        initial_follow_up_count=2,
        started_at=10.0,
    )
    previous_outcome = previous_progress.record_answered(
        "原回答已足够评估",
        now=20.0,
    )
    task = InterviewQuestionTask(
        _question(),
        previous_outcome=previous_outcome,
        now=lambda: 30.0,
    )
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("supplement"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="候选人后来主动补充了一项信息",
        missing_topic="预防措施",
    )

    outcome = _task_result(task)
    assert outcome.status is QuestionOutcomeStatus.ANSWERED
    assert outcome.revision == 2
    assert outcome.follow_up_count == 2
    assert "原回答已足够评估" in outcome.answer_summary
    assert "候选人后来主动补充了一项信息" in outcome.answer_summary
    assert spoken == []


@pytest.mark.asyncio
async def test_revisiting_answered_question_cannot_downgrade_to_skipped():
    previous_outcome = InterviewQuestionProgress(
        _question(),
        started_at=10.0,
    ).record_answered("原回答已足够评估", now=20.0)
    task = InterviewQuestionTask(
        _question(),
        previous_outcome=previous_outcome,
        now=lambda: 30.0,
    )

    class Session:
        def say(self, _text: str):
            return None

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("skip-request"),
        action=QuestionTurnAction.REQUEST_SKIP,
    )
    await task.submit_question_decision(
        _run_context("skip-confirm"),
        action=QuestionTurnAction.CONFIRM_SKIP,
    )

    outcome = _task_result(task)
    assert outcome.status is QuestionOutcomeStatus.ANSWERED
    assert outcome.revision == 2
    assert outcome.answer_summary == "原回答已足够评估"


@pytest.mark.asyncio
async def test_revisiting_skipped_question_can_upgrade_to_answered():
    previous_progress = InterviewQuestionProgress(_question(), started_at=10.0)
    previous_progress.request_skip_confirmation()
    previous_outcome = previous_progress.record_skipped(now=20.0)
    task = InterviewQuestionTask(
        _question(),
        previous_outcome=previous_outcome,
        now=lambda: 30.0,
    )

    await task.submit_question_decision(
        _run_context("answer"),
        action=QuestionTurnAction.ANSWERED,
        answer_summary="补充后已经足够评估",
    )

    outcome = _task_result(task)
    assert outcome.status is QuestionOutcomeStatus.ANSWERED
    assert outcome.revision == 2
    assert outcome.answer_summary == "补充后已经足够评估"


@pytest.mark.asyncio
async def test_interrupt_preserves_information_collected_before_the_stop():
    task = InterviewQuestionTask(_question())

    class Session:
        def say(self, _text: str):
            return None

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )
    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.FOLLOW_UP,
        answer_summary="PARTIAL_SUMMARY",
        missing_topic="根因",
    )

    task.interrupt("time_limit")

    outcome = _task_result(task)
    assert outcome.status is QuestionOutcomeStatus.INTERRUPTED
    assert outcome.answer_summary == "PARTIAL_SUMMARY"
    assert outcome.follow_up_count == 1


@pytest.mark.asyncio
async def test_explicit_revisit_uses_task_group_control_flow_without_recap():
    task = InterviewQuestionTask(
        _question(),
        revisitable_questions=(("previous-question", "PREVIOUS_QUESTION_SECRET"),),
    )
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.submit_question_decision(
        _run_context("turn-1"),
        action=QuestionTurnAction.REVISIT_PREVIOUS,
        target_question_ids=["previous-question"],
    )

    assert spoken == []
    error = task._AgentTask__fut.exception()  # type: ignore[attr-defined]
    assert type(error).__name__ == "_OutOfScopeError"
    assert error.target_task_ids == ["previous-question"]


@pytest.mark.asyncio
async def test_off_topic_reminder_does_not_repeat_the_question():
    task = InterviewQuestionTask(_question())
    spoken: list[str] = []

    class Session:
        def say(self, text: str):
            spoken.append(text)

    session = Session()
    task._get_activity_or_raise = lambda: SimpleNamespace(session=session)  # type: ignore[method-assign]

    await task.submit_question_decision(
        _run_context("turn-1"), action=QuestionTurnAction.OFF_TOPIC
    )

    assert spoken == ["请直接回答刚才的问题。"]
    assert _question().content not in spoken[0]


@pytest.mark.asyncio
async def test_question_task_on_enter_uses_deterministic_candidate_visible_text():
    task = InterviewQuestionTask(_question())
    captured: list[str] = []

    class SpeechHandle:
        async def wait_for_playout(self) -> None:
            return None

    class Session:
        def update_options(self, **_kwargs):
            return None

        def say(self, text: str, *, allow_interruptions: bool):
            assert allow_interruptions is False
            captured.append(text)
            return SpeechHandle()

        def generate_reply(self, **_kwargs):
            raise AssertionError("question entry must not call the LLM")

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.on_enter()

    assert captured == [_question().content]


@pytest.mark.asyncio
async def test_reopened_question_does_not_repeat_question_or_answer():
    previous = InterviewQuestionProgress(_question(), started_at=1.0).record_answered(
        "ANSWER_SECRET", now=2.0
    )
    task = InterviewQuestionTask(_question(), previous_outcome=previous)
    captured: list[str] = []

    class SpeechHandle:
        async def wait_for_playout(self) -> None:
            return None

    class Session:
        def update_options(self, **_kwargs):
            return None

        def say(self, text: str, *, allow_interruptions: bool):
            assert allow_interruptions is False
            captured.append(text)
            return SpeechHandle()

        def generate_reply(self, **_kwargs):
            raise AssertionError("reopened question must not call the LLM")

    task._get_activity_or_raise = lambda: SimpleNamespace(  # type: ignore[method-assign]
        session=Session()
    )

    await task.on_enter()

    assert captured == ["请直接补充尚未说明的部分。"]
    assert _question().content not in captured[0]
    assert "ANSWER_SECRET" not in captured[0]


@pytest.mark.asyncio
async def test_long_answer_interruption_uses_fixed_text_without_llm():
    task = InterviewQuestionTask(_question())

    class Handle:
        def __init__(self):
            self.waited = False

        async def wait_for_playout(self):
            self.waited = True

    class Session:
        def __init__(self):
            self.calls = []
            self.handle = Handle()

        def say(self, text: str, **kwargs):
            self.calls.append((text, kwargs))
            return self.handle

        def generate_reply(self, **_kwargs):
            raise AssertionError("long-turn cue must not call the LLM")

    session = Session()
    task._get_activity_or_raise = lambda: SimpleNamespace(session=session)  # type: ignore[method-assign]

    await task.on_user_turn_exceeded(
        SimpleNamespace(transcript="ANSWER_SECRET", accumulated_word_count=1001)
    )

    assert session.calls == [
        (
            "我先打断一下。为了控制时间，请用一两句话补充最关键的部分。",
            {"allow_interruptions": False},
        )
    ]
    assert session.handle.waited is True
