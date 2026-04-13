import json
import logging
import os
import re
import time
from collections.abc import AsyncIterable
from typing import Optional

import httpx
import openai as openai_sdk
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    ModelSettings,
    cli,
    room_io,
    stt,
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

load_dotenv()


def build_instructions(interview_context: dict) -> str:
    candidate_name = interview_context.get("candidate_name", "候选人")
    target_role = interview_context.get("target_role", "未指定岗位")
    candidate_profile = interview_context.get("candidate_profile", {})
    interview_questions = interview_context.get("interview_questions", [])

    skills = candidate_profile.get("skills", [])
    skills_text = "、".join(skills) if skills else "未提供"

    work_experiences = candidate_profile.get("workExperiences", [])
    experience_text = ""
    for exp in work_experiences:
        experience_text += f"\n  - {exp.get('company', '')}｜{exp.get('role', '')}（{exp.get('period', '')}）：{exp.get('summary', '')}"
    if not experience_text:
        experience_text = "\n  未提供"

    questions_text = ""
    for q in interview_questions:
        questions_text += f"\n  {q.get('order', '')}. [{q.get('difficulty', '')}] {q.get('question', '')}"
    if not questions_text:
        questions_text = "\n  未提供"

    return f"""你是一位专业的AI面试官，负责公司的招聘工作。你通过语音与候选人交流。
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
8. 所有题目问完后，或候选人要求结束面试时，调用 end_call 工具结束面试。"""


class InterviewAgent(Agent):
    def __init__(self, interview_context: dict) -> None:
        end_call_tool = EndCallTool(
            extra_description="当面试结束、候选人要求结束、候选人连续三次答非所问、或候选人态度恶劣时，调用此工具结束面试。",
            delete_room=True,
            end_instructions="感谢候选人参加本次面试，祝你一切顺利。",
        )

        super().__init__(
            instructions=build_instructions(interview_context),
            tools=end_call_tool.tools,  # type: ignore
        )

        self._candidate_name = interview_context.get("candidate_name", "候选人")
        self._target_role = interview_context.get("target_role", "未指定岗位")

    async def on_enter(self):
        await self.session.generate_reply(
            instructions=f'用候选人的名字"{self._candidate_name}"打招呼，简短介绍你是今天"{self._target_role}"岗位的面试官，告知面试即将开始。语气友好专业，一两句话即可。',
        )

    async def stt_node(
        self,
        audio: AsyncIterable[rtc.AudioFrame],
        model_settings: ModelSettings,
    ) -> Optional[AsyncIterable[stt.SpeechEvent]]:
        # Filter out noise/filler words from STT output
        noise_pattern = re.compile(
            r"^[\s，。、？！,.?!]*"
            r"(嗯+|哦+|啊+|呃+|唔+|哎+|噢+|嘶+|哼+|呵+|额+|emmm*|hmm*|uh+|um+|oh+|ah+)"
            r"[\s，。、？！,.?!]*$",
            re.IGNORECASE,
        )

        async def _filter():
            async for event in Agent.default.stt_node(self, audio, model_settings):
                if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                    text = (
                        event.alternatives[0].text.strip() if event.alternatives else ""
                    )
                    if not text or noise_pattern.match(text):
                        logger.debug("filtered noise transcript: %r", text)
                        continue
                yield event

        return _filter()


# ---------------------------------------------------------------------------
# Report generation helpers
# ---------------------------------------------------------------------------

SUMMARY_PROMPT = """你是一位面试报告撰写助手。请根据以下面试对话记录，用中文撰写一段 200-300 字的面试摘要。
摘要需包括：面试涉及的主要话题、候选人的整体表现、值得关注的亮点或不足。

## 面试对话记录
{transcript}"""

EVALUATION_PROMPT = """你是一位专业的面试评估专家。请根据以下面试对话记录和面试题目，对候选人的表现进行结构化评估。

## 面试题目
{questions}

## 面试对话记录
{transcript}

请严格按照以下 JSON 格式输出评估结果，不要输出任何其他内容：
{{
  "questions": [
    {{
      "order": 1,
      "question": "题目内容",
      "score": 7,
      "maxScore": 10,
      "assessment": "对候选人该题回答的评价"
    }}
  ],
  "overallScore": 72,
  "overallAssessment": "候选人整体表现的综合评价，2-3句话",
  "recommendation": "建议进入下一轮 / 不建议进入下一轮 / 待定"
}}

注意：
- 只评估面试中实际提问到的题目
- score 范围 0-10，overallScore 范围 0-100
- 评价要客观具体，引用候选人的实际回答"""


def _format_transcript(turns: list[dict]) -> str:
    lines = []
    for t in turns:
        role = "面试官" if t["role"] == "agent" else "候选人"
        lines.append(f"{role}: {t['message']}")
    return "\n".join(lines)


def _format_questions(questions: list[dict]) -> str:
    lines = []
    for q in questions:
        lines.append(
            f"{q.get('order', '')}. [{q.get('difficulty', '')}] {q.get('question', '')}"
        )
    return "\n".join(lines)


async def generate_report(
    turns: list[dict],
    interview_questions: list[dict],
) -> tuple[str | None, dict]:
    """Generate transcript summary and evaluation using LLM.

    Returns (summary, evaluation_dict). On failure returns (None, {}).
    """
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    if not api_key or not turns:
        return None, {}

    transcript_text = _format_transcript(turns)
    questions_text = _format_questions(interview_questions)

    client = openai_sdk.AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
    )

    summary: str | None = None
    evaluation: dict = {}

    # Generate summary
    try:
        summary_resp = await client.chat.completions.create(
            model="qwen-turbo-latest",
            messages=[
                {
                    "role": "user",
                    "content": SUMMARY_PROMPT.format(transcript=transcript_text),
                }
            ],
            extra_body={"enable_thinking": False},
        )
        summary = summary_resp.choices[0].message.content
    except Exception:
        logger.exception("failed to generate transcript summary")

    # Generate evaluation
    try:
        eval_resp = await client.chat.completions.create(
            model="qwen-turbo-latest",
            messages=[
                {
                    "role": "user",
                    "content": EVALUATION_PROMPT.format(
                        questions=questions_text,
                        transcript=transcript_text,
                    ),
                }
            ],
            extra_body={"enable_thinking": False},
        )
        eval_text = eval_resp.choices[0].message.content or ""
        # Extract JSON from response (may have markdown code fences)
        json_match = re.search(r"\{[\s\S]*\}", eval_text)
        if json_match:
            evaluation = json.loads(json_match.group())
    except Exception:
        logger.exception("failed to generate evaluation")

    return summary, evaluation


async def send_report(
    interview_context: dict,
    room_name: str,
    turns: list[dict],
    summary: str | None,
    evaluation: dict,
    call_successful: str,
    started_at: float,
    ended_at: float,
    close_reason: str,
) -> None:
    """POST the interview report to the backend API."""
    base_url = os.environ.get("CALLBACK_BASE_URL")
    secret = os.environ.get("AGENT_CALLBACK_SECRET")

    if not base_url:
        logger.warning("CALLBACK_BASE_URL not set, skipping report")
        return

    payload = {
        "conversationId": room_name,
        "interviewRecordId": interview_context.get("interview_record_id", ""),
        "scheduleEntryId": interview_context.get("round_id", ""),
        "agentId": "giaogiao",
        "status": "done",
        "callSuccessful": call_successful,
        "transcript": turns,
        "transcriptSummary": summary,
        "evaluationCriteriaResults": evaluation,
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started_at)),
        "endedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ended_at)),
        "metadata": {
            "roomName": room_name,
            "closeReason": close_reason,
        },
    }

    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Agent-Secret"] = secret

    url = f"{base_url.rstrip('/')}/api/agent/report"

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code < 300:
                    logger.info("report sent successfully: %s", resp.json())
                    return
                logger.error("report API returned %d: %s", resp.status_code, resp.text)
        except Exception:
            logger.exception("failed to send report (attempt %d)", attempt + 1)

        if attempt == 0:
            import asyncio

            await asyncio.sleep(2)

    logger.error(
        "report send failed after retries, payload: %s",
        json.dumps(payload, ensure_ascii=False)[:2000],
    )


# ---------------------------------------------------------------------------
# Agent server setup
# ---------------------------------------------------------------------------

server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load(
        activation_threshold=0.75,
        min_speech_duration=0.3,
        min_silence_duration=0.8,
    )


server.setup_fnc = prewarm


@server.rtc_session(agent_name="giaogiao")
async def my_agent(ctx: JobContext):
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    session = AgentSession(
        # Speech-to-text (STT) - ElevenLabs Scribe v2 with server-side VAD
        stt=elevenlabs.STT(
            model_id="scribe_v2",
            language_code="zh",
            tag_audio_events=False,
            server_vad={
                "vad_threshold": 0.6,
                "min_speech_duration_ms": 300,
                "min_silence_duration_ms": 2000,
                "vad_silence_threshold_secs": 1.5,
            },
        ),
        # Large Language Model (LLM) - Qwen via DashScope (OpenAI-compatible)
        llm=openai.LLM(
            model="qwen-turbo-latest",
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key=os.environ.get("DASHSCOPE_API_KEY"),  # type: ignore
            extra_body={"enable_thinking": False},
        ),
        # Text-to-speech (TTS) - MiniMax China
        tts=minimax.TTS(
            base_url="https://api.minimax.chat",
            voice="voice_agent_Male_Phone_1",
        ),
        # VAD and turn detection
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
        # Interruption handling - adaptive mode filters backchanneling & noise
        turn_handling={
            "interruption": {
                "mode": "adaptive",
                "min_duration": 0.8,
                "min_words": 2,
                "false_interruption_timeout": 2.0,
                "resume_false_interruption": True,
            },
        },
    )

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

    # ---------------------------------------------------------------------------
    # Conversation tracking
    # ---------------------------------------------------------------------------
    collected_turns: list[dict] = []
    session_start_time = time.time()

    @session.on("conversation_item_added")
    def _on_conversation_item(event):
        from livekit.agents.voice.events import ChatMessage as VoiceChatMessage

        item = event.item
        if not isinstance(item, VoiceChatMessage):
            return

        text = item.text_content
        if not text or not text.strip():
            return

        role_str = item.role
        # Map SDK roles to our schema
        if role_str == "assistant":
            role_str = "agent"
        elif role_str != "user":
            return  # skip system/developer messages

        elapsed = max(0, item.created_at - session_start_time)
        collected_turns.append(
            {
                "role": role_str,
                "message": text.strip(),
                "timeInCallSecs": round(elapsed),
            }
        )
        logger.debug("turn collected: %s (%.0fs)", role_str, elapsed)

    # Store close event info so the shutdown callback can use it
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

        # Generate report (summary + evaluation) via LLM
        interview_questions = interview_context.get("interview_questions", [])
        summary, evaluation = await generate_report(
            collected_turns, interview_questions
        )

        # Send report to backend
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

    # Start the session
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

    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
