import json
import logging
import os
import time

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    AgentServer,
    AgentSession,
    ChatMessage,
    JobContext,
    JobProcess,
    cli,
    room_io,
)
from livekit.plugins import (
    # ai_coustics,  # LiveKit Cloud only, disabled for self-hosted
    elevenlabs,
    minimax,
    # noise_cancellation,  # LiveKit Cloud only, disabled for self-hosted
    openai,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from interview_agent import InterviewAgent
from prompts import pick_interviewer
from report import generate_report, send_report

logger = logging.getLogger("agent")

load_dotenv()


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load(
        activation_threshold=0.6,
        min_speech_duration=0.3,
        min_silence_duration=0.55,
    )


server.setup_fnc = prewarm


@server.rtc_session(agent_name="giaogiao")
async def my_agent(ctx: JobContext):
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Wait for the candidate to join first so we can pick up dynamic
    # configuration (TTS voice, interviewer/JD prompts) from metadata
    # before constructing AgentSession.
    participant = await ctx.wait_for_participant()
    interview_context: dict = {}
    if participant.metadata:
        try:
            interview_context = json.loads(participant.metadata)
            logger.info(
                "loaded interview context for %s",
                interview_context.get("candidate_name", "unknown"),
            )
        except json.JSONDecodeError:
            logger.warning("failed to parse participant metadata")

    selected_interviewer = pick_interviewer(interview_context)
    selected_voice = selected_interviewer.get("voice") or "voice_agent_Male_Phone_1"
    if selected_interviewer:
        logger.info(
            "selected interviewer: %s (voice=%s)",
            selected_interviewer.get("name", "?"),
            selected_voice,
        )

    session = AgentSession(
        stt=elevenlabs.STT(
            model_id="scribe_v2",
            language_code="zh",
            tag_audio_events=False,
        ),
        llm=openai.LLM(
            model="qwen-turbo-latest",
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key=os.environ.get("DASHSCOPE_API_KEY"),  # type: ignore
            extra_body={"enable_thinking": False},
        ),
        tts=minimax.TTS(
            base_url="https://api.minimax.chat",
            voice=selected_voice,
        ),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
        turn_handling={
            "turn_detection": MultilingualModel(),
            "endpointing": {
                "mode": "dynamic",
                "min_delay": 0.5,
                "max_delay": 3.0,
            },
            "interruption": {
                "mode": "adaptive",
                "min_duration": 0.8,
                "min_words": 1,
                "false_interruption_timeout": 2.0,
                "resume_false_interruption": True,
            },
        },
    )

    collected_turns: list[dict] = []
    session_start_time = time.time()

    @session.on("conversation_item_added")
    def _on_conversation_item(event):
        item = event.item
        if not isinstance(item, ChatMessage):
            return

        text = item.text_content
        if not text or not text.strip():
            return

        role_str = item.role
        if role_str == "assistant":
            role_str = "agent"
        elif role_str != "user":
            return

        elapsed = max(0, item.created_at - session_start_time)
        collected_turns.append(
            {
                "role": role_str,
                "message": text.strip(),
                "timeInCallSecs": round(elapsed),
            }
        )
        logger.debug("turn collected: %s (%.0fs)", role_str, elapsed)

    close_info: dict = {}

    @session.on("close")
    def _on_close(event):
        close_info["ended_at"] = time.time()
        close_info["reason_value"] = event.reason.value if event.reason else "unknown"
        close_info["reason_name"] = event.reason.name if event.reason else "UNKNOWN"
        logger.info(
            "session closed: reason=%s, turns=%d",
            close_info["reason_value"],
            len(collected_turns),
        )

    # Use shutdown callback to guarantee report is sent before process exits.
    # Unlike the close event handler, shutdown callbacks are awaited by the
    # framework before the job process terminates.
    async def _on_shutdown():
        ended_at = close_info.get("ended_at", time.time())
        close_reason = close_info.get("reason_value", "unknown")
        reason_name = close_info.get("reason_name", "UNKNOWN")

        # Align with ElevenLabs convention: "success" / "failed"
        if reason_name in (
            "TASK_COMPLETED",
            "USER_INITIATED",
            "PARTICIPANT_DISCONNECTED",
        ):
            call_successful = "success"
        else:
            call_successful = "failed"

        interview_questions = interview_context.get("interview_questions", [])
        summary, evaluation = await generate_report(
            collected_turns, interview_questions
        )

        await send_report(
            interview_context=interview_context,
            room_name=ctx.room.name,
            turns=collected_turns,
            summary=summary,
            evaluation=evaluation,
            call_successful=call_successful,
            started_at=session_start_time,
            ended_at=ended_at,
            close_reason=close_reason,
        )

    ctx.add_shutdown_callback(_on_shutdown)

    await session.start(
        agent=InterviewAgent(interview_context, selected_interviewer),
        room=ctx.room,
        # LiveKit Cloud only, disabled for self-hosted
        # room_options=room_io.RoomOptions(
        #     audio_input=room_io.AudioInputOptions(
        #         noise_cancellation=lambda params: (
        #             noise_cancellation.BVCTelephony()
        #             if params.participant.kind
        #             == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
        #             else ai_coustics.audio_enhancement(
        #                 model=ai_coustics.EnhancerModel.QUAIL_VF_L,
        #                 model_parameters=ai_coustics.ModelParameters(
        #                     enhancement_level=0.7,
        #                 ),
        #             )
        #         ),
        #     ),
        # ),
    )

    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
