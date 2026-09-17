"""Opt-in live regression for the opening task's candidate-facing output.

Run with RUN_AGENT_LLM_TESTS=1 uv run pytest tests/test_ready_check_task_llm.py.
Uses the same provider/model configuration as the voice worker; no room or
candidate record is created and no interview callback is sent.
"""

import os

import pytest
from dotenv import load_dotenv
from livekit.agents import llm
from livekit.plugins import openai

from ready_check_task import ReadyCheckTask

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_AGENT_LLM_TESTS") != "1",
    reason="requires an explicit live model test run",
)


@pytest.mark.parametrize(
    ("answer", "expected_tool"),
    [
        ("我准备好了，可以开始面试。", "confirm_ready"),
        ("准备好了，请开始。", "confirm_ready"),
        ("我决定不参加了，请结束这次面试。", "decline_interview"),
    ],
)
async def test_opening_decision_uses_tools_without_internal_narration(
    answer, expected_tool
):
    load_dotenv()
    task = ReadyCheckTask(opening_instructions="你好，请问准备好开始面试了吗？")
    context = llm.ChatContext()
    context.add_message(role="system", content=task.instructions)
    context.add_message(role="assistant", content="你好，请问准备好开始面试了吗？")
    context.add_message(role="user", content=answer)
    text = ""
    tool_names = []
    async with (
        openai.LLM(
            model=os.environ.get("DASHSCOPE_LLM_MODEL", "deepseek-v4-flash-0731"),
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key=os.environ["DASHSCOPE_API_KEY"],
            extra_body={"enable_thinking": False},
            parallel_tool_calls=False,
        ) as model,
        model.chat(chat_ctx=context, tools=task.tools) as stream,
    ):
        async for chunk in stream:
            if chunk.delta:
                text += chunk.delta.content or ""
                tool_names.extend(call.name for call in chunk.delta.tool_calls or [])
    assert tool_names == [expected_tool]
    assert not text.strip(), f"Task transitions must not narrate internals: {text}"
