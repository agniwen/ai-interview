from types import SimpleNamespace

import pytest
from livekit.agents import AgentTask, ModelSettings, llm

from wrap_up_task import (
    _CLOSING_QUESTION,
    _SAFE_CLOSING,
    _WRAP_DECISION_TOOL_NAME,
    _WRAP_UP_INSTRUCTIONS,
    WrapUpAction,
)


class _EndCallTool:
    pass


class _Session:
    def __init__(self):
        self.endpointing = None
        self.replies = []
        self.spoken = []

    def update_options(self, *, endpointing_opts):
        self.endpointing = endpointing_opts

    async def generate_reply(self, **kwargs):
        self.replies.append(kwargs)
        return None

    def say(self, text):
        self.spoken.append(text)


def test_wrap_up_requires_simplified_chinese():
    assert "全程使用简体中文" in _WRAP_UP_INSTRUCTIONS
    assert "以候选人的主要语言为主" not in _WRAP_UP_INSTRUCTIONS


async def test_wrap_up_uses_short_confirmation_endpointing(monkeypatch):
    task = __import__("wrap_up_task").WrapUpTask(_EndCallTool())
    session = _Session()
    monkeypatch.setattr(
        task,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=session),
    )

    await task.on_enter()

    assert session.endpointing == {
        "mode": "dynamic",
        "min_delay": 0.4,
        "max_delay": 2.5,
    }
    assert session.spoken == [_CLOSING_QUESTION]
    assert session.replies == []


async def test_candidate_ended_round_goes_directly_to_goodbye(monkeypatch):
    task = __import__("wrap_up_task").WrapUpTask(
        _EndCallTool(),
        ask_closing_question=False,
    )
    session = _Session()
    monkeypatch.setattr(
        task,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=session),
    )

    await task.on_enter()

    assert "不要提出问题" in session.replies[0]["instructions"]
    assert "action 设为 end" in session.replies[0]["instructions"]


@pytest.mark.asyncio
async def test_wrap_up_decision_sees_only_the_current_closing_turn(monkeypatch):
    captured = {}

    async def upstream():
        yield llm.ChatChunk(
            id="end-call",
            delta=llm.ChoiceDelta(
                content="感谢你的详细补充，内容很完整。",
                tool_calls=[
                    llm.FunctionToolCall(
                        name=_WRAP_DECISION_TOOL_NAME,
                        arguments='{"action":"end"}',
                        call_id="end-call-id",
                    )
                ],
            ),
        )

    def fake_llm_node(self, chat_ctx, tools, model_settings):
        captured["context"] = "\n".join(
            item.text_content or ""
            for item in chat_ctx.items
            if isinstance(item, llm.ChatMessage)
        )
        return upstream()

    monkeypatch.setattr(AgentTask, "llm_node", fake_llm_node)
    task = __import__("wrap_up_task").WrapUpTask(_EndCallTool())
    chat_ctx = llm.ChatContext.empty()
    chat_ctx.add_message(role="user", content="ANSWER_HISTORY_SECRET")
    chat_ctx.add_message(role="assistant", content="中间问题")
    chat_ctx.add_message(role="user", content="没有其他补充了")
    model_settings = ModelSettings(tool_choice="auto")

    chunks = [chunk async for chunk in task.llm_node(chat_ctx, [], model_settings)]

    assert "ANSWER_HISTORY_SECRET" not in captured["context"]
    assert "没有其他补充了" in captured["context"]
    assert model_settings.tool_choice == {
        "type": "function",
        "function": {"name": _WRAP_DECISION_TOOL_NAME},
    }
    assert chunks[0].delta is not None
    assert chunks[0].delta.content is None
    assert chunks[0].delta.tool_calls[0].name == _WRAP_DECISION_TOOL_NAME


@pytest.mark.asyncio
async def test_wrap_up_closing_filters_recap_and_uses_isolated_context(monkeypatch):
    captured = {}

    async def upstream():
        yield llm.ChatChunk(
            id="closing",
            delta=llm.ChoiceDelta(
                content="你刚才提到 ANSWER_HISTORY_SECRET，祝你顺利。",
            ),
        )

    def fake_llm_node(self, chat_ctx, tools, model_settings):
        captured["context"] = "\n".join(
            item.text_content or ""
            for item in chat_ctx.items
            if isinstance(item, llm.ChatMessage)
        )
        captured["tools"] = tools
        return upstream()

    monkeypatch.setattr(AgentTask, "llm_node", fake_llm_node)
    task = __import__("wrap_up_task").WrapUpTask(
        _EndCallTool(),
        closing_instructions="使用简体中文感谢候选人。",
    )
    task._end_call_succeeded = True  # type: ignore[attr-defined]
    chat_ctx = llm.ChatContext.empty()
    chat_ctx.add_message(role="user", content="ANSWER_HISTORY_SECRET")
    chat_ctx.items.append(
        llm.FunctionCallOutput(
            name=_WRAP_DECISION_TOOL_NAME,
            call_id="end-call-id",
            output="使用简体中文感谢候选人。",
            is_error=False,
        )
    )
    model_settings = ModelSettings(tool_choice="auto")

    chunks = [chunk async for chunk in task.llm_node(chat_ctx, [], model_settings)]

    assert "ANSWER_HISTORY_SECRET" not in captured["context"]
    assert captured["tools"] == []
    assert model_settings.tool_choice == "none"
    assert chunks[0].delta is not None
    assert chunks[0].delta.content == _SAFE_CLOSING


@pytest.mark.asyncio
async def test_failed_end_call_output_is_retried_instead_of_playing_goodbye(
    monkeypatch,
):
    async def upstream():
        yield llm.ChatChunk(
            id="retry-end-call",
            delta=llm.ChoiceDelta(
                tool_calls=[
                    llm.FunctionToolCall(
                        name=_WRAP_DECISION_TOOL_NAME,
                        arguments='{"action":"wait"}',
                        call_id="retry-end-call-id",
                    )
                ]
            ),
        )

    monkeypatch.setattr(AgentTask, "llm_node", lambda *_args: upstream())
    task = __import__("wrap_up_task").WrapUpTask(_EndCallTool())
    task._end_call_requested = True  # type: ignore[attr-defined]
    chat_ctx = llm.ChatContext.empty()
    chat_ctx.items.append(
        llm.FunctionCallOutput(
            name=_WRAP_DECISION_TOOL_NAME,
            call_id="failed-end-call-id",
            output="invalid arguments",
            is_error=True,
        )
    )
    model_settings = ModelSettings(tool_choice="auto")

    chunks = [chunk async for chunk in task.llm_node(chat_ctx, [], model_settings)]

    assert model_settings.tool_choice == {
        "type": "function",
        "function": {"name": _WRAP_DECISION_TOOL_NAME},
    }
    assert chunks[0].delta is not None
    assert chunks[0].delta.content is None
    assert chunks[0].delta.tool_calls[0].arguments == '{"action": "end"}'


@pytest.mark.asyncio
async def test_malformed_wrap_decision_does_not_end_an_open_closing_turn(monkeypatch):
    async def upstream():
        yield llm.ChatChunk(
            id="malformed",
            delta=llm.ChoiceDelta(content="模型没有调用工具"),
        )

    monkeypatch.setattr(AgentTask, "llm_node", lambda *_args: upstream())
    task = __import__("wrap_up_task").WrapUpTask(_EndCallTool())
    chat_ctx = llm.ChatContext.empty()
    chat_ctx.add_message(role="user", content="有，我想补充一点")

    chunks = [
        chunk
        async for chunk in task.llm_node(
            chat_ctx,
            [],
            ModelSettings(tool_choice="auto"),
        )
    ]

    assert chunks[0].delta is not None
    assert chunks[0].delta.content is None
    assert chunks[0].delta.tool_calls[0].arguments == ('{"action": "request_details"}')


@pytest.mark.asyncio
async def test_no_closing_question_forces_end_even_if_model_requests_details(
    monkeypatch,
):
    async def upstream():
        yield llm.ChatChunk(
            id="wrong-action",
            delta=llm.ChoiceDelta(
                tool_calls=[
                    llm.FunctionToolCall(
                        name=_WRAP_DECISION_TOOL_NAME,
                        arguments='{"action":"request_details"}',
                        call_id="wrong-action-call",
                    )
                ]
            ),
        )

    monkeypatch.setattr(AgentTask, "llm_node", lambda *_args: upstream())
    task = __import__("wrap_up_task").WrapUpTask(
        _EndCallTool(),
        ask_closing_question=False,
    )

    chunks = [
        chunk
        async for chunk in task.llm_node(
            llm.ChatContext.empty(),
            [],
            ModelSettings(tool_choice="auto"),
        )
    ]

    assert chunks[0].delta is not None
    assert chunks[0].delta.tool_calls[0].arguments == '{"action": "end"}'


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "action",
    [WrapUpAction.REQUEST_DETAILS, WrapUpAction.WAIT],
)
async def test_wrap_prompt_say_failure_allows_same_speech_retry(monkeypatch, action):
    task = __import__("wrap_up_task").WrapUpTask(_EndCallTool())

    class FailingSession:
        def say(self, _text: str):
            raise RuntimeError("speech queue unavailable")

    monkeypatch.setattr(
        task,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=FailingSession()),
    )
    ctx = SimpleNamespace(speech_handle=SimpleNamespace(id="same-turn"))

    with pytest.raises(RuntimeError, match="speech queue unavailable"):
        await task.submit_wrap_up_decision(ctx, action=action)

    spoken: list[str] = []

    class WorkingSession:
        def say(self, text: str):
            spoken.append(text)

    monkeypatch.setattr(
        task,
        "_get_activity_or_raise",
        lambda: SimpleNamespace(session=WorkingSession()),
    )
    await task.submit_wrap_up_decision(ctx, action=action)

    assert len(spoken) == 1
