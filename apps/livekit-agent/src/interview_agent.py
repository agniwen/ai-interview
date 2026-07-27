import logging
import os
import re
import time
from collections.abc import AsyncIterable, Awaitable, Callable

from livekit import rtc
from livekit.agents import (
    Agent,
    ChatContext,
    ChatMessage,
    ModelSettings,
    UserTurnExceededEvent,
    function_tool,
    stt,
)
from livekit.agents.beta.tools import EndCallTool

from dispatch_context import InterviewDispatchContext
from interview_clock import (
    STOP_NEW_QUESTIONS_SECONDS,
    PausableInterviewClock,
)
from interview_question_task import (
    InterviewQuestionOutcome,
    QuestionOutcomeStatus,
    build_question_task_group,
)
from prompts import LANGUAGE_POLICY
from ready_check_task import ReadyCheckTask
from wrap_up_task import WrapUpTask

logger = logging.getLogger("agent")


class InterviewWorkflowStoppedError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


# 调试开关: 设置 INTERVIEW_DEBUG_FAST=1 时把整套计时压到 1 分钟级别, 用来在本地
# 快速跑完 "soft wrap -> final wrap -> time limit -> hard cutoff" 完整流程, 不
# 必真等 25 分钟. 生产环境保持默认即可.
# Debug switch: setting INTERVIEW_DEBUG_FAST=1 compresses the whole timeline to
# ~1 minute so local dev can exercise the full soft-wrap -> final-wrap -> time-
# limit -> hard-cutoff path without waiting 25 minutes. Production stays on the
# default schedule.
_DEBUG_FAST = os.environ.get("INTERVIEW_DEBUG_FAST", "").lower() in (
    "1",
    "true",
    "yes",
    "on",
)

if _DEBUG_FAST:
    # 数值挑选: 与生产 18.5/21/24/1min 同形比例, 同时保证
    # 相邻两阶段之间留出至少 10s 间隙, 给 _force_wind_down / _enforce_time_limit
    # 的 wait_for_playout 有播放窗口. 硬切总时长 = 45 + 15 = 60s.
    # Values chosen to keep the same shape as the prod 18.5/21/24/1min timeline
    # while leaving ≥10s between adjacent phases so the playout windows for
    # _force_wind_down / _enforce_time_limit don't overlap. Total hard cutoff
    # lands at 45 + 15 = 60s.
    INTERVIEW_SOFT_WRAP_SECONDS = 20
    INTERVIEW_FINAL_WRAP_SECONDS = 30
    INTERVIEW_TIME_LIMIT_SECONDS = 45
    INTERVIEW_HARD_GRACE_SECONDS = 15
    logger.warning(
        "INTERVIEW_DEBUG_FAST is ON: compressed timeline "
        "(soft=%ds final=%ds limit=%ds hard_cutoff=%ds)",
        INTERVIEW_SOFT_WRAP_SECONDS,
        INTERVIEW_FINAL_WRAP_SECONDS,
        INTERVIEW_TIME_LIMIT_SECONDS,
        INTERVIEW_TIME_LIMIT_SECONDS + INTERVIEW_HARD_GRACE_SECONDS,
    )
else:
    INTERVIEW_TIME_LIMIT_SECONDS = 24 * 60
    INTERVIEW_SOFT_WRAP_SECONDS = 18 * 60 + 30
    INTERVIEW_FINAL_WRAP_SECONDS = 21 * 60
    # Hard cutoff is enforced in agent.py; allow 1 min after the time limit so
    # the LLM has time to ask the closing question, hear the answer, and say
    # goodbye without being interrupted mid-sentence.
    INTERVIEW_HARD_GRACE_SECONDS = 60


def _format_mmss(seconds: float) -> str:
    total = max(0, int(seconds))
    return f"{total // 60} 分 {total % 60:02d} 秒"


_NOISE_PATTERN = re.compile(
    r"^[\s，。、？！,.?!]*"
    r"(嗯+|哦+|啊+|呃+|唔+|哎+|噢+|嘶+|哼+|呵+|额+|emmm*|hmm*|uh+|um+|oh+|ah+)"
    r"[\s，。、？！,.?!]*$",
    re.IGNORECASE,
)
_TEXT_CONTENT_PATTERN = re.compile(r"[0-9A-Za-z\u4e00-\u9fff]")


def _is_noise_transcript(text: str) -> bool:
    normalized = text.strip()
    return (
        not normalized
        or _NOISE_PATTERN.match(normalized) is not None
        or _TEXT_CONTENT_PATTERN.search(normalized) is None
    )


class InterviewAgent(Agent):
    def __init__(
        self,
        interview_context: InterviewDispatchContext,
        time_limit_seconds: int = INTERVIEW_TIME_LIMIT_SECONDS,
        *,
        clock: PausableInterviewClock | None = None,
        on_question_completed: (
            Callable[[InterviewQuestionOutcome], Awaitable[None]] | None
        ) = None,
    ) -> None:
        self._opening_instructions = interview_context.prompts.opening
        self._closing_instructions = interview_context.prompts.closing

        self._end_call_tool = EndCallTool(
            extra_description="当面试结束、候选人要求结束、候选人连续三次答非所问、态度恶劣，或系统计时提示已到时间上限时，调用此工具结束面试。",
            delete_room=True,
            end_instructions=self._closing_instructions,
        )

        super().__init__(
            instructions=(
                f"{interview_context.prompts.system}\n\n"
                f"## 中文面试语言要求\n{LANGUAGE_POLICY}"
            ),
            tools=self._end_call_tool.tools,  # type: ignore
        )

        self._candidate_name = interview_context.candidate.name
        self._target_role = interview_context.candidate.target_role
        self._time_limit = time_limit_seconds
        self._clock = clock or PausableInterviewClock()
        self._on_question_completed_callback = on_question_completed
        self._questions = interview_context.questions
        self._question_outcomes: dict[str, InterviewQuestionOutcome] = {}
        self._question_group = None
        self._call_completion_status: str | None = None
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
        return self._clock.elapsed()

    @property
    def question_outcomes(self) -> tuple[InterviewQuestionOutcome, ...]:
        return tuple(
            self._question_outcomes[question.id]
            for question in self._questions
            if question.id in self._question_outcomes
        )

    @property
    def call_completion_status(self) -> str | None:
        return self._call_completion_status

    @property
    def current_question_text(self) -> str | None:
        current_id = (
            self._question_group.current_question_id
            if self._question_group is not None
            else None
        )
        if current_id is None:
            return None
        return next(
            question.content
            for question in self._questions
            if question.id == current_id
        )

    def stop_question_workflow(self, reason: str) -> bool:
        if self._question_group is None:
            return False
        return self._question_group.interrupt_current(reason)

    def finalize_missing_question_outcomes(self, reason: str) -> None:
        current_id = (
            self._question_group.current_question_id
            if self._question_group is not None
            else None
        )
        if current_id is not None and current_id not in self._question_outcomes:
            current_outcome = self._question_group.current_interrupted_outcome(
                now=self.elapsed_seconds(),
                reason=reason,
            )
            if current_outcome is not None:
                self._question_outcomes[current_id] = current_outcome
        self._record_unasked(reason)

    async def _on_question_completed(self, event) -> None:
        outcome = event.result
        if not isinstance(outcome, InterviewQuestionOutcome):
            return
        self._question_outcomes[outcome.question_id] = outcome
        if self._on_question_completed_callback is not None:
            await self._on_question_completed_callback(outcome)
        if outcome.status is QuestionOutcomeStatus.INTERRUPTED:
            raise InterviewWorkflowStoppedError(outcome.reason or "system_shutdown")
        if self.elapsed_seconds() >= STOP_NEW_QUESTIONS_SECONDS:
            raise InterviewWorkflowStoppedError("time_limit")

    def _record_unasked(self, reason: str) -> None:
        now = self.elapsed_seconds()
        for question in self._questions:
            if question.id in self._question_outcomes:
                continue
            self._question_outcomes[question.id] = InterviewQuestionOutcome(
                question_id=question.id,
                question=question.content,
                difficulty=question.difficulty,
                evaluation_focus=question.evaluation_focus,
                follow_up_directions=question.follow_up_directions,
                status=QuestionOutcomeStatus.UNASKED,
                reason=reason,
                follow_up_count=0,
                started_at_secs=now,
                ended_at_secs=now,
                answer_summary=None,
                revision=1,
            )

    @property
    def time_limit_seconds(self) -> int:
        return self._time_limit

    @property
    def hard_grace_seconds(self) -> int:
        return INTERVIEW_HARD_GRACE_SECONDS

    @property
    def closing_instructions(self) -> str:
        return self._closing_instructions

    @property
    def wrap_up_started(self) -> bool:
        # 暴露给外层定时器: 21:00 强制收尾任务在拿到 True 时就跳过, 避免和
        # 模型自己调起的 enter_wrap_up 重复发声.
        # Exposed for the outer force-wind-down task to skip when the model
        # has already entered wrap-up on its own.
        return self._wrap_up_started

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

    async def on_user_turn_exceeded(self, ev: UserTurnExceededEvent) -> None:
        # Agent-initiated cut-in for runaway monologues. Keep it deterministic:
        # no LLM call, no new topic, and non-interruptible so the candidate
        # actually hears the time-control cue.
        logger.info(
            "user turn exceeded: words=%s transcript=%r",
            ev.accumulated_word_count,
            ev.accumulated_transcript[:120],
        )
        handle = self.session.say(
            "我先打断一下。为了控制面试时间，请用一两句话收个尾，"
            "然后我们继续下一个问题。",
            allow_interruptions=False,
        )
        await handle.wait_for_playout()

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
            self._call_completion_status = "partial"
            self._record_unasked("candidate_ended_round")
            await WrapUpTask(
                self._end_call_tool,
                ask_closing_question=False,
            )
            return

        self._question_group = build_question_task_group(
            self._questions,
            now=self.elapsed_seconds,
            outcomes=self._question_outcomes,
            on_task_completed=self._on_question_completed,
        )
        stop_reason: str | None = None
        try:
            await self._question_group
            self._call_completion_status = "success"
        except InterviewWorkflowStoppedError as error:
            stop_reason = error.reason
            self._record_unasked(error.reason)
            self._call_completion_status = (
                "success"
                if error.reason == "time_limit"
                else "failed"
                if error.reason == "system_shutdown"
                else "partial"
            )

        await WrapUpTask(
            self._end_call_tool,
            ask_closing_question=stop_reason in {None, "time_limit"},
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
                    if _is_noise_transcript(text):
                        logger.debug("filtered noise transcript: %r", text)
                        continue
                yield event

        return _filter()
