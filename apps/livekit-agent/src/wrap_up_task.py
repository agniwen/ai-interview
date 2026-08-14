"""Wrap-up task: collect one optional closing supplement, then end the call.

Splitting the wrap-up phase out of InterviewAgent's main prompt addresses the
recurring failure mode where smaller LLMs ignore the "no new topics" hint and
keep asking new interview questions past the soft-wrap deadline. Inside this
task the action surface is bounded to request-details, wait, or end, so it
cannot reopen the interview question workflow.

The task reuses the parent InterviewAgent's EndCallTool so the actual shutdown
path is identical to a normal end-of-interview close (TTS the configured
closing instructions, then DeleteRoom + shutdown via job_ctx).
"""

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterable
from enum import StrEnum
from typing import Any

from livekit.agents import (
    AgentTask,
    FlushSentinel,
    ModelSettings,
    RunContext,
    function_tool,
    llm,
)
from livekit.agents.beta.tools import EndCallTool

from prompts import LANGUAGE_POLICY

logger = logging.getLogger("agent")

_WRAP_DECISION_TOOL_NAME = "submit_wrap_up_decision"
_CLOSING_QUESTION = "在结束前，如有补充请直接说明；没有请告诉我“没有”。"
_SAFE_CLOSING = "感谢你参加本次面试，祝你一切顺利，再见。"
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_RECAP_MARKERS = (
    "你刚才",
    "您刚才",
    "刚才你",
    "刚才您",
    "你提到",
    "您提到",
    "你的回答",
    "您的回答",
    "总结一下",
    "回顾一下",
)


class WrapUpAction(StrEnum):
    END = "end"
    REQUEST_DETAILS = "request_details"
    WAIT = "wait"


# 任务级 system prompt: 仅约束行为, 实际告别措辞由 EndCallTool.end_instructions 注入,
# 这样自定义的 closing_instructions 能继续生效, 不会被任务提示覆盖.
# Task-level system prompt: behavioural rails only. The actual goodbye wording
# is injected via EndCallTool.end_instructions so the user-configured closing
# instructions still drive the final TTS without being clobbered here.
_WRAP_UP_INSTRUCTIONS = f"""你正处在面试的收尾阶段, 任务是问候选人一个简短的总结性收尾问题, 然后结束面试.

收尾问题只询问候选人是否还有内容需要补充，不再扩展其他话题.

行为规则:
- 不要再提出新的技术问题、不要追问简历细节, 也不要展开新话题.
- 不得复述、概括或评价候选人在必问题阶段提供的任何信息.
- 候选人已经给出实质补充，或明确表示"没有了/没什么补充了"时，action=end.
- 候选人只说"有内容想补充"但尚未说出内容时，action=request_details.
- 候选人要求稍等、网络或设备异常时，action=wait.
- 每次只调用 submit_wrap_up_decision，不得输出任何候选人可见文本.
- {LANGUAGE_POLICY}
- 语气友好专业, 不使用 emoji 或特殊符号."""


def _wrap_decision_tool_choice() -> dict[str, Any]:
    return {
        "type": "function",
        "function": {"name": _WRAP_DECISION_TOOL_NAME},
    }


def _normalize_visible_text(value: str, *, limit: int = 240) -> str:
    return " ".join(_CONTROL_CHARS.sub(" ", value).split())[:limit].strip()


def _safe_model_text(value: str) -> str:
    normalized = _normalize_visible_text(value)
    if not normalized:
        return ""
    if any(marker in normalized for marker in _RECAP_MARKERS):
        return ""
    return normalized


class WrapUpTask(AgentTask[None]):
    """Asks one closing question and ends the call via the shared EndCallTool.

    The task does not need a typed result because the only successful exit is
    the LLM calling end_call, which shuts the session down directly. Cancellation
    via the hard timeout path or candidate disconnect is handled by the parent
    session lifecycle, not by this task.
    """

    def __init__(
        self,
        end_call_tool: EndCallTool,
        *,
        ask_closing_question: bool = True,
        closing_instructions: str = "使用简体中文礼貌感谢候选人并告别。",
    ) -> None:
        self._end_call_tool = end_call_tool
        super().__init__(instructions=_WRAP_UP_INSTRUCTIONS)
        self._ask_closing_question = ask_closing_question
        self._closing_instructions = closing_instructions
        self._end_call_succeeded = False
        self._end_call_requested = False
        self._handled_speech_ids: set[str] = set()

    def llm_node(
        self,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool],
        model_settings: ModelSettings,
    ):
        decision_enabled = model_settings.tool_choice != "none"
        has_end_call_output = self._end_call_succeeded and any(
            isinstance(item, llm.FunctionCallOutput)
            and item.name == _WRAP_DECISION_TOOL_NAME
            and not item.is_error
            for item in chat_ctx.items
        )
        shutdown_fallback = not has_end_call_output and not decision_enabled
        safe_ctx = llm.ChatContext.empty()
        if has_end_call_output or shutdown_fallback:
            model_settings.tool_choice = "none"
            safe_ctx.add_message(
                role="system",
                content=(
                    f"{LANGUAGE_POLICY}\n"
                    "生成一句简短、专业的最终告别。不得提及、复述、概括或评价"
                    "候选人的任何回答，不得提出问题。按以下管理员结束语要求表达：\n"
                    f"{self._closing_instructions}"
                ),
            )
            safe_tools: list[llm.Tool] = []
        else:
            model_settings.tool_choice = _wrap_decision_tool_choice()
            safe_ctx.add_message(
                role="system",
                content=(
                    f"{_WRAP_UP_INSTRUCTIONS}\n"
                    "只根据最后一条候选人消息选择 action，不得复述或概括对方的话。"
                ),
            )
            for item in reversed(chat_ctx.items):
                if isinstance(item, llm.ChatMessage) and item.role == "user":
                    safe_ctx.add_message(
                        role="user",
                        content=_normalize_visible_text(
                            item.text_content or "",
                            limit=1000,
                        ),
                    )
                    break
            safe_tools = tools

        stream = super().llm_node(safe_ctx, safe_tools, model_settings)

        async def isolated_stream():
            resolved = await stream if asyncio.iscoroutine(stream) else stream
            content_parts: list[str] = []
            function_calls: list[llm.FunctionToolCall] = []
            flushes: list[FlushSentinel] = []
            response_id = "wrap-up"

            if isinstance(resolved, str):
                content_parts.append(resolved)
            elif isinstance(resolved, llm.ChatChunk):
                response_id = resolved.id
                if resolved.delta:
                    content_parts.append(resolved.delta.content or "")
                    function_calls.extend(resolved.delta.tool_calls)
            elif isinstance(resolved, AsyncIterable):
                async for chunk in resolved:
                    if isinstance(chunk, FlushSentinel):
                        flushes.append(chunk)
                    elif isinstance(chunk, str):
                        content_parts.append(chunk)
                    elif isinstance(chunk, llm.ChatChunk):
                        response_id = chunk.id
                        if chunk.delta:
                            content_parts.append(chunk.delta.content or "")
                            function_calls.extend(chunk.delta.tool_calls)

            if self.done():
                return

            if shutdown_fallback:
                # The SDK has exhausted max_tool_steps after an end_call
                # failure. Never override its tool_choice=none or the tool
                # loop becomes unbounded. Queue a fixed goodbye independently
                # so its playout handle can close the session only after it is
                # heard; shutting down before yielding cancels the goodbye.
                handle = self.session.say(
                    _SAFE_CLOSING,
                    allow_interruptions=False,
                )

                def finish_fallback(_: Any) -> None:
                    if not self.done():
                        self.complete(None)
                    self.session.shutdown(drain=True)

                handle.add_done_callback(finish_fallback)
                return
            elif has_end_call_output:
                model_text = _safe_model_text("".join(content_parts))
                yield llm.ChatChunk(
                    id=response_id,
                    delta=llm.ChoiceDelta(content=model_text or _SAFE_CLOSING),
                )
            else:
                model_text = ""
                valid_call = (
                    len(function_calls) == 1
                    and function_calls[0].name == _WRAP_DECISION_TOOL_NAME
                )
                action = (
                    WrapUpAction.END
                    if self._end_call_requested or not self._ask_closing_question
                    else WrapUpAction.REQUEST_DETAILS
                )
                if valid_call:
                    try:
                        arguments = json.loads(function_calls[0].arguments)
                        action = WrapUpAction(arguments["action"])
                    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                        valid_call = False
                if self._end_call_requested or not self._ask_closing_question:
                    action = WrapUpAction.END
                call_id = function_calls[0].call_id if valid_call else response_id
                function_calls = [
                    llm.FunctionToolCall(
                        name=_WRAP_DECISION_TOOL_NAME,
                        arguments=json.dumps({"action": action.value}),
                        call_id=f"{call_id}-wrap-decision",
                    )
                ]
                yield llm.ChatChunk(
                    id=response_id,
                    delta=llm.ChoiceDelta(
                        content=model_text or None,
                        tool_calls=function_calls,
                    ),
                )

            for flush in flushes:
                yield flush

        return isolated_stream()

    @function_tool(name=_WRAP_DECISION_TOOL_NAME)
    async def submit_wrap_up_decision(
        self,
        ctx: RunContext,
        action: WrapUpAction,
    ) -> str | None:
        """记录候选人的收尾状态, 每次发言只调用一次。"""
        speech_id = ctx.speech_handle.id
        if self.done() or speech_id in self._handled_speech_ids:
            return None
        self._handled_speech_ids.add(speech_id)
        if self._end_call_requested or not self._ask_closing_question:
            action = WrapUpAction.END

        if action is WrapUpAction.REQUEST_DETAILS:
            try:
                self.session.say("请直接说出想补充的内容。")
            except Exception:
                self._handled_speech_ids.discard(speech_id)
                raise
            return None
        if action is WrapUpAction.WAIT:
            try:
                self.session.say("好的，请准备好后继续。")
            except Exception:
                self._handled_speech_ids.discard(speech_id)
                raise
            return None

        self._end_call_requested = True
        try:
            output = await self._end_call_tool._end_call(ctx)  # type: ignore[attr-defined]
        except Exception:
            self._handled_speech_ids.discard(speech_id)
            raise
        self._end_call_succeeded = True
        return output

    async def on_enter(self) -> None:
        self.session.update_options(
            endpointing_opts={
                "mode": "dynamic",
                "min_delay": 0.4,
                "max_delay": 2.5,
            }
        )
        # 由任务自身触发收尾问句, 避免主 agent 在 on_user_turn_completed
        # 注入 hint 后还要再赌一次模型自觉性.
        # Drive the closing question from the task itself rather than relying
        # on the parent agent's hint mechanism, which leaves the trigger up
        # to the LLM's discretion.
        logger.info("wrap-up: entering closing phase")
        if self._ask_closing_question:
            self.session.say(_CLOSING_QUESTION)
            return
        await self.session.generate_reply(
            instructions="不要提出问题，将 action 设为 end。"
        )
