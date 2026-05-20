import logging
import re
import time
from collections.abc import AsyncIterable

from livekit import rtc
from livekit.agents import (
    Agent,
    ChatContext,
    ChatMessage,
    ModelSettings,
    function_tool,
    stt,
)
from livekit.agents.beta.tools import EndCallTool

from prompts import apply_placeholders, build_instructions
from ready_check_task import ReadyCheckTask
from wrap_up_task import WrapUpTask

logger = logging.getLogger("agent")


INTERVIEW_TIME_LIMIT_SECONDS = 20 * 60
INTERVIEW_SOFT_WRAP_SECONDS = 16 * 60
INTERVIEW_FINAL_WRAP_SECONDS = 18 * 60 + 30
# Hard cutoff is enforced in agent.py; allow ~3 min after the soft limit so
# the LLM has time to ask the closing question, hear the answer, and say
# goodbye without being interrupted mid-sentence.
INTERVIEW_HARD_GRACE_SECONDS = 3 * 60

# 默认开场白指令 / Default opening instructions when none are configured globally
DEFAULT_OPENING_INSTRUCTIONS = (
    '用候选人的名字"{候选人姓名}"打招呼，简短介绍你是今天"{岗位}"岗位的面试官，'
    '然后用自然口语询问候选人"准备好了吗"。语气友好专业，一两句话即可。'
    "本轮只做开场和询问是否准备好，不要在这一轮提出任何面试题；"
    "等候选人明确表示准备好之后，再开始第一道题。"
)
# 默认结束语指令 / Default closing instructions when none are configured globally
DEFAULT_CLOSING_INSTRUCTIONS = "感谢候选人参加本次面试，祝你一切顺利。"


def _format_mmss(seconds: float) -> str:
    total = max(0, int(seconds))
    return f"{total // 60} 分 {total % 60:02d} 秒"


_NOISE_PATTERN = re.compile(
    r"^[\s，。、？！,.?!]*"
    r"(嗯+|哦+|啊+|呃+|唔+|哎+|噢+|嘶+|哼+|呵+|额+|emmm*|hmm*|uh+|um+|oh+|ah+)"
    r"[\s，。、？！,.?!]*$",
    re.IGNORECASE,
)


class InterviewAgent(Agent):
    def __init__(
        self,
        interview_context: dict,
        interviewer: dict | None = None,
        time_limit_seconds: int = INTERVIEW_TIME_LIMIT_SECONDS,
    ) -> None:
        candidate_name = interview_context.get("candidate_name", "候选人")
        target_role = interview_context.get("target_role", "未指定岗位")

        # 解析全局开场白与结束语，空值时使用默认值，并应用字面占位符替换  # noqa: RUF003
        # Parse global opening/closing instructions; fall back to defaults when
        # empty, then apply literal placeholder substitution.
        opening = (interview_context.get("global_opening_instructions") or "").strip()
        closing = (interview_context.get("global_closing_instructions") or "").strip()
        self._opening_instructions = apply_placeholders(
            opening or DEFAULT_OPENING_INSTRUCTIONS, candidate_name, target_role
        )
        self._closing_instructions = apply_placeholders(
            closing or DEFAULT_CLOSING_INSTRUCTIONS, candidate_name, target_role
        )

        self._end_call_tool = EndCallTool(
            extra_description="当面试结束、候选人要求结束、候选人连续三次答非所问、态度恶劣，或系统计时提示已到时间上限时，调用此工具结束面试。",
            delete_room=True,
            end_instructions=self._closing_instructions,
        )

        super().__init__(
            instructions=build_instructions(interview_context, interviewer),
            tools=self._end_call_tool.tools,  # type: ignore
        )

        self._candidate_name = candidate_name
        self._target_role = target_role
        self._time_limit = time_limit_seconds
        self._started_at: float | None = None
        # 防止 enter_wrap_up 被重复调用: WrapUpTask 进入后会自行 end_call 关闭 session,
        # 但模型在 hint 持续提示下可能在 wrap-up 还没生效前再次尝试调用本工具.
        # Guard so enter_wrap_up only fires once. The model can spam the tool if
        # hints keep firing before WrapUpTask actually takes over.
        self._wrap_up_started = False

    def mark_started(self) -> None:
        """Anchor the elapsed-time clock. Call after session.start()."""
        self._started_at = time.time()

    def elapsed_seconds(self) -> float:
        if self._started_at is None:
            return 0.0
        return max(0.0, time.time() - self._started_at)

    @property
    def time_limit_seconds(self) -> int:
        return self._time_limit

    @property
    def hard_grace_seconds(self) -> int:
        return INTERVIEW_HARD_GRACE_SECONDS

    @property
    def closing_instructions(self) -> str:
        return self._closing_instructions

    @function_tool()
    async def enter_wrap_up(self) -> str | None:
        """系统计时提示出现"已进入收尾时间"后调用; 你会被转入收尾流程, 由其向候选人提出本场最后一个收尾问题并结束面试. 在还未达到收尾时间或主流程仍在进行时, 不要调用此工具."""
        # 软门: 16 分钟前的误触直接驳回, 防止模型在 hint 出现前就抢跑进入收尾.
        # Soft gate: reject premature invocations so the LLM cannot skip ahead
        # into wrap-up before the soft-wrap hint actually fires.
        if self.elapsed_seconds() < INTERVIEW_SOFT_WRAP_SECONDS - 30:
            return "[拒绝] 还未到收尾时间, 请继续按系统提示中的题目列表提问。"
        if self._wrap_up_started:
            return "[拒绝] 收尾流程已经启动, 请等待 WrapUpTask 完成并调用 end_call。"
        self._wrap_up_started = True
        logger.info(
            "wrap-up triggered at elapsed=%.0fs (limit=%ds)",
            self.elapsed_seconds(),
            self._time_limit,
        )
        # WrapUpTask 内部通过共享的 EndCallTool 自行 end_call 关闭 session,
        # 正常路径下不会回到这里; 异常路径(任务被取消)由外层 session lifecycle 兜底.
        # WrapUpTask drives the close via the shared EndCallTool, so under the
        # happy path execution never returns here. Cancellation is handled by
        # the outer session lifecycle (hard timeout / candidate disconnect).
        await WrapUpTask(self._end_call_tool)
        return None

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        # Inject a per-turn time hint so the LLM can self-pace. Ephemeral:
        # we intentionally do NOT call update_chat_ctx — it applies only to
        # this turn, so the LLM sees fresh numbers on every reply.
        if self._started_at is None:
            return
        elapsed = self.elapsed_seconds()
        remaining = max(0.0, self._time_limit - elapsed)

        if elapsed >= self._time_limit:
            hint = (
                f"[计时提示] 面试已达到 {_format_mmss(self._time_limit)} 时间上限。"
                "请用一两句温暖、体面的话向候选人告别（感谢参与、祝顺利），"
                "随后调用 end_call 工具结束面试，不要再发起新提问。"
            )
        elif elapsed >= INTERVIEW_FINAL_WRAP_SECONDS:
            hint = (
                f"[计时提示] 面试已进行 {_format_mmss(elapsed)}，时间接近上限。"
                "不要再开新话题或追问；如果当前题目还未答完，听完这一题的回答即可，"
                "之后用一两句话向候选人体面告别并调用 end_call 结束面试。"
            )
        elif elapsed >= INTERVIEW_SOFT_WRAP_SECONDS:
            hint = (
                f"[计时提示] 面试已进行 {_format_mmss(elapsed)}，"
                f"剩余约 {_format_mmss(remaining)}。已进入收尾时间："
                "听完候选人对当前问题的回答后, 立即调用 enter_wrap_up 工具进入收尾流程；"
                "不要在主流程里继续提出新问题。"
            )
        else:
            hint = (
                f"[计时提示] 面试已进行 {_format_mmss(elapsed)}，"
                f"剩余 {_format_mmss(remaining)}。请合理分配剩余时间。"
            )
        turn_ctx.add_message(role="system", content=hint)

    async def on_enter(self):
        # 开场寒暄 + "准备好了吗"确认拆到 ReadyCheckTask 里执行: 该 task 只暴露
        # confirm_ready / decline_interview 两个工具, 让小模型 (Qwen-turbo /
        # DeepSeek-V4-flash) 在受限工具集中做出明确判断, 避免在确认前抢跑提问.
        # The greeting + ready confirmation runs inside ReadyCheckTask, which
        # exposes only confirm_ready / decline_interview. Bounding the tool
        # set keeps small models from jumping into the first question before
        # the candidate has actually confirmed.
        ready = await ReadyCheckTask(
            opening_instructions=self._opening_instructions,
        )
        if not ready:
            handle = self.session.generate_reply(
                instructions=self._closing_instructions,
                allow_interruptions=False,
            )
            await handle.wait_for_playout()
            await self.session.aclose()
            return

        # 候选人确认就绪后, 用一句轻量指令把控制权交回 InterviewAgent 的主 prompt,
        # 由它按系统提示中的题目顺序进入第一道岗位预设题. 不要再次寒暄.
        # Hand control back to the main interview prompt: the system prompt
        # already contains the question list, so we only nudge it into the
        # first preset question without repeating the greeting.
        await self.session.generate_reply(
            instructions=(
                "候选人已确认准备好，并且上个阶段已经说过类似‘好的，那正式开始’之类的话了。直接开始按系统提示中的题目列表顺序，"
                "向候选人提出第一道岗位预设题。直接进入提问，不要再次寒暄或自我介绍。"
            ),
        )

    async def stt_node(
        self,
        audio: AsyncIterable[rtc.AudioFrame],
        model_settings: ModelSettings,
    ) -> AsyncIterable[stt.SpeechEvent | str]:
        # 基类签名允许 yield SpeechEvent | str（增量转写片段会以 str 出现），  # noqa: RUF003
        # 因此过滤逻辑需要先判类型再访问 SpeechEvent 字段，否则字符串会触发  # noqa: RUF003
        # AttributeError。
        # Base signature yields SpeechEvent | str (string chunks are emitted
        # for incremental transcripts), so guard with isinstance before
        # reading SpeechEvent-only fields and pass strings through unchanged.
        async def _filter() -> AsyncIterable[stt.SpeechEvent | str]:
            async for event in Agent.default.stt_node(self, audio, model_settings):
                if (
                    isinstance(event, stt.SpeechEvent)
                    and event.type == stt.SpeechEventType.FINAL_TRANSCRIPT
                ):
                    text = (
                        event.alternatives[0].text.strip() if event.alternatives else ""
                    )
                    if not text or _NOISE_PATTERN.match(text):
                        logger.debug("filtered noise transcript: %r", text)
                        continue
                yield event

        return _filter()
