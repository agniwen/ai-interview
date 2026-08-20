import asyncio
from collections import deque

import pytest
from livekit.agents import Agent, AgentSession, llm
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, NOT_GIVEN

from dispatch_context import DispatchQuestion
from interview_question_task import (
    InterviewQuestionTask,
    QuestionOutcomeStatus,
    build_question_task_group,
)
from wrap_up_task import (
    _CLOSING_QUESTION,
    _SAFE_CLOSING,
    _WRAP_DECISION_TOOL_NAME,
    WrapUpTask,
)


class _ScriptedLLMStream(llm.LLMStream):
    def __init__(self, model, *, chat_ctx, tools, conn_options, chunks):
        self._chunks = chunks
        super().__init__(
            model,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )

    async def _run(self) -> None:
        for chunk in self._chunks:
            self._event_ch.send_nowait(chunk)


class _ScriptedLLM(llm.LLM):
    def __init__(self, scripts):
        super().__init__()
        self.scripts = deque(scripts)
        self.calls = []

    def chat(
        self,
        *,
        chat_ctx,
        tools=None,
        conn_options=DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls=NOT_GIVEN,
        tool_choice=NOT_GIVEN,
        extra_kwargs=NOT_GIVEN,
    ):
        self.calls.append(
            {
                "parallel_tool_calls": parallel_tool_calls,
                "tool_choice": tool_choice,
            }
        )
        return _ScriptedLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
            chunks=self.scripts.popleft(),
        )


class _BlockingLLMStream(llm.LLMStream):
    def __init__(self, model, *, chat_ctx, tools, conn_options, chunk):
        self._chunk = chunk
        super().__init__(
            model,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )

    async def _run(self) -> None:
        self._llm.started.set()
        await self._llm.release.wait()
        self._event_ch.send_nowait(self._chunk)


class _BlockingLLM(llm.LLM):
    def __init__(self, chunk):
        super().__init__()
        self.chunk = chunk
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    def chat(
        self,
        *,
        chat_ctx,
        tools=None,
        conn_options=DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls=NOT_GIVEN,
        tool_choice=NOT_GIVEN,
        extra_kwargs=NOT_GIVEN,
    ):
        return _BlockingLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
            chunk=self.chunk,
        )


class _TaskHarness(Agent):
    def __init__(self, task):
        super().__init__(instructions="Run one interview question task.")
        self.task = task

    async def on_enter(self) -> None:
        await self.task


def _question() -> DispatchQuestion:
    return DispatchQuestion(
        id="question-1",
        content="请介绍一次线上故障排查经历。",
        difficulty="medium",
        evaluation_focus="确认候选人能够定位并复盘线上故障",
        follow_up_directions="追问定位信号、根因和预防措施",
    )


async def _eventually(predicate, *, timeout: float = 2.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while not predicate():
        if asyncio.get_running_loop().time() >= deadline:
            raise TimeoutError("condition was not met")
        await asyncio.sleep(0.01)


def _assistant_texts(result) -> list[str]:
    return [
        event.item.text_content or ""
        for event in result.events
        if event.type == "message" and event.item.role == "assistant"
    ]


def _question_ready(group, question_id: str, *, revision: int | None = None) -> bool:
    current = getattr(group, "_current_task", None)
    activity = getattr(current, "_activity", None)
    if group.current_question_id != question_id or activity is None:
        return False
    if revision is not None and current.progress.revision != revision:
        return False
    return not activity._scheduling_paused


async def test_real_session_keeps_answer_summary_internal_and_silent():
    model = _ScriptedLLM(
        [
            [
                llm.ChatChunk(
                    id="decision",
                    delta=llm.ChoiceDelta(
                        content="RECAP_SENTINEL",
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"answered",'
                                    '"answer_summary":"ANSWER_SUMMARY_SENTINEL"}'
                                ),
                                call_id="call-1",
                            )
                        ],
                    ),
                )
            ]
        ]
    )
    task = InterviewQuestionTask(_question())

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        result = await asyncio.wait_for(
            session.run(user_input="候选人的完整回答"),
            timeout=2,
        )
        await _eventually(task.done)

    result.expect.contains_function_call(name="submit_question_decision")
    visible = "".join(_assistant_texts(result))
    assert "RECAP_SENTINEL" not in visible
    assert "ANSWER_SUMMARY_SENTINEL" not in visible
    outcome = task._AgentTask__fut.result()  # type: ignore[attr-defined]
    assert outcome.status is QuestionOutcomeStatus.ANSWERED
    assert outcome.answer_summary == "ANSWER_SUMMARY_SENTINEL"
    assert model.calls[0]["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_question_decision"},
    }


async def test_real_session_filters_max_tool_step_fallback_recap():
    model = _ScriptedLLM(
        [
            [
                llm.ChatChunk(
                    id="invalid",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments="{}",
                                call_id="invalid-call",
                            )
                        ]
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="fallback",
                    delta=llm.ChoiceDelta(content="FALLBACK_RECAP_SENTINEL"),
                )
            ],
        ]
    )
    task = InterviewQuestionTask(_question())

    async with AgentSession(llm=model, max_tool_steps=0) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        result = await asyncio.wait_for(
            session.run(user_input="候选人的回答"),
            timeout=2,
        )
        task.interrupt("test_cleanup")

    visible = "".join(_assistant_texts(result))
    assert "FALLBACK_RECAP_SENTINEL" not in visible
    assert "没有处理成功" in visible
    assert task.progress.follow_up_count == 0
    assert model.calls[-1]["tool_choice"] == "none"


async def test_real_session_follow_up_never_speaks_summary_or_model_preamble():
    model = _ScriptedLLM(
        [
            [
                llm.ChatChunk(
                    id="follow-up",
                    delta=llm.ChoiceDelta(
                        content="RECAP_SENTINEL",
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"follow_up",'
                                    '"answer_summary":"ANSWER_SUMMARY_SENTINEL",'
                                    '"missing_topic":"根因"}'
                                ),
                                call_id="call-1",
                            )
                        ],
                    ),
                )
            ]
        ]
    )
    task = InterviewQuestionTask(_question())

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        result = await asyncio.wait_for(
            session.run(user_input="候选人只说明了告警现象"),
            timeout=2,
        )
        task.interrupt("test_cleanup")

    visible = "".join(_assistant_texts(result))
    assert visible == "请补充根因。"
    assert "RECAP_SENTINEL" not in visible
    assert "ANSWER_SUMMARY_SENTINEL" not in visible
    assert task.progress.follow_up_count == 1


async def test_inflight_decision_after_interrupt_has_no_speech_or_state_change():
    model = _BlockingLLM(
        llm.ChatChunk(
            id="late-decision",
            delta=llm.ChoiceDelta(
                content="LATE_RECAP_SENTINEL",
                tool_calls=[
                    llm.FunctionToolCall(
                        name="submit_question_decision",
                        arguments=(
                            '{"action":"follow_up",'
                            '"answer_summary":"LATE_ANSWER_SENTINEL",'
                            '"missing_topic":"根因"}'
                        ),
                        call_id="late-call",
                    )
                ],
            ),
        )
    )
    task = InterviewQuestionTask(_question())

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        run_task = asyncio.ensure_future(session.run(user_input="候选人的迟到回答"))
        await asyncio.wait_for(model.started.wait(), timeout=2)
        task.interrupt("time_limit")
        model.release.set()
        result = await asyncio.wait_for(run_task, timeout=2)

    visible = "".join(_assistant_texts(result))
    assert visible == ""
    assert task.progress.follow_up_count == 0
    outcome = task._AgentTask__fut.result()  # type: ignore[attr-defined]
    assert outcome.status is QuestionOutcomeStatus.INTERRUPTED
    assert outcome.reason == "time_limit"


@pytest.mark.parametrize(
    "delta",
    [
        llm.ChoiceDelta(content="LATE_TEXT_SENTINEL"),
        llm.ChoiceDelta(
            tool_calls=[
                llm.FunctionToolCall(
                    name="submit_question_decision",
                    arguments='{"action":"wait"}',
                    call_id="late-call-1",
                ),
                llm.FunctionToolCall(
                    name="submit_question_decision",
                    arguments='{"action":"wait"}',
                    call_id="late-call-2",
                ),
            ]
        ),
        llm.ChoiceDelta(
            tool_calls=[
                llm.FunctionToolCall(
                    name="unknown_question_tool",
                    arguments="{}",
                    call_id="late-unknown-call",
                )
            ]
        ),
    ],
    ids=("text-only", "multiple-decisions", "unknown-tool"),
)
async def test_invalid_inflight_output_after_interrupt_is_fully_silent(delta):
    model = _BlockingLLM(llm.ChatChunk(id="late-invalid", delta=delta))
    task = InterviewQuestionTask(_question())

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        run_task = asyncio.ensure_future(session.run(user_input="候选人的迟到回答"))
        await asyncio.wait_for(model.started.wait(), timeout=2)
        task.interrupt("time_limit")
        model.release.set()
        result = await asyncio.wait_for(run_task, timeout=2)

    assert _assistant_texts(result) == []
    assert task.progress.follow_up_count == 0


async def test_real_task_group_revisit_does_not_repeat_previous_question():
    second_question = DispatchQuestion(
        id="question-2",
        content="如何设计服务降级？",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions="追问容量估算和降级策略",
    )
    model = _ScriptedLLM(
        [
            [
                llm.ChatChunk(
                    id="answer-q1",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"answered",'
                                    '"answer_summary":"第一题内部摘要"}'
                                ),
                                call_id="answer-q1-call",
                            )
                        ]
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="partial-q2",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"follow_up",'
                                    '"answer_summary":"第二题部分摘要",'
                                    '"missing_topic":"容量估算"}'
                                ),
                                call_id="partial-q2-call",
                            )
                        ]
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="revisit-q1",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"revisit_previous",'
                                    '"target_question_ids":["question-1"]}'
                                ),
                                call_id="revisit-q1-call",
                            )
                        ]
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="invalid-nested-revisit-q2",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"revisit_previous",'
                                    '"target_question_ids":["question-2"]}'
                                ),
                                call_id="invalid-nested-revisit-q2-call",
                            )
                        ]
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="finish-q1-revisit",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"answered",'
                                    '"answer_summary":"第一题补充摘要"}'
                                ),
                                call_id="finish-q1-revisit-call",
                            )
                        ]
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="finish-q2",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="submit_question_decision",
                                arguments=(
                                    '{"action":"answered",'
                                    '"answer_summary":"第二题后续摘要"}'
                                ),
                                call_id="finish-q2-call",
                            )
                        ]
                    ),
                )
            ],
        ]
    )
    outcomes = {}

    async def save_outcome(event):
        outcomes[event.result.question_id] = event.result

    group = build_question_task_group(
        (_question(), second_question),
        outcomes=outcomes,
        on_task_completed=save_outcome,
    )

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(group))
        await _eventually(lambda: _question_ready(group, "question-1"))
        await asyncio.wait_for(session.run(user_input="第一题的完整回答"), timeout=2)
        await _eventually(lambda: _question_ready(group, "question-2"))
        partial_result = await asyncio.wait_for(
            session.run(user_input="第二题先说明降级策略"),
            timeout=2,
        )
        assert _assistant_texts(partial_result) == ["请补充容量估算。"]
        assert group.current_question_id == "question-2"
        try:
            await asyncio.wait_for(session.run(user_input="我想补充第一题"), timeout=2)
        except Exception as error:
            # This is the beta TaskGroup's internal control-flow exception;
            # the group catches it and reopens the requested task.
            assert type(error).__name__ == "_OutOfScopeError"
        await _eventually(lambda: _question_ready(group, "question-1", revision=2))
        invalid_nested_result = await asyncio.wait_for(
            session.run(user_input="算了，我想回到第二题"),
            timeout=2,
        )
        assert group.current_question_id == "question-1"
        assert _assistant_texts(invalid_nested_result) == [
            "请说明想补充哪一道先前的问题。"
        ]
        await asyncio.wait_for(session.run(user_input="第一题补充完成"), timeout=2)
        await _eventually(lambda: _question_ready(group, "question-2"))

        current_q2 = group._current_task  # type: ignore[attr-defined]
        assert current_q2.progress.follow_up_count == 1
        assert current_q2._answer_summary == "第二题部分摘要"  # type: ignore[attr-defined]
        assert current_q2._pending_missing_topic == "容量估算"  # type: ignore[attr-defined]

        assistant_history = [
            item.text_content or ""
            for item in session.history.items
            if item.type == "message" and item.role == "assistant"
        ]
        await asyncio.wait_for(session.run(user_input="第二题回答完成"), timeout=2)
        await _eventually(group.done)

    assert assistant_history.count(_question().content) == 1
    assert assistant_history.count(second_question.content) == 1
    continuation_prompts = {
        "请直接补充尚未说明的部分。",
        "请继续刚才的回答。",
    }
    assert any(text in continuation_prompts for text in assistant_history)
    assert "第一题内部摘要" not in "".join(assistant_history)
    assert outcomes["question-2"].follow_up_count == 1
    assert outcomes["question-2"].answer_summary == ("第二题部分摘要；第二题后续摘要")


async def test_reopened_task_rejects_nested_revisit_cycles():
    second_question = DispatchQuestion(
        id="question-2",
        content="如何设计服务降级？",
        difficulty="medium",
        evaluation_focus=None,
        follow_up_directions=None,
    )
    third_question = DispatchQuestion(
        id="question-3",
        content="如何规划系统容量？",
        difficulty="hard",
        evaluation_focus=None,
        follow_up_directions=None,
    )

    def decision(chunk_id: str, call_id: str, arguments: str):
        return [
            llm.ChatChunk(
                id=chunk_id,
                delta=llm.ChoiceDelta(
                    tool_calls=[
                        llm.FunctionToolCall(
                            name="submit_question_decision",
                            arguments=arguments,
                            call_id=call_id,
                        )
                    ]
                ),
            )
        ]

    model = _ScriptedLLM(
        [
            decision(
                "finish-q1",
                "finish-q1-call",
                '{"action":"answered","answer_summary":"Q1"}',
            ),
            decision(
                "finish-q2",
                "finish-q2-call",
                '{"action":"answered","answer_summary":"Q2"}',
            ),
            decision(
                "revisit-q1",
                "revisit-q1-call",
                ('{"action":"revisit_previous","target_question_ids":["question-1"]}'),
            ),
            decision(
                "nested-q2",
                "nested-q2-call",
                ('{"action":"revisit_previous","target_question_ids":["question-2"]}'),
            ),
            decision(
                "finish-q1-revisit",
                "finish-q1-revisit-call",
                '{"action":"answered","answer_summary":"Q1 supplement"}',
            ),
            decision(
                "finish-q3",
                "finish-q3-call",
                '{"action":"answered","answer_summary":"Q3"}',
            ),
        ]
    )
    outcomes = {}

    async def save_outcome(event):
        outcomes[event.result.question_id] = event.result

    group = build_question_task_group(
        (_question(), second_question, third_question),
        outcomes=outcomes,
        on_task_completed=save_outcome,
    )

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(group))
        await _eventually(lambda: _question_ready(group, "question-1"))
        await asyncio.wait_for(session.run(user_input="Q1 answer"), timeout=2)
        await _eventually(lambda: _question_ready(group, "question-2"))
        await asyncio.wait_for(session.run(user_input="Q2 answer"), timeout=2)
        await _eventually(lambda: _question_ready(group, "question-3"))

        try:
            await asyncio.wait_for(session.run(user_input="补充第一题"), timeout=2)
        except Exception as error:
            assert type(error).__name__ == "_OutOfScopeError"
        await _eventually(lambda: _question_ready(group, "question-1", revision=2))

        nested_result = await asyncio.wait_for(
            session.run(user_input="再切到第二题"),
            timeout=2,
        )
        assert _assistant_texts(nested_result) == ["请说明想补充哪一道先前的问题。"]
        assert group.current_question_id == "question-1"

        await asyncio.wait_for(session.run(user_input="Q1 supplement"), timeout=2)
        await _eventually(lambda: _question_ready(group, "question-3"))
        await asyncio.wait_for(session.run(user_input="Q3 answer"), timeout=2)
        await _eventually(group.done)

        assistant_history = [
            item.text_content or ""
            for item in session.history.items
            if item.type == "message" and item.role == "assistant"
        ]

    assert assistant_history.count(_question().content) == 1
    assert assistant_history.count(second_question.content) == 1
    assert assistant_history.count(third_question.content) == 1
    assert outcomes["question-1"].revision == 2
    assert outcomes["question-2"].revision == 1
    assert outcomes["question-3"].revision == 1


async def test_real_wrap_up_session_cannot_recap_interview_history():
    end_call_invocations: list[bool] = []

    async def end_call() -> str:
        end_call_invocations.append(True)
        return "使用简体中文礼貌感谢候选人。"

    class EndCallTool:
        async def _end_call(self, _ctx):
            return await end_call()

    model = _ScriptedLLM(
        [
            [
                llm.ChatChunk(
                    id="end-call-decision",
                    delta=llm.ChoiceDelta(
                        content="我已经记录了 ANSWER_HISTORY_SECRET。",
                        tool_calls=[
                            llm.FunctionToolCall(
                                name=_WRAP_DECISION_TOOL_NAME,
                                arguments='{"action":"end"}',
                                call_id="end-call-id",
                            )
                        ],
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="closing",
                    delta=llm.ChoiceDelta(
                        content="你刚才提到 ANSWER_HISTORY_SECRET，祝你顺利。",
                    ),
                )
            ],
        ]
    )
    task = WrapUpTask(
        EndCallTool(),  # type: ignore[arg-type]
        closing_instructions="使用简体中文礼貌感谢候选人。",
    )

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        result = await asyncio.wait_for(
            session.run(user_input="没有其他补充了"),
            timeout=2,
        )
        task.complete(None)

        assistant_history = [
            item.text_content or ""
            for item in session.history.items
            if item.type == "message" and item.role == "assistant"
        ]

    result.expect.contains_function_call(name=_WRAP_DECISION_TOOL_NAME)
    assert end_call_invocations == [True]
    assert _assistant_texts(result) == [_SAFE_CLOSING]
    assert assistant_history[0] == _CLOSING_QUESTION
    assert "ANSWER_HISTORY_SECRET" not in "".join(assistant_history)


async def test_malformed_wrap_decision_keeps_supplement_window_open():
    end_call_invocations: list[bool] = []

    class EndCallTool:
        async def _end_call(self, _ctx):
            end_call_invocations.append(True)
            return "结束"

    model = _ScriptedLLM(
        [
            [
                llm.ChatChunk(
                    id="malformed",
                    delta=llm.ChoiceDelta(
                        content="RECAP_SENTINEL",
                        tool_calls=[
                            llm.FunctionToolCall(
                                name=_WRAP_DECISION_TOOL_NAME,
                                arguments="[]",
                                call_id="malformed-call",
                            )
                        ],
                    ),
                )
            ]
        ]
    )
    task = WrapUpTask(EndCallTool())  # type: ignore[arg-type]

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        result = await asyncio.wait_for(
            session.run(user_input="有，我想补充一点"),
            timeout=2,
        )
        assert not task.done()
        task.complete(None)

    assert end_call_invocations == []
    assert _assistant_texts(result) == ["请直接说出想补充的内容。"]
    assert "RECAP_SENTINEL" not in "".join(_assistant_texts(result))


async def test_wrap_up_waits_for_actual_supplement_before_ending():
    end_call_invocations: list[bool] = []

    class EndCallTool:
        async def _end_call(self, _ctx):
            end_call_invocations.append(True)
            return "使用简体中文礼貌感谢候选人。"

    def decision(chunk_id: str, action: str):
        return [
            llm.ChatChunk(
                id=chunk_id,
                delta=llm.ChoiceDelta(
                    content="RECAP_SENTINEL",
                    tool_calls=[
                        llm.FunctionToolCall(
                            name=_WRAP_DECISION_TOOL_NAME,
                            arguments=f'{{"action":"{action}"}}',
                            call_id=f"{chunk_id}-call",
                        )
                    ],
                ),
            )
        ]

    model = _ScriptedLLM(
        [
            decision("wait", "wait"),
            decision("request-details", "request_details"),
            decision("end", "end"),
            [
                llm.ChatChunk(
                    id="closing",
                    delta=llm.ChoiceDelta(
                        content="你刚才提到 SUPPLEMENT_SECRET。",
                    ),
                )
            ],
        ]
    )
    task = WrapUpTask(EndCallTool())  # type: ignore[arg-type]

    async with AgentSession(llm=model) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        wait_result = await asyncio.wait_for(
            session.run(user_input="请稍等"),
            timeout=2,
        )
        details_result = await asyncio.wait_for(
            session.run(user_input="有，我还想补充一点"),
            timeout=2,
        )
        assert not task.done()
        end_result = await asyncio.wait_for(
            session.run(user_input="SUPPLEMENT_SECRET"),
            timeout=2,
        )
        task.complete(None)

    assert _assistant_texts(wait_result) == ["好的，请准备好后继续。"]
    assert _assistant_texts(details_result) == ["请直接说出想补充的内容。"]
    assert _assistant_texts(end_result) == [_SAFE_CLOSING]
    assert end_call_invocations == [True]
    assert "RECAP_SENTINEL" not in "".join(_assistant_texts(wait_result))
    assert "SUPPLEMENT_SECRET" not in "".join(_assistant_texts(end_result))


@pytest.mark.parametrize(
    ("max_tool_steps", "expected_end_call_count"),
    [(0, 1), (1, 2)],
)
async def test_wrap_up_end_call_exception_is_bounded_by_max_tool_steps(
    max_tool_steps,
    expected_end_call_count,
):
    end_call_invocations: list[bool] = []

    async def end_call() -> str:
        end_call_invocations.append(True)
        raise RuntimeError("end call failed")

    class EndCallTool:
        async def _end_call(self, _ctx):
            return await end_call()

    model = _ScriptedLLM(
        [
            [
                llm.ChatChunk(
                    id="end-call-decision",
                    delta=llm.ChoiceDelta(
                        tool_calls=[
                            llm.FunctionToolCall(
                                name=_WRAP_DECISION_TOOL_NAME,
                                arguments='{"action":"end"}',
                                call_id="end-call-id",
                            )
                        ]
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="wrong-retry-action",
                    delta=llm.ChoiceDelta(
                        content="FALLBACK_RECAP_SECRET",
                        tool_calls=[
                            llm.FunctionToolCall(
                                name=_WRAP_DECISION_TOOL_NAME,
                                arguments='{"action":"wait"}',
                                call_id="wrong-retry-action-id",
                            )
                        ],
                    ),
                )
            ],
            [
                llm.ChatChunk(
                    id="second-max-step-fallback",
                    delta=llm.ChoiceDelta(content="SECOND_FALLBACK_RECAP_SECRET"),
                )
            ],
        ]
    )
    task = WrapUpTask(EndCallTool())  # type: ignore[arg-type]

    async with AgentSession(llm=model, max_tool_steps=max_tool_steps) as session:
        await session.start(_TaskHarness(task))
        await _eventually(
            lambda: (
                task._activity is not None  # type: ignore[attr-defined]
                and not task._activity._scheduling_paused
            )  # type: ignore[attr-defined]
        )
        result = session.run(user_input="没有其他补充了")
        await asyncio.wait_for(result, timeout=2)
        await asyncio.sleep(0.05)
        assistant_history = [
            item.text_content or ""
            for item in session.history.items
            if item.type == "message" and item.role == "assistant"
        ]

    assert len(end_call_invocations) == expected_end_call_count
    assert len(model.calls) == expected_end_call_count + 1
    assert model.calls[-1]["tool_choice"] == "none"
    assert "FALLBACK_RECAP_SECRET" not in "".join(assistant_history)
    assert "SECOND_FALLBACK_RECAP_SECRET" not in "".join(assistant_history)
    assert _SAFE_CLOSING in assistant_history
