import asyncio
import json
import logging
import os
import time

from dotenv import load_dotenv
from livekit import api as lkapi_module
from livekit import rtc
from livekit.agents import (
    AgentServer,
    AgentSession,
    ChatMessage,
    CloseReason,
    JobContext,
    JobProcess,
    cli,
    room_io,
)
from livekit.agents import (
    metrics as lk_metrics,
)
from livekit.plugins import (
    ai_coustics,  # LiveKit Cloud only, disabled for self-hosted
    elevenlabs,
    minimax,
    noise_cancellation,  # LiveKit Cloud only, disabled for self-hosted
    openai,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from interview_agent import InterviewAgent
from prompts import pick_interviewer
from recording import (
    start_room_recording,
    stop_recording,
)
from report import send_report
from transcript_replay import replay_turns_to

logger = logging.getLogger("agent")

load_dotenv()


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load(
        activation_threshold=0.7,
        min_speech_duration=0.25,
        min_silence_duration=1.0,
        prefix_padding_duration=0.3,
    )


server.setup_fnc = prewarm


# 与 web 端 POST /api/agent/report 的 callSuccessful 字段约定:
# success / failed 用于驱动候选人侧的状态徽章. 这里只把"正常完成 / 用户主动结束 /
# 候选人离线"视为成功, 其余 (ERROR / JOB_SHUTDOWN) 都算失败.
# Contract with the web-side POST /api/agent/report: callSuccessful drives the
# candidate-facing status badge. Treat normal completion, user-initiated end,
# and participant disconnect as success; everything else (ERROR / JOB_SHUTDOWN)
# is a failure.
_SUCCESS_REASONS = frozenset(
    {
        CloseReason.TASK_COMPLETED,
        CloseReason.USER_INITIATED,
        CloseReason.PARTICIPANT_DISCONNECTED,
    }
)


async def _on_session_end(ctx: JobContext) -> None:
    """Frame: send transcript + stop egress after the voice pipeline closes.

    The framework guarantees session.history is finalized before this fires
    and gives us up to ``session_end_timeout`` (default 5 min) to complete,
    so the HTTP retry path in send_report has plenty of headroom.
    Recording stop runs concurrently and is best-effort because the
    egress_ended webhook on the web side reconciles the final status.
    """
    state: dict = ctx.primary_session.userdata
    lkapi: lkapi_module.LiveKitAPI = state["lkapi"]
    interview_context: dict = state["interview_context"]
    recording_info: dict = state.get("recording_info") or {}
    close_reason: CloseReason | None = state.get("close_reason")
    ended_at = state.get("ended_at") or time.time()

    call_successful = "success" if close_reason in _SUCCESS_REASONS else "failed"

    recording_payload: dict | None = None
    if recording_info:
        recording_payload = {
            "egressId": recording_info["egressId"],
            "fileKey": recording_info["fileKey"],
            "status": "active",
            "durationSecs": None,
        }

    async def _stop_recording_best_effort() -> None:
        if not recording_info:
            return
        try:
            await stop_recording(lkapi, recording_info["egressId"])
        except Exception:
            logger.exception("stop_recording during shutdown failed")

    await asyncio.gather(
        send_report(
            interview_context=interview_context,
            room_name=ctx.room.name,
            turns=state["turns"],
            call_successful=call_successful,
            started_at=state["started_at"],
            ended_at=ended_at,
            close_reason=close_reason.value if close_reason else "unknown",
            recording=recording_payload,
            metrics=state.get("metrics"),
        ),
        _stop_recording_best_effort(),
    )

    try:
        await lkapi.aclose()
    except Exception:
        logger.debug("lkapi.aclose failed", exc_info=True)


@server.rtc_session(agent_name="giaogiao", on_session_end=_on_session_end)
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

    # 录像: web 颁发 token 时在 metadata 里给出 recording_enabled / recording_file_key,
    # 二者都满足才尝试启动 RoomCompositeEgress; 失败不影响面试主流程.
    # Recording: web token endpoint stamps recording_enabled / recording_file_key into
    # the participant metadata. Both must be present before we try to start egress.
    lkapi = lkapi_module.LiveKitAPI()
    recording_info: dict = {}
    if interview_context.get("recording_enabled") and interview_context.get(
        "recording_file_key"
    ):
        info = await start_room_recording(
            lkapi,
            room_name=ctx.room.name,
            file_key=interview_context["recording_file_key"],
        )
        if info is not None:
            recording_info = {
                "egressId": info.egress_id,
                "fileKey": interview_context["recording_file_key"],
                "status": "active",
            }

    selected_interviewer = pick_interviewer(interview_context)
    selected_voice = selected_interviewer.get("voice") or "voice_agent_Male_Phone_1"
    if selected_interviewer:
        logger.info(
            "selected interviewer: %s (voice=%s)",
            selected_interviewer.get("name", "?"),
            selected_voice,
        )

    # 录像收尾策略: 不再阻塞 send_report 等待 stop_egress.
    # report 直接用启动时拿到的 egressId / fileKey 写 status="active",
    # 由 web 端的 LiveKit egress_ended webhook 兜底回填最终 status / durationSecs.
    # 这样即使 LiveKit Egress API 抖动或 list_egress fallback 慢, 报告也能稳定回填.
    #
    # Recording wrap-up: do NOT block send_report on stop_egress. The report
    # carries the egressId/fileKey we already have from start time with
    # status="active"; the web-side LiveKit egress_ended webhook handler is
    # responsible for backfilling the final status / durationSecs once the
    # MP4 finishes uploading. _on_session_end (top-level) uses this state.
    # metrics 聚合容器: 监听 session.metrics_collected 后逐项累加, _on_session_end
    # 直接拍扁送到 /api/agent/report. session 段为会话级总览, turns 段按 speech_id
    # 累计单轮 e2e 与各 pipeline 子段耗时, 便于后续 p50/p95 统计.
    # Metrics aggregator: filled in by the metrics_collected listener and flushed
    # to /api/agent/report at session end. `session` holds totals; `turns` keys
    # per-speech_id breakdowns (LLM ttft, TTS ttfb, EOU delays, e2e) so we can
    # later compute p50/p95 latency on the web side.
    metrics_state: dict = {
        "session": {
            "llm": {
                "request_count": 0,
                "total_completion_tokens": 0,
                "total_prompt_tokens": 0,
                "total_tokens": 0,
                "total_duration": 0.0,
                "ttft_sum": 0.0,
                "ttft_count": 0,
            },
            "stt": {
                "request_count": 0,
                "total_audio_duration": 0.0,
                "total_duration": 0.0,
            },
            "tts": {
                "request_count": 0,
                "total_audio_duration": 0.0,
                "total_characters": 0,
                "total_duration": 0.0,
                "ttfb_sum": 0.0,
                "ttfb_count": 0,
            },
            "eou": {
                "count": 0,
                "end_of_utterance_delay_sum": 0.0,
                "transcription_delay_sum": 0.0,
                "on_user_turn_completed_delay_sum": 0.0,
            },
            "interruption": {
                "num_interruptions": 0,
                "num_backchannels": 0,
                "num_requests": 0,
                "latest_detection_delay": 0.0,
            },
            "vad": {
                "total_inference_duration": 0.0,
                "total_inference_count": 0,
            },
        },
        # speech_id -> {llm_ttft, llm_duration, llm_total_tokens, tts_ttfb,
        # tts_duration, tts_characters, eou_delay, transcription_delay}
        "turns": {},
    }

    state: dict = {
        "lkapi": lkapi,
        "interview_context": interview_context,
        "recording_info": recording_info,
        "started_at": time.time(),
        "turns": [],
        "metrics": metrics_state,
        "close_reason": None,
        "ended_at": None,
    }

    session = AgentSession(
        stt=elevenlabs.STT(
            model_id="scribe_v2",
            language_code="zh",
            tag_audio_events=False,
        ),
        llm=openai.LLM(
            model=os.environ.get("DASHSCOPE_LLM_MODEL", "deepseek-v4-flash"),
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key=os.environ.get("DASHSCOPE_API_KEY"),  # type: ignore
            extra_body={"enable_thinking": False},
        ),
        tts=minimax.TTS(
            base_url="https://api.minimax.chat",
            voice=selected_voice,
        ),
        vad=ctx.proc.userdata["vad"],
        userdata=state,
        preemptive_generation=True,
        turn_handling={
            "turn_detection": MultilingualModel(),
            "endpointing": {
                "mode": "dynamic",
                "min_delay": 0.5,
                "max_delay": 4.0,
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

    timeout_task: asyncio.Task | None = None
    # 热重连宽限期任务: 候选人断连后等候同 identity 在 3 分钟内重连.
    # Hot-reconnect grace task: wait up to 3 min for the same identity to rejoin.
    grace_task: asyncio.Task | None = None
    # 重连后的 resume 任务 (重放历史 + 欢迎致辞). 保留引用避免被 GC.
    # Holds the post-reconnect resume task (replay + welcome) to keep it
    # alive — asyncio garbage-collects unreferenced tasks (RUF006).
    resume_task: asyncio.Task | None = None

    @session.on("metrics_collected")
    def _on_metrics_collected(event):
        # 每个 pipeline 插件独立 emit 一次 *Metrics, 用 isinstance 分流到对应桶.
        # speech_id 作为单轮关联键, 用来把 LLM/TTS/EOU 拼成一条轮次记录.
        # Each pipeline plugin emits its own *Metrics subclass; dispatch by
        # isinstance into the right bucket. speech_id is the join key that
        # ties LLM/TTS/EOU back to a single user turn.
        m = event.metrics
        sess_metrics = metrics_state["session"]
        turns_metrics: dict[str, dict] = metrics_state["turns"]

        def _turn_bucket(speech_id: str | None) -> dict | None:
            if not speech_id:
                return None
            bucket = turns_metrics.get(speech_id)
            if bucket is None:
                bucket = {}
                turns_metrics[speech_id] = bucket
            return bucket

        if isinstance(m, lk_metrics.LLMMetrics):
            llm = sess_metrics["llm"]
            llm["request_count"] += 1
            llm["total_completion_tokens"] += m.completion_tokens
            llm["total_prompt_tokens"] += m.prompt_tokens
            llm["total_tokens"] += m.total_tokens
            llm["total_duration"] += m.duration
            if m.ttft > 0:
                llm["ttft_sum"] += m.ttft
                llm["ttft_count"] += 1
            bucket = _turn_bucket(m.speech_id)
            if bucket is not None:
                bucket["llm_ttft"] = m.ttft
                bucket["llm_duration"] = m.duration
                bucket["llm_total_tokens"] = m.total_tokens
        elif isinstance(m, lk_metrics.STTMetrics):
            stt = sess_metrics["stt"]
            stt["request_count"] += 1
            stt["total_audio_duration"] += m.audio_duration
            stt["total_duration"] += m.duration
        elif isinstance(m, lk_metrics.TTSMetrics):
            tts = sess_metrics["tts"]
            tts["request_count"] += 1
            tts["total_audio_duration"] += m.audio_duration
            tts["total_characters"] += m.characters_count
            tts["total_duration"] += m.duration
            if m.ttfb > 0:
                tts["ttfb_sum"] += m.ttfb
                tts["ttfb_count"] += 1
            bucket = _turn_bucket(m.speech_id)
            if bucket is not None:
                bucket["tts_ttfb"] = m.ttfb
                bucket["tts_duration"] = m.duration
                bucket["tts_characters"] = m.characters_count
        elif isinstance(m, lk_metrics.EOUMetrics):
            eou = sess_metrics["eou"]
            eou["count"] += 1
            eou["end_of_utterance_delay_sum"] += m.end_of_utterance_delay
            eou["transcription_delay_sum"] += m.transcription_delay
            eou["on_user_turn_completed_delay_sum"] += m.on_user_turn_completed_delay
            bucket = _turn_bucket(m.speech_id)
            if bucket is not None:
                bucket["eou_delay"] = m.end_of_utterance_delay
                bucket["transcription_delay"] = m.transcription_delay
        elif isinstance(m, lk_metrics.InterruptionMetrics):
            # 框架按"累计"语义递增 num_*; 这里覆盖式写入, 取最新一次的累计值.
            # The framework increments num_* cumulatively, so write-through to
            # capture the latest totals rather than re-summing.
            interruption = sess_metrics["interruption"]
            interruption["num_interruptions"] = m.num_interruptions
            interruption["num_backchannels"] = m.num_backchannels
            interruption["num_requests"] = m.num_requests
            interruption["latest_detection_delay"] = m.detection_delay
        elif isinstance(m, lk_metrics.VADMetrics):
            vad = sess_metrics["vad"]
            vad["total_inference_duration"] = m.inference_duration_total
            vad["total_inference_count"] = m.inference_count

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

        elapsed = max(0, item.created_at - state["started_at"])
        state["turns"].append(
            {
                "role": role_str,
                "message": text.strip(),
                "timeInCallSecs": round(elapsed),
            }
        )
        logger.debug("turn collected: %s (%.0fs)", role_str, elapsed)

    @session.on("close")
    def _on_close(event):
        state["ended_at"] = time.time()
        state["close_reason"] = event.reason
        logger.info(
            "session closed: reason=%s, turns=%d",
            event.reason.value if event.reason else "unknown",
            len(state["turns"]),
        )
        if timeout_task is not None and not timeout_task.done():
            timeout_task.cancel()
        # 防止 grace 任务在 session 已关闭后仍跑完触发重复 aclose。
        # Prevent the grace task from running after the session is already closed.
        if grace_task is not None and not grace_task.done():
            grace_task.cancel()

    interview_agent = InterviewAgent(interview_context, selected_interviewer)

    await session.start(
        agent=interview_agent,
        room=ctx.room,
        # LiveKit Cloud only, disabled for self-hosted
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else ai_coustics.audio_enhancement(
                        model=ai_coustics.EnhancerModel.QUAIL_VF_L,
                        model_parameters=ai_coustics.ModelParameters(
                            enhancement_level=0.7,
                        ),
                    )
                ),
            ),
            # 默认 True 会让框架在 candidate 断开时自动关 session, 与我们的
            # 3 分钟热重连 grace 冲突 (grace 还没启动就被关了); 关掉让我们
            # 自己在 _on_participant_disconnected/_on_participant_connected
            # 里管理 session 生命周期.
            # Default True closes the session as soon as the candidate drops,
            # bypassing our 180s hot-reconnect grace timer. Turn it off so our
            # _on_participant_disconnected / _on_participant_connected handlers
            # own the lifecycle.
            close_on_disconnect=False,
        ),
    )

    # Anchor the elapsed-time clock on the agent so per-turn time hints align
    # with actual session start (matches state["started_at"] above).
    interview_agent.mark_started()

    # Hard timeout safety net. Per-turn instructions wind the interview down
    # gracefully (soft wrap, final wrap, then end_call near the limit). If the
    # LLM still hasn't ended after a generous grace period, force a goodbye
    # and close the session so a stuck interview can't run forever.
    time_limit = interview_agent.time_limit_seconds
    hard_grace = interview_agent.hard_grace_seconds

    async def _enforce_time_limit():
        try:
            await asyncio.sleep(time_limit + hard_grace)
            logger.warning("interview exceeded time limit; forcing shutdown")
            try:
                handle = session.generate_reply(
                    instructions=(
                        "面试时间已到。请用一两句温暖的话感谢候选人参与并体面告别，"
                        f"参考用语：{interview_agent.closing_instructions}。"
                        "然后告知面试到此结束，不要继续提问。"
                    ),
                    allow_interruptions=False,
                )
                await handle.wait_for_playout()
            except Exception:
                logger.exception("timeout final-reply failed")
            await session.aclose()
        except asyncio.CancelledError:
            pass

    timeout_task = asyncio.create_task(_enforce_time_limit())

    # 热重连: 候选人断连不再立即 aclose, 启动 3 分钟宽限计时器, 等同 identity
    # 重新加入则取消计时、继续对话; 否则计时到时再走 aclose -> shutdown 回调
    # -> /api/agent/report, 把转写落库并把轮次置为 completed.
    # Hot reconnect: do NOT immediately aclose on participant disconnect.
    # Start a 3-min grace timer; if the same identity rejoins within the
    # window, cancel the timer and resume. Otherwise fire aclose so the
    # existing shutdown -> /api/agent/report path runs and finalises the round.
    candidate_identity = participant.identity
    close_task: asyncio.Task | None = None
    grace_seconds = 180

    async def _grace_finalize():
        try:
            await asyncio.sleep(grace_seconds)
            logger.info(
                "hot-reconnect grace expired for %s; closing session",
                candidate_identity,
            )
            await session.aclose()
        except asyncio.CancelledError:
            pass

    def _on_participant_disconnected(p: rtc.RemoteParticipant):
        nonlocal grace_task
        if p.identity != candidate_identity or close_task is not None:
            return
        if grace_task is not None and not grace_task.done():
            return
        logger.info(
            "candidate %s disconnected; %ds hot-reconnect grace started",
            p.identity,
            grace_seconds,
        )
        # 立即打断进行中的 TTS, 避免对空房间继续讲话; STT 无输入即无新 LLM 调用.
        # Interrupt any ongoing TTS so we don't speak to an empty room.
        try:
            session.interrupt()
        except Exception:
            logger.exception("session.interrupt() during grace start failed")
        grace_task = asyncio.create_task(_grace_finalize())

    async def _resume_after_reconnect(target_identity: str) -> None:
        # 先重放历史再 say "欢迎回来": 前端 useSessionMessages 用首次到达时间排序,
        # 不是消息 timestamp; 如果 say 抢先, 历史会出现在欢迎气泡之后, 顺序错乱.
        # Replay BEFORE the welcome line: the frontend hook orders messages
        # by first-seen client time, not by their `timestamp` field, so any
        # history that arrives after the welcome bubble would render below
        # it and break the conversation order.
        try:
            await replay_turns_to(
                ctx.room.local_participant,
                turns=list(state["turns"]),
                target_identity=target_identity,
                agent_identity=ctx.room.local_participant.identity,
                candidate_identity=candidate_identity,
            )
        except Exception:
            logger.exception("transcript replay coroutine failed")
        # 用 session.say 直接走 TTS 念一句固定话, 不通过 LLM. 之前用
        # generate_reply(instructions=...) 让 LLM 生成致意话语, 但小模型
        # (Qwen-turbo / deepseek-v4-flash 等) 会把"候选人刚才因网络问题短暂离线"
        # 这种元指令当成是候选人在反思, 进而切换到候选人口吻 / 开始回答自己之前
        # 问的问题. add_to_chat_ctx=True 默认值会把这句加进 chat history
        # (assistant 角色), 让 LLM 知道刚刚 agent 说了"欢迎回来", 后续提问不会重复.
        # Use TTS-only say() instead of LLM-driven generate_reply: small models
        # misread the meta-instruction "the candidate dropped off" as the
        # candidate's own utterance and flip into the candidate role.
        try:
            session.say("欢迎回来，我们继续刚才的话题。", allow_interruptions=True)
        except Exception:
            logger.exception("re-greeting after reconnect failed")

    def _on_participant_connected(p: rtc.RemoteParticipant):
        nonlocal grace_task, resume_task
        if p.identity != candidate_identity or grace_task is None:
            return
        logger.info("candidate %s reconnected; cancelling grace", p.identity)
        grace_task.cancel()
        grace_task = None
        resume_task = asyncio.create_task(_resume_after_reconnect(p.identity))

    ctx.room.on("participant_disconnected", _on_participant_disconnected)
    ctx.room.on("participant_connected", _on_participant_connected)


if __name__ == "__main__":
    cli.run_app(server)
