import json
import logging
import os

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    room_io,
)
from livekit.agents.beta.tools import EndCallTool
from livekit.plugins import (
    ai_coustics,
    elevenlabs,
    minimax,
    noise_cancellation,
    openai,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("agent")

load_dotenv(".env.local")


class InterviewAgent(Agent):
    def __init__(self, interview_context: dict) -> None:
        candidate_name = interview_context.get("candidate_name", "候选人")
        target_role = interview_context.get("target_role", "未指定岗位")
        candidate_profile = interview_context.get("candidate_profile", {})
        interview_questions = interview_context.get("interview_questions", [])

        # Format skills
        skills = candidate_profile.get("skills", [])
        skills_text = "、".join(skills) if skills else "未提供"

        # Format work experiences
        work_experiences = candidate_profile.get("workExperiences", [])
        experience_text = ""
        for exp in work_experiences:
            experience_text += f"\n  - {exp.get('company', '')}｜{exp.get('role', '')}（{exp.get('period', '')}）：{exp.get('summary', '')}"
        if not experience_text:
            experience_text = "\n  未提供"

        # Format interview questions
        questions_text = ""
        for q in interview_questions:
            questions_text += f"\n  {q.get('order', '')}. [{q.get('difficulty', '')}] {q.get('question', '')}"
        if not questions_text:
            questions_text = "\n  未提供"

        end_call_tool = EndCallTool(
            extra_description="当面试结束、候选人要求结束、候选人连续三次答非所问、或候选人态度恶劣时，调用此工具结束面试。",
            delete_room=True,
            end_instructions="感谢候选人参加本次面试，祝他一切顺利。",
        )

        super().__init__(
            instructions=f"""你是一位专业的AI面试官，负责公司的招聘工作。你通过语音与候选人交流。
你需要要求应聘者严肃对待面试，如果应聘者有不尊重面试的行为，你需要提醒他。

## 候选人信息
- 姓名：{candidate_name}
- 目标岗位：{target_role}
- 技术栈：{skills_text}
- 工作经历：{experience_text}

## 面试题目
从以下题目中，抽取三到五道题目，由简入深地提问候选人：
{questions_text}

## 面试规则
1. 面试时间控制在 10 分钟以内，合理分配每道题的时间。
2. 每次只问一个问题，等候选人回答完毕后再进行下一题。
3. 针对候选人的回答可以适当追问，深入了解细节。
4. 候选人的回答可能包含环境音或不标准的表述，不必太严苛。
5. 语言简洁专业，不使用 emoji 或特殊符号。
6. 全程使用中文交流。
7. 如果候选人连续三次答非所问，或态度恶劣不端正，提醒一次后仍不改正，直接调用 end_call 工具结束面试。
8. 所有题目问完后，或候选人要求结束面试时，调用 end_call 工具结束面试。""",
            tools=end_call_tool.tools,  # type: ignore
        )

        self._candidate_name = candidate_name
        self._target_role = target_role

    async def on_enter(self):
        await self.session.generate_reply(
            instructions=f'用候选人的名字"{self._candidate_name}"打招呼，简短介绍你是今天"{self._target_role}"岗位的面试官，告知面试即将开始。语气友好专业，一两句话即可。',
        )


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="giaogiao")
async def my_agent(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Set up a voice AI pipeline using Qwen (DashScope), MiniMax (China), ElevenLabs
    session = AgentSession(
        # Speech-to-text (STT) - ElevenLabs Scribe v2
        stt=elevenlabs.STT(model_id="scribe_v2_realtime"),
        # Large Language Model (LLM) - Qwen via DashScope (OpenAI-compatible)
        llm=openai.LLM(
            model="qwen-plus",
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key=os.environ.get("DASHSCOPE_API_KEY"),  # type: ignore
        ),
        # Text-to-speech (TTS) - MiniMax China
        tts=minimax.TTS(
            base_url="https://api.minimax.chat",
            voice="voice_agent_Male_Phone_1",
        ),
        # VAD and turn detection are used to determine when the user is speaking and when the agent should respond
        # See more at https://docs.livekit.io/agents/build/turns
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        # allow the LLM to generate a response while waiting for the end of turn
        # See more at https://docs.livekit.io/agents/build/audio/#preemptive-generation
        preemptive_generation=True,
    )

    # To use a realtime model instead of a voice pipeline, use the following session setup instead.
    # (Note: This is for the OpenAI Realtime API. For other providers, see https://docs.livekit.io/agents/models/realtime/))
    # 1. Install livekit-agents[openai]
    # 2. Set OPENAI_API_KEY in .env.local
    # 3. Add `from livekit.plugins import openai` to the top of this file
    # 4. Use the following session setup instead of the version above
    # session = AgentSession(
    #     llm=openai.realtime.RealtimeModel(voice="marin")
    # )

    # # Add a virtual avatar to the session, if desired
    # # For other providers, see https://docs.livekit.io/agents/models/avatar/
    # avatar = hedra.AvatarSession(
    #   avatar_id="...",  # See https://docs.livekit.io/agents/models/avatar/plugins/hedra
    # )
    # # Start the avatar and wait for it to join
    # await avatar.start(session, room=ctx.room)

    # Wait for the candidate to join and read interview context from participant metadata
    participant = await ctx.wait_for_participant()
    interview_context = {}
    if participant.metadata:
        try:
            interview_context = json.loads(participant.metadata)
            logger.info(
                "loaded interview context for %s",
                interview_context.get("candidate_name", "unknown"),
            )
        except json.JSONDecodeError:
            logger.warning("failed to parse participant metadata")

    # Start the session, which initializes the voice pipeline and warms up the models
    await session.start(
        agent=InterviewAgent(interview_context),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else ai_coustics.audio_enhancement(
                        model=ai_coustics.EnhancerModel.QUAIL_VF_L
                    )
                ),
            ),
        ),
    )

    # Join the room and connect to the user
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
