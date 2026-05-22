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

from interview_agent import INTERVIEW_FINAL_WRAP_SECONDS, InterviewAgent
from prompts import pick_interviewer
from recording import (
    start_room_recording,
    stop_recording,
)
from report import send_report
from transcript_replay import replay_turns_to

logger = logging.getLogger("agent")

load_dotenv()


# 本地 dev 时设置 INTERVIEW_DISABLE_NOISE_CANCELLATION=1 关掉噪声抑制. 默认
# ai_coustics QUAIL_VF_L 需要 LiveKit Cloud 在 dispatch 时下发凭证, 本地直连
# 跑 `uv run src/agent.py dev` 拿不到这段凭证, 插件会对每一帧音频报错
# "Missing configuration", 每 5s 一次, 把日志刷得很厉害. 关掉之后只是不做
# 语音隔离, 不影响对话流程, 也不影响时间线调试.
# Set INTERVIEW_DISABLE_NOISE_CANCELLATION=1 locally to silence the ai_coustics
# "Missing configuration" log spam. The Cloud-only credential push that ai_coustics
# relies on doesn't reach standalone dev runs, so the plugin logs an error per
# audio frame. Disabling it just turns voice isolation off — call flow itself is
# unaffected.
_DISABLE_NOISE_CANCELLATION = os.environ.get(
    "INTERVIEW_DISABLE_NOISE_CANCELLATION", ""
).lower() in ("1", "true", "yes", "on")


server = AgentServer()


def prewarm(proc: JobProcess):
    # Silero VAD: 回归官方默认值 (除 min_silence_duration 保留 1.5s).
    # 之前 activation_threshold=0.7 / min_speech_duration=0.25 / prefix_padding=0.3
    # 偏保守, 会漏抓候选人轻声"嗯/呃"等填充音 → STT 拿不到对应文本 → turn
    # detector 看到的句子貌似"已说完" → 用 min_delay=0.5s 立即回, 抢答风险高;
    # 反向上长 user turn 也跟这条相关 (filler 被 VAD 吞了, 句子断成多段累积).
    # min_silence_duration 保持 1.5s: 与 turn detector + max_delay=5s 的兜底
    # 协同, 1.5s 是给真实思考停顿的最小窗口, 短于这个值会让正常停顿被切碎.
    # Revert Silero VAD to official defaults except min_silence_duration. The
    # previous strict thresholds dropped soft fillers ("嗯/呃") from STT, so the
    # turn detector saw deceptively "complete" text and either responded too
    # fast (min_delay) or chained broken sentences into long user turns. Keep
    # min_silence at 1.5s to give real think-pauses room before VAD ends speech.
    proc.userdata["vad"] = silero.VAD.load(
        activation_threshold=0.5,
        min_speech_duration=0.05,
        min_silence_duration=1.5,
        prefix_padding_duration=0.5,
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

    eager_stop_task: asyncio.Task | None = state.get("_eager_stop_task")

    async def _stop_recording_best_effort() -> None:
        # 优先 await close listener 里启起来的 eager stop task: 它在 close
        # 事件触发瞬间就发 stop_egress, 通常 _on_session_end 跑到这里时已经
        # 完成. 如果还没完成就显式 await, 让 LiveKit Agents 框架的
        # session_end_timeout (默认 5 min) 兜底等它结束, 而不是 fire-and-forget
        # 让 worker 退出时被 cancel — 后者会让某些极端 case 下 egress 没停成,
        # 录像继续录直到 LiveKit 服务端自身超时.
        # Prefer awaiting the eager-stop task fired from the close listener.
        # By the time _on_session_end runs it's usually done; await it
        # explicitly so the framework's session_end_timeout (5min default)
        # covers any slow LiveKit egress API. Fire-and-forget would let the
        # worker exit mid-request and leave egress running until LiveKit's
        # own server-side timeout reaps it.
        if eager_stop_task is not None:
            try:
                await eager_stop_task
            except Exception:
                logger.exception("eager stop_recording task raised")
            return
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
        preemptive_generation=False,
        turn_handling={
            "turn_detection": MultilingualModel(),
            "endpointing": {
                "mode": "dynamic",
                "min_delay": 0.5,
                # 单轮 EOT 最长等 5s. 之前 8s 在结合候选人大量"嗯/呃"的破碎
                # 表达时, 会把一连串中途停顿累积成几分钟不关闭的 user turn,
                # 期间 agent 完全沉默, 体感像模型卡死. 5s 已经足够等正常
                # 思考停顿, 同时把"破碎表达"切成多个短 turn, 让 agent 能
                # 及时回应或追问.
                # Cap per-turn EOT wait at 5s. Previously 8s would chain a
                # candidate's filler-heavy pauses into multi-minute user
                # turns where the agent stays silent — looking like a stuck
                # model. 5s still tolerates a normal think pause and breaks
                # filler-heavy speech into short turns the agent can react
                # to in time.
                "max_delay": 5.0,
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
    # 18:30 主动收尾定时器: 软提示走 on_user_turn_completed, 但只在用户说话
    # 时触发. 候选人沉默或 turn detector 把长 user turn 一直挂着时, 该提示
    # 永远到不了模型, 模型不会调 enter_wrap_up. 这里独立计时, 时间到点强制
    # 让 agent 开口提示收尾.
    # Active wind-down trigger at 18:30 (INTERVIEW_FINAL_WRAP_SECONDS). The
    # soft hint in on_user_turn_completed only fires on user turns; a silent
    # candidate or a long stuck user turn means the hint never reaches the
    # model. This independent timer forces the agent to vocalize the cue.
    final_wrap_task: asyncio.Task | None = None
    # 热重连宽限期任务: 候选人断连后等候同 identity 在 3 分钟内重连.
    # Hot-reconnect grace task: wait up to 3 min for the same identity to rejoin.
    grace_task: asyncio.Task | None = None
    # 保证 _finalize_via_shutdown 只执行一次. 多个并发兜底路径 (硬切定时器 /
    # grace 到期 / _on_close 中的 eager 路径) 可能同时落地, 重复 ctx.shutdown
    # 会抛错; 用 flag + state["close_reason"] 双重判定.
    # Idempotency guard for _finalize_via_shutdown: hard cutoff timer, grace
    # expiry, and close-event paths can race; ctx.shutdown is not safe to call
    # twice. Combined with state["close_reason"] for cross-path coordination.
    shutdown_initiated = False
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
        if final_wrap_task is not None and not final_wrap_task.done():
            final_wrap_task.cancel()
        # 防止 grace 任务在 session 已关闭后仍跑完触发重复 aclose。
        # Prevent the grace task from running after the session is already closed.
        if grace_task is not None and not grace_task.done():
            grace_task.cancel()
        # 主动 stop egress: close 事件之后框架还要等 session_host 内部 aclose,
        # 期间 _on_session_end 不会被调用, 录像继续录空房间. 实测可拖 12 分钟+.
        # 这里立刻起一个后台任务把 egress 停掉, _on_session_end 那次再调
        # stop_recording 时 list_egress 回退路径会直接拿到 ended 状态, 不重复请求.
        # Eager stop_egress: between this close event and _on_session_end the
        # framework still awaits internal session_host aclose, during which
        # recording keeps rolling against an empty room (observed: 12+ min).
        # Fire stop_recording now; the later _on_session_end call falls back to
        # list_egress because stop_egress will already report "ended".
        if recording_info:

            async def _eager_stop_recording():
                try:
                    await stop_recording(lkapi, recording_info["egressId"])
                    logger.info("eager stop_recording dispatched from close listener")
                except Exception:
                    logger.exception("eager stop_recording from close listener failed")

            # Hold the reference on state to avoid RUF006 garbage-collection.
            state["_eager_stop_task"] = asyncio.create_task(_eager_stop_recording())

    interview_agent = InterviewAgent(interview_context, selected_interviewer)

    await session.start(
        agent=interview_agent,
        room=ctx.room,
        # LiveKit Cloud only, disabled for self-hosted
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                # 选择器: SIP 路径用窄带优化的 Krisp BVCTelephony, WebRTC 路径
                # 用 ai_coustics QUAIL_VF_L (顶配语音隔离). 本地 dev 拿不到
                # Cloud 凭证下发, 走 _DISABLE_NOISE_CANCELLATION 关掉避免日志
                # 刷屏 (插件源码 plugin.py:117-119 会逐帧报 "Missing configuration").
                # Selector: SIP participants get telephony-tuned Krisp; WebRTC
                # participants get ai_coustics QUAIL_VF_L for voice isolation.
                # Local dev doesn't receive the Cloud credential push, so flip
                # _DISABLE_NOISE_CANCELLATION to None it out and avoid the
                # per-frame "Missing configuration" log spam from plugin.py:117.
                noise_cancellation=(
                    None
                    if _DISABLE_NOISE_CANCELLATION
                    else (
                        lambda params: (
                            noise_cancellation.BVCTelephony()
                            if params.participant.kind
                            == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                            else ai_coustics.audio_enhancement(
                                model=ai_coustics.EnhancerModel.QUAIL_VF_L,
                                model_parameters=ai_coustics.ModelParameters(
                                    enhancement_level=0.7,
                                ),
                            )
                        )
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

    async def _finalize_via_shutdown(reason: str) -> None:
        """走 LiveKit 框架完整 shutdown 序列, 让前端正确退出 + 触发 on_session_end.

        复刻 EndCallTool 的关闭顺序 (end_call.py:111-129):
          1) session.shutdown() 触发 graceful drain
          2) 注册 delete_room 为 shutdown 回调, 在框架 lifecycle 末尾执行
          3) ctx.shutdown(reason) 解锁 worker 的 _shutdown_fut, 进入官方关闭流程

        所有兜底路径 (硬切定时器 / grace 到期) 都走这条, 否则裸 session.aclose()
        无法触发 on_session_end → send_report 不会发 → 录像不会停 → 前端卡在
        "面试中".

        Mirror EndCallTool's shutdown sequence so all fallback paths exit
        cleanly. Calling session.aclose() alone skips the worker shutdown_fut,
        which means on_session_end never fires and the frontend never sees the
        end-of-call signal.
        """
        nonlocal shutdown_initiated
        if shutdown_initiated:
            logger.debug("_finalize_via_shutdown skipped (already initiated)")
            return
        shutdown_initiated = True

        async def _delete_room_on_shutdown() -> None:
            logger.info("deleting room (finalize shutdown callback, reason=%s)", reason)
            try:
                await ctx.delete_room()
            except Exception:
                logger.exception("delete_room in shutdown callback failed")

        ctx.add_shutdown_callback(_delete_room_on_shutdown)
        try:
            session.shutdown()
        except Exception:
            logger.exception("session.shutdown() in _finalize_via_shutdown failed")
        try:
            ctx.shutdown(reason=reason)
        except Exception:
            logger.exception("ctx.shutdown() in _finalize_via_shutdown failed")

    async def _enforce_time_limit():
        try:
            await asyncio.sleep(time_limit + hard_grace)
            # 防 race: close 事件可能在 sleep 即将返回的同一 tick 已经触发,
            # _on_close 也会 cancel 本 task, 但若调度顺序让 cancel 慢一步,
            # 还是会进入下面的 interrupt / shutdown 流程, 对已关闭的 session
            # 重复操作会抛 / log 噪音. 提前回收.
            # Race guard: a close event landing on the same tick the sleep
            # returns may not cancel this task before we proceed. Bail out
            # if the session has already entered close to avoid duplicate
            # interrupt + ctx.shutdown calls.
            if state.get("close_reason") is not None or shutdown_initiated:
                logger.info(
                    "time-limit timer fired but session already closing; skipping"
                )
                return
            logger.warning("interview exceeded time limit; forcing shutdown")
            # 1) 先打断任何正在播放的 agent 语音, 并清空当前 user turn 缓冲.
            #    候选人可能仍在断续说话占着 pipeline, 不抢占的话 generate_reply
            #    会被 enqueue 到下一个 turn, 实测可能导致告别词永远不被播放.
            # 1) Pre-empt the pipeline: interrupt any agent speech in flight
            #    and abandon any in-progress user turn buffer. Without this,
            #    generate_reply gets queued behind an open user turn and the
            #    goodbye can stall until session aclose forcibly stops it.
            try:
                session.interrupt()
            except Exception:
                logger.exception("session.interrupt() before timeout reply failed")
            try:
                session.clear_user_turn()
            except Exception:
                logger.exception(
                    "session.clear_user_turn() before timeout reply failed"
                )

            try:
                # 不走 generate_reply: instructions 会被注入 role="system",
                # 在压缩时间线 + 多个 system overlay 叠加下, fast LLM 容易角色
                # 错乱回成候选人. 这里直接 session.say 播固定告别词, 绕过 LLM,
                # 杜绝角色漂移. add_to_chat_ctx 默认 True, 历史里会留下这段
                # assistant 消息以备转录归档.
                #
                # 注意: 不能直接拼 interview_agent.closing_instructions, 那是
                # 给 LLM 看的"指令文本"(常以"对候选人说:"开头), 字面 TTS 会
                # 把这种指令前缀一起念出来. 固定字面话术覆盖所有场景.
                # Bypass generate_reply: its instructions land as role="system"
                # and a fast LLM in a compressed timeline with multiple system
                # overlays sometimes drifts into the candidate role. say()
                # speaks literal text via TTS — no LLM call, no role drift.
                # We can't reuse closing_instructions verbatim: it's authored
                # as an LLM directive (e.g. "对候选人说: ...") so a literal
                # TTS read of it would speak the directive prefix out loud.
                handle = session.say(
                    "非常感谢你今天的分享。因为时间关系，本场面试到此结束。"
                    "我们会综合评估你的表现并尽快反馈结果，祝你一切顺利。",
                    allow_interruptions=False,
                )
                # 2) 给 TTS 一个有限窗口播完告别词. 卡住超时就直接进入
                #    session.aclose, 避免 wait_for_playout 永久阻塞导致
                #    aclose 永远不被调用, 进而连带录像无法及时停止.
                # 2) Bound playout: a hung TTS must not block session.aclose
                #    forever — that previously left the recording running for
                #    minutes after the call should have ended.
                await asyncio.wait_for(handle.wait_for_playout(), timeout=20.0)
            except asyncio.TimeoutError:
                logger.warning(
                    "timeout final-reply playout exceeded 20s; closing anyway"
                )
            except Exception:
                logger.exception("timeout final-reply failed")

            await _finalize_via_shutdown(reason="task_completed")
        except asyncio.CancelledError:
            pass

    timeout_task = asyncio.create_task(_enforce_time_limit())

    async def _force_wind_down():
        try:
            await asyncio.sleep(INTERVIEW_FINAL_WRAP_SECONDS)
            # 模型已经自己进入收尾流程 -> 不抢话, 直接退出.
            # Model already entered wrap-up on its own — let it run.
            if interview_agent.wrap_up_started:
                return
            # 同 _enforce_time_limit 的 race guard: session 已开始关闭就别再
            # 念收尾词, 避免对已 drain 的 session 调 interrupt.
            # Race guard: skip the cue if the session is already winding down.
            if state.get("close_reason") is not None or shutdown_initiated:
                logger.info(
                    "wind-down timer fired but session already closing; skipping"
                )
                return
            logger.info("forcing wind-down cue at final wrap time")
            try:
                session.interrupt()
            except Exception:
                logger.exception("session.interrupt() before wind-down cue failed")
            try:
                session.clear_user_turn()
            except Exception:
                logger.exception(
                    "session.clear_user_turn() before wind-down cue failed"
                )
            try:
                # 同 _enforce_time_limit: 不让 LLM 自由发挥, 避免 fast 模型在
                # 压缩时间线下角色错乱回成候选人. 这里说一句固定提醒, 候选人
                # 听到后再回话, 下一轮 on_user_turn_completed 会注入正式收尾
                # 提示让模型自己调 enter_wrap_up.
                # Bypass LLM: speak a literal cue. The next user turn will
                # trigger on_user_turn_completed which injects the formal
                # wind-down hint so the model can call enter_wrap_up itself.
                handle = session.say(
                    "时间快到了，咱们准备进入收尾环节，请简单回答一下当前问题。",
                    allow_interruptions=True,
                )
                await asyncio.wait_for(handle.wait_for_playout(), timeout=15.0)
            except asyncio.TimeoutError:
                logger.warning("wind-down cue playout exceeded 15s")
            except Exception:
                logger.exception("wind-down cue failed")
        except asyncio.CancelledError:
            pass

    final_wrap_task = asyncio.create_task(_force_wind_down())

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
            # 防 race: 候选人恰好在 grace 到点同 tick 重连, _on_participant_connected
            # 已经 cancel 本 task, 但调度顺序不保证; 显式确认 session 未在关闭.
            # Race guard: a reconnect landing on the same tick may not cancel
            # us in time. Skip if the session has already started closing.
            if state.get("close_reason") is not None or shutdown_initiated:
                logger.info(
                    "grace timer expired for %s but session already closing; skipping",
                    candidate_identity,
                )
                return
            logger.info(
                "hot-reconnect grace expired for %s; finalising via framework shutdown",
                candidate_identity,
            )
            # 走完整 shutdown 序列, 不再用裸 session.aclose():
            #   - aclose 不会触发 worker shutdown_fut → on_session_end 不跑
            #     → send_report 不发 → 前端永远收不到结束信号 (即使前端早已断开,
            #     web 端 round status 也回填不到 completed).
            # Use the full shutdown sequence instead of bare session.aclose() so
            # on_session_end fires, send_report posts to /api/agent/report, and
            # the web-side round is finalised to "completed".
            await _finalize_via_shutdown(reason="participant_disconnected")
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
