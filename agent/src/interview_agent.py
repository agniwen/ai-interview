import logging
import re
from collections.abc import AsyncIterable

from livekit import rtc
from livekit.agents import Agent, ModelSettings, stt
from livekit.agents.beta.tools import EndCallTool

from prompts import build_instructions

logger = logging.getLogger("agent")


_NOISE_PATTERN = re.compile(
    r"^[\s，。、？！,.?!]*"
    r"(嗯+|哦+|啊+|呃+|唔+|哎+|噢+|嘶+|哼+|呵+|额+|emmm*|hmm*|uh+|um+|oh+|ah+)"
    r"[\s，。、？！,.?!]*$",
    re.IGNORECASE,
)


class InterviewAgent(Agent):
    def __init__(
        self, interview_context: dict, interviewer: dict | None = None
    ) -> None:
        end_call_tool = EndCallTool(
            extra_description="当面试结束、候选人要求结束、候选人连续三次答非所问、或候选人态度恶劣时，调用此工具结束面试。",
            delete_room=True,
            end_instructions="感谢候选人参加本次面试，祝你一切顺利。",
        )

        super().__init__(
            instructions=build_instructions(interview_context, interviewer),
            tools=end_call_tool.tools,  # type: ignore
        )

        self._candidate_name = interview_context.get("candidate_name", "候选人")
        self._target_role = interview_context.get("target_role", "未指定岗位")

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
