import logging
import re
import time
from collections.abc import AsyncIterable

from livekit import rtc
from livekit.agents import Agent, ChatContext, ChatMessage, ModelSettings, stt
from livekit.agents.beta.tools import EndCallTool

from prompts import build_instructions

logger = logging.getLogger("agent")


INTERVIEW_TIME_LIMIT_SECONDS = 20 * 60
INTERVIEW_SOFT_WRAP_SECONDS = 16 * 60
INTERVIEW_FINAL_WRAP_SECONDS = 18 * 60 + 30
# Hard cutoff is enforced in agent.py; allow ~3 min after the soft limit so
# the LLM has time to ask the closing question, hear the answer, and say
# goodbye without being interrupted mid-sentence.
INTERVIEW_HARD_GRACE_SECONDS = 3 * 60


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
        end_call_tool = EndCallTool(
            extra_description="当面试结束、候选人要求结束、候选人连续三次答非所问、态度恶劣，或系统计时提示已到时间上限时，调用此工具结束面试。",
            delete_room=True,
            end_instructions="感谢候选人参加本次面试，祝你一切顺利。",
        )

        super().__init__(
            instructions=build_instructions(interview_context, interviewer),
            tools=end_call_tool.tools,  # type: ignore
        )

        self._candidate_name = interview_context.get("candidate_name", "候选人")
        self._target_role = interview_context.get("target_role", "未指定岗位")
        self._time_limit = time_limit_seconds
        self._started_at: float | None = None

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
                f"剩余约 {_format_mmss(remaining)}。请开始收尾："
                "最多再问一个关键问题作为本场面试的最后一题，不要再展开新话题；"
                "听完候选人的回答后，自然地向其告别并调用 end_call 结束面试。"
            )
        else:
            hint = (
                f"[计时提示] 面试已进行 {_format_mmss(elapsed)}，"
                f"剩余 {_format_mmss(remaining)}。请合理分配剩余时间。"
            )
        turn_ctx.add_message(role="system", content=hint)

    async def on_enter(self):
        await self.session.generate_reply(
            instructions=f'用候选人的名字"{self._candidate_name}"打招呼，简短介绍你是今天"{self._target_role}"岗位的面试官，告知面试即将开始，准备好了就确认开始。语气友好专业，一两句话即可。',
        )

    async def stt_node(
        self,
        audio: AsyncIterable[rtc.AudioFrame],
        model_settings: ModelSettings,
    ) -> AsyncIterable[stt.SpeechEvent] | None:
        async def _filter():
            async for event in Agent.default.stt_node(self, audio, model_settings):
                if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                    text = (
                        event.alternatives[0].text.strip() if event.alternatives else ""
                    )
                    if not text or _NOISE_PATTERN.match(text):
                        logger.debug("filtered noise transcript: %r", text)
                        continue
                yield event

        return _filter()
