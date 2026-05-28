"""LiveKit worker 入口: 一个 job = 一次面试.

LiveKit worker entrypoint: one job == one interview session.

执行模型 / Execution model:
  - `cli.run_app(server)` 启动 worker, 它常驻进程, 等候 LiveKit 调度新 room.
  - 每个新 room 都会 fork 一个 JobProcess; `prewarm` 在 process 启动时跑一次,
    把 VAD 这种重模型预热好放进 `proc.userdata`.
  - 之后每个 job 在该进程里调度一次 `my_agent(ctx)` 协程; ctx 是该 job 专属
    的 JobContext, 所有 nonlocal 变量都是这次面试的私有状态.
  - session 结束后框架再调度 `_on_session_end(ctx)` 做收尾上报.

  - `cli.run_app(server)` keeps the worker process alive and waits for jobs.
  - Each room forks a JobProcess; `prewarm` runs once per process to load
    heavy models (VAD) into `proc.userdata`.
  - Each job in that process invokes `my_agent(ctx)` as a coroutine; the
    JobContext is per-job, so nonlocal vars are private per interview.
  - Framework then runs `_on_session_end(ctx)` for post-close finalisation.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

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
# "Missing configuration" log spam. The Cloud-only credential push that
# ai_coustics relies on doesn't reach standalone dev runs, so the plugin logs
# an error per audio frame. Disabling it just turns voice isolation off — call
# flow itself is unaffected.
_DISABLE_NOISE_CANCELLATION = os.environ.get(
    "INTERVIEW_DISABLE_NOISE_CANCELLATION", ""
).lower() in ("1", "true", "yes", "on")


# 与 web 端 POST /api/agent/report 的 callSuccessful 字段约定:
# success / failed 用于驱动候选人侧的状态徽章. 这里只把"正常完成 / 用户主动结束
# / 候选人离线"视为成功, 其余 (ERROR / JOB_SHUTDOWN) 都算失败.
# Contract with the web-side POST /api/agent/report: callSuccessful drives the
# candidate-facing status badge. Treat normal completion, user-initiated end,
# and participant disconnect as success; everything else is a failure.
_SUCCESS_REASONS = frozenset(
    {
        CloseReason.TASK_COMPLETED,
        CloseReason.USER_INITIATED,
        CloseReason.PARTICIPANT_DISCONNECTED,
    }
)

# 热重连宽限期 (秒): 候选人短暂掉线后允许同 identity 在此窗口内重连继续面试,
# 超出则走 framework shutdown -> /api/agent/report 把轮次置为 completed.
# Hot-reconnect grace window in seconds: if the same identity rejoins within
# this window, the interview resumes; otherwise we run the full shutdown path.
_HOT_RECONNECT_GRACE_SECONDS = 180

# 兜底播放超时 (秒): _enforce_time_limit 强制告别词 / _force_wind_down 收尾提示
# 的 TTS 播放窗口. 超过就放弃等待, 直接走 shutdown, 防止 TTS 卡死时连带录像
# 一直停不掉.
# Bounded TTS playout window for the fallback cues. If TTS hangs we bail out
# instead of blocking shutdown indefinitely (which would also delay egress stop).
_TIMEOUT_REPLY_PLAYOUT_SECONDS = 20.0
_WIND_DOWN_PLAYOUT_SECONDS = 15.0


# --------------------------------------------------------------------------- #
# 数据结构 / Data structures
# --------------------------------------------------------------------------- #


def _empty_metrics_state() -> dict[str, Any]:
    """metrics 聚合容器初始结构.

    Initial structure for the metrics aggregator. session 段为会话级总览,
    turns 段按 speech_id 累计单轮 e2e 与各 pipeline 子段耗时, 便于后续 p50/p95
    统计. 形状直接被 send_report 透传到 web 端, 修改前先同步 /api/agent/report
    的 schema.
    """
    return {
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


@dataclass
class SessionState:
    """单次面试在 agent 进程内的全部可变状态.

    All mutable per-interview state held in the agent process. 之前用裸 dict
    通过 `session.userdata` 共享, 类型完全丢失, 改成 dataclass 后 IDE 能补全且
    typo 编译期就抓出来. 仍然以 `session.userdata` 形式传给 framework, 所以
    `_on_session_end` 还能拿到同一份引用.
    """

    lkapi: lkapi_module.LiveKitAPI
    interview_context: dict[str, Any]
    recording_info: dict[str, Any]
    started_at: float
    turns: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=_empty_metrics_state)
    close_reason: CloseReason | None = None
    ended_at: float | None = None
    # 录像 eager stop 任务: _on_close 触发时立即异步发出 stop_egress, 这里
    # 持引用让 _on_session_end 可以 await, 同时避免被 GC (RUF006).
    # Eager stop_egress task fired from the close listener; held here so
    # _on_session_end can await it and asyncio's weakref-based task registry
    # doesn't garbage-collect it mid-flight.
    eager_stop_task: asyncio.Task[None] | None = None


# --------------------------------------------------------------------------- #
# 进程级预热 / Per-process prewarm
# --------------------------------------------------------------------------- #


server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    """JobProcess 启动时跑一次, 把重模型加载好放进 proc.userdata.

    Runs once per JobProcess on startup. Heavy models loaded here are shared
    across all jobs scheduled into the same process — VAD 加载约 300ms, 摊销
    到一个 worker 进程的多次 job 上.

    Silero VAD 参数选择 / VAD parameter notes:
        回归官方默认值, 仅 min_silence_duration 保留 1.5s. 之前
        activation_threshold=0.7 / min_speech_duration=0.25 偏保守, 会漏抓
        候选人轻声"嗯/呃"等填充音 → STT 拿不到对应文本 → turn detector 误判
        句子已说完 → 用 min_delay=0.5s 立即回, 抢答风险高; 反向上长 user turn
        也跟这条相关 (filler 被 VAD 吞了, 句子断成多段累积).
        min_silence 1.5s 与 turn detector + max_delay=5s 兜底协同, 是给真实
        思考停顿的最小窗口. max_buffered_speech 提到 180s, 覆盖面试里
        2-3 分钟长答, 避免默认 60s buffer 把候选人半句话切成完整 user turn.

        Reverted to official defaults except min_silence. The previous strict
        thresholds dropped soft fillers ("嗯/呃") from STT, so the turn detector
        saw deceptively "complete" text and either responded too fast or chained
        broken sentences into long user turns.
    """
    proc.userdata["vad"] = silero.VAD.load(
        activation_threshold=0.5,
        min_speech_duration=0.05,
        min_silence_duration=1.5,
        max_buffered_speech=180.0,
        prefix_padding_duration=0.5,
    )


server.setup_fnc = prewarm


# --------------------------------------------------------------------------- #
# 工厂函数: AgentSession 与 RoomOptions 的复杂构造抽出来, my_agent 只剩组装.
# Factories: keep my_agent shallow by hiding the verbose constructors here.
# --------------------------------------------------------------------------- #


def _pick_noise_cancellation(params: Any) -> Any:
    """按 participant 类型挑噪声抑制插件.

    Selector hook for AudioInputOptions: SIP 路径用窄带优化的 Krisp
    BVCTelephony, WebRTC 路径用 ai_coustics QUAIL_VF_L (顶配语音隔离).

    SIP participants get telephony-tuned Krisp; WebRTC participants get
    ai_coustics QUAIL_VF_L for voice isolation. 之前是个嵌套三元 lambda,
    抽成具名函数后 traceback 更友好, 也方便日后增加判别条件.
    """
    if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
        return noise_cancellation.BVCTelephony()
    return ai_coustics.audio_enhancement(
        model=ai_coustics.EnhancerModel.QUAIL_VF_L,
        model_parameters=ai_coustics.ModelParameters(
            enhancement_level=0.7,
        ),
    )


def _build_session(
    *,
    proc: JobProcess,
    selected_voice: str,
    state: SessionState,
) -> AgentSession:
    """组装 AgentSession (STT / LLM / TTS / VAD / turn handling).

    Build the AgentSession with all pipeline components. 抽出来后 my_agent
    专注于生命周期编排, 不再淹没在长字面量参数里. 注意 stt/llm/tts 的具体
    参数若要调整, 务必参考 https://docs.livekit.io/agents/ 的最新签名.
    """
    return AgentSession(
        stt=elevenlabs.STT(
            model_id="scribe_v2",
            language_code="zh",
            tag_audio_events=False,
        ),
        llm=openai.LLM(
            # 通过 DashScope OpenAI 兼容端点调通义系模型, 走 base_url 覆盖即可
            # 复用 openai.LLM 的 streaming 实现.
            # Reuse openai.LLM by pointing base_url at DashScope's OpenAI-
            # compatible endpoint to talk to Qwen/DeepSeek models.
            model=os.environ.get("DASHSCOPE_LLM_MODEL", "deepseek-v4-flash"),
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key=os.environ.get("DASHSCOPE_API_KEY"),  # type: ignore[arg-type]
            extra_body={"enable_thinking": False},
        ),
        tts=minimax.TTS(
            base_url="https://api.minimax.chat",
            voice=selected_voice,
        ),
        vad=proc.userdata["vad"],
        userdata=state,
        preemptive_generation=False,
        turn_handling={
            "turn_detection": MultilingualModel(),
            "endpointing": {
                "mode": "dynamic",
                "min_delay": 1.5,
                # 单轮 EOT 最长等 5s. 之前 8s 在结合候选人大量"嗯/呃"破碎
                # 表达时, 会把一连串中途停顿累积成几分钟不关闭的 user turn,
                # 期间 agent 完全沉默, 体感像模型卡死.
                # Cap per-turn EOT at 5s — previously 8s chained filler-heavy
                # pauses into multi-minute user turns of silent agent.
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


def _build_room_options() -> room_io.RoomOptions:
    """组装 RoomOptions: 噪声抑制选择器 + close_on_disconnect=False.

    Build RoomOptions. close_on_disconnect=False 关掉框架默认的"候选人断开
    立即关 session"行为, 让我们自己用 grace timer 管理热重连窗口.

    Disable close_on_disconnect so our 180s hot-reconnect grace owns the
    lifecycle instead of the framework auto-closing on first drop.
    """
    return room_io.RoomOptions(
        text_input=False,
        audio_input=room_io.AudioInputOptions(
            noise_cancellation=(
                None if _DISABLE_NOISE_CANCELLATION else _pick_noise_cancellation
            ),
        ),
        close_on_disconnect=False,
    )


# --------------------------------------------------------------------------- #
# Metrics 聚合 / Metrics aggregation
# --------------------------------------------------------------------------- #


def _accumulate_metrics(metrics_state: dict[str, Any], m: Any) -> None:
    """把单条 metrics 事件累加进 session-level + per-turn 桶.

    Dispatch a single metrics event into the right session-level and per-turn
    bucket. speech_id 把 LLM/TTS/EOU 串成单轮记录, 没有 speech_id 的事件
    (例如 VAD / Interruption) 只更新 session 桶.

    NOTE: 用 isinstance 链而非 `match`: 历史原因, 不阻碍后续迁移. ruff target
    已升到 py310, 改用 match 不会触发 lint 错误, 但与现行格式一致优先.
    Historical isinstance chain; ruff target is py310 now so `match` is valid,
    but kept for consistency with current style.
    """
    sess = metrics_state["session"]
    turns: dict[str, dict[str, Any]] = metrics_state["turns"]

    def bucket(speech_id: str | None) -> dict[str, Any] | None:
        # 按 speech_id 取/建一个轮次桶. 没有 speech_id (会话级聚合) 时返回 None
        # 表示"只走 session 桶, 跳过 per-turn 累积".
        # Lazily create the per-turn bucket; None means session-only event.
        if not speech_id:
            return None
        b = turns.get(speech_id)
        if b is None:
            b = {}
            turns[speech_id] = b
        return b

    if isinstance(m, lk_metrics.LLMMetrics):
        llm = sess["llm"]
        llm["request_count"] += 1
        llm["total_completion_tokens"] += m.completion_tokens
        llm["total_prompt_tokens"] += m.prompt_tokens
        llm["total_tokens"] += m.total_tokens
        llm["total_duration"] += m.duration
        if m.ttft > 0:
            llm["ttft_sum"] += m.ttft
            llm["ttft_count"] += 1
        b = bucket(m.speech_id)
        if b is not None:
            b["llm_ttft"] = m.ttft
            b["llm_duration"] = m.duration
            b["llm_total_tokens"] = m.total_tokens
    elif isinstance(m, lk_metrics.STTMetrics):
        stt = sess["stt"]
        stt["request_count"] += 1
        stt["total_audio_duration"] += m.audio_duration
        stt["total_duration"] += m.duration
    elif isinstance(m, lk_metrics.TTSMetrics):
        tts = sess["tts"]
        tts["request_count"] += 1
        tts["total_audio_duration"] += m.audio_duration
        tts["total_characters"] += m.characters_count
        tts["total_duration"] += m.duration
        if m.ttfb > 0:
            tts["ttfb_sum"] += m.ttfb
            tts["ttfb_count"] += 1
        b = bucket(m.speech_id)
        if b is not None:
            b["tts_ttfb"] = m.ttfb
            b["tts_duration"] = m.duration
            b["tts_characters"] = m.characters_count
    elif isinstance(m, lk_metrics.EOUMetrics):
        eou = sess["eou"]
        eou["count"] += 1
        eou["end_of_utterance_delay_sum"] += m.end_of_utterance_delay
        eou["transcription_delay_sum"] += m.transcription_delay
        eou["on_user_turn_completed_delay_sum"] += m.on_user_turn_completed_delay
        b = bucket(m.speech_id)
        if b is not None:
            b["eou_delay"] = m.end_of_utterance_delay
            b["transcription_delay"] = m.transcription_delay
    elif isinstance(m, lk_metrics.InterruptionMetrics):
        # 框架按累计语义递增 num_*; 覆盖式写入取最新累计值, 避免重复 sum.
        # Framework reports cumulative num_*, so overwrite rather than add.
        it = sess["interruption"]
        it["num_interruptions"] = m.num_interruptions
        it["num_backchannels"] = m.num_backchannels
        it["num_requests"] = m.num_requests
        it["latest_detection_delay"] = m.detection_delay
    elif isinstance(m, lk_metrics.VADMetrics):
        vad = sess["vad"]
        vad["total_inference_duration"] = m.inference_duration_total
        vad["total_inference_count"] = m.inference_count


# --------------------------------------------------------------------------- #
# 录像收尾 / Recording finalisation
# --------------------------------------------------------------------------- #


async def _stop_recording_best_effort(
    lkapi: lkapi_module.LiveKitAPI,
    recording_info: dict[str, Any],
    eager_task: asyncio.Task[None] | None,
) -> None:
    """停录像, 优先复用 close listener 启起来的 eager task.

    Best-effort egress stop. _on_session_end 跑到这里时 eager task 通常已完成,
    直接 await 让 framework 的 session_end_timeout (默认 5min) 兜底等它结束;
    没启过 eager task (recording_info 为空) 时也安全 no-op.

    Prefer awaiting the eager-stop task fired from the close listener. The
    framework's session_end_timeout covers slow LiveKit egress API calls;
    fire-and-forget would let the worker exit mid-request and leave egress
    running until LiveKit's own server-side timeout reaps it.
    """
    if eager_task is not None:
        try:
            await eager_task
        except Exception:
            logger.exception("eager stop_recording task raised")
        return
    if not recording_info:
        return
    try:
        await stop_recording(lkapi, recording_info["egressId"])
    except Exception:
        logger.exception("stop_recording during shutdown failed")


async def _on_session_end(ctx: JobContext) -> None:
    """Session 关闭后由框架调度: 上报转写 + 停 egress.

    Post-close hook: framework guarantees session.history is finalized before
    this fires and gives us up to ``session_end_timeout`` (default 5 min) to
    complete, so send_report's HTTP retries have headroom. Recording stop runs
    concurrently and is best-effort because the egress_ended webhook on the
    web side reconciles the final status.
    """
    state: SessionState = ctx.primary_session.userdata
    recording_info = state.recording_info or {}
    ended_at = state.ended_at or time.time()

    call_successful = "success" if state.close_reason in _SUCCESS_REASONS else "failed"

    recording_payload: dict[str, Any] | None = None
    if recording_info:
        # report 直接用启动时拿到的 egressId / fileKey 写 status="active", 由
        # web 端 LiveKit egress_ended webhook 回填最终 status / durationSecs.
        # Web-side egress_ended webhook backfills final status/durationSecs.
        recording_payload = {
            "egressId": recording_info["egressId"],
            "fileKey": recording_info["fileKey"],
            "status": "active",
            "durationSecs": None,
        }

    await asyncio.gather(
        send_report(
            interview_context=state.interview_context,
            room_name=ctx.room.name,
            turns=state.turns,
            call_successful=call_successful,
            started_at=state.started_at,
            ended_at=ended_at,
            close_reason=(
                state.close_reason.value if state.close_reason else "unknown"
            ),
            recording=recording_payload,
            metrics=state.metrics,
        ),
        _stop_recording_best_effort(state.lkapi, recording_info, state.eager_stop_task),
    )

    try:
        await state.lkapi.aclose()
    except Exception:
        logger.debug("lkapi.aclose failed", exc_info=True)


# --------------------------------------------------------------------------- #
# 入口协程 / Entrypoint coroutine
# --------------------------------------------------------------------------- #


@server.rtc_session(agent_name="giaogiao", on_session_end=_on_session_end)
async def my_agent(ctx: JobContext) -> None:
    """单次面试的主协程, 由 LiveKit worker 在每个 job 上调度.

    Per-job main coroutine scheduled by the LiveKit worker. Flow:
      1) 等候选人加入 → 读 metadata → 起录像 → 选主考官/音色.
      2) 装配 AgentSession + 三种事件监听 (metrics / conversation / close).
      3) 启 session + 三种定时器 (hard timeout / wind-down cue / hot-reconnect).
      4) 一切结束后由 framework 调 _on_session_end 做上报与收尾.
    """
    ctx.log_context_fields = {"room": ctx.room.name}

    # ---- 1) 候选人加入 + 元数据 + 录像 + 主考官选择 -------------------------
    # ---- 1) Wait for candidate, parse metadata, start recording, pick host
    participant = await ctx.wait_for_participant()
    interview_context: dict[str, Any] = {}
    if participant.metadata:
        try:
            interview_context = json.loads(participant.metadata)
            logger.info(
                "loaded interview context for %s",
                interview_context.get("candidate_name", "unknown"),
            )
        except json.JSONDecodeError:
            logger.warning("failed to parse participant metadata")

    # 录像: web 颁发 token 时在 metadata 里给出 recording_enabled /
    # recording_file_key, 二者都满足才尝试启动 RoomCompositeEgress; 失败不影响
    # 面试主流程. lkapi 在这里创建, 整个 job 生命周期共享一个实例.
    # Recording: both flags must be present before we try egress; egress failure
    # does not abort the interview. One lkapi instance shared for the whole job.
    lkapi = lkapi_module.LiveKitAPI()
    recording_info: dict[str, Any] = {}
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

    state = SessionState(
        lkapi=lkapi,
        interview_context=interview_context,
        recording_info=recording_info,
        started_at=time.time(),
    )

    # ---- 2) 装配 session + 监听 --------------------------------------------
    # ---- 2) Build session + register listeners
    session = _build_session(proc=ctx.proc, selected_voice=selected_voice, state=state)

    # session.on(...) 注册的回调由框架同步派发, 不能是 async def. 需要做异步
    # 动作时在回调里 asyncio.create_task 起后台 task 并把引用挂到 state 上避免
    # 被 GC (RUF006).
    # session.on(...) callbacks are dispatched synchronously and must be sync.
    # For async work, spawn a task and persist the ref on state.
    @session.on("metrics_collected")
    def _on_metrics_collected(event: Any) -> None:
        _accumulate_metrics(state.metrics, event.metrics)

    @session.on("conversation_item_added")
    def _on_conversation_item(event: Any) -> None:
        # 把 ChatMessage 落进 state.turns, 后续 send_report 直接序列化上报.
        # 仅保留 user / assistant(→agent) 两种角色, system overlay 不计入转写.
        # Snapshot ChatMessage into state.turns for the transcript upload;
        # system overlays are skipped.
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
        elapsed = max(0, item.created_at - state.started_at)
        state.turns.append(
            {
                "role": role_str,
                "message": text.strip(),
                "timeInCallSecs": round(elapsed),
            }
        )
        logger.debug("turn collected: %s (%.0fs)", role_str, elapsed)

    @session.on("close")
    def _on_close(event: Any) -> None:
        # 记下关闭时间和原因 + 取消所有定时器 + 立刻发起 eager stop egress.
        # close 事件之后 framework 还要等内部 aclose, 期间录像若不主动停, 会对
        # 空房间继续录 (实测可拖 12 分钟+).
        # On close: record reason, cancel timers, eagerly stop egress so we
        # don't keep recording an empty room while framework drains internally.
        state.ended_at = time.time()
        state.close_reason = event.reason
        logger.info(
            "session closed: reason=%s, turns=%d",
            event.reason.value if event.reason else "unknown",
            len(state.turns),
        )
        for t in (timeout_task, final_wrap_task, grace_task, resume_task):
            if t is not None and not t.done():
                t.cancel()
        if recording_info:

            async def _eager_stop_recording() -> None:
                try:
                    await stop_recording(lkapi, recording_info["egressId"])
                    logger.info("eager stop_recording dispatched from close listener")
                except Exception:
                    logger.exception("eager stop_recording from close listener failed")

            state.eager_stop_task = asyncio.create_task(_eager_stop_recording())

    interview_agent = InterviewAgent(interview_context, selected_interviewer)

    # ---- 3) 启动 session ---------------------------------------------------
    # ---- 3) Start the session
    await session.start(
        agent=interview_agent,
        room=ctx.room,
        room_options=_build_room_options(),
    )

    # 让 agent 的 elapsed clock 对齐 state.started_at, per-turn 时间提示才准.
    # Anchor agent's elapsed clock to state.started_at so per-turn time hints
    # match the actual session start.
    interview_agent.mark_started()

    # ---- 4) 三个定时器 + 热重连 -------------------------------------------
    # ---- 4) Three timers + hot reconnect
    time_limit = interview_agent.time_limit_seconds
    hard_grace = interview_agent.hard_grace_seconds

    # 幂等开关: 多个并发兜底路径 (硬切定时器 / grace 到期 / EndCallTool) 可能
    # 同时落地, 重复 ctx.shutdown 会抛错; 用 flag + state.close_reason 双重判定.
    # Idempotency guard for _finalize_via_shutdown — multiple fallback paths
    # can race and ctx.shutdown is not safe to call twice.
    shutdown_initiated = False
    timeout_task: asyncio.Task[None] | None = None
    final_wrap_task: asyncio.Task[None] | None = None
    grace_task: asyncio.Task[None] | None = None
    # Post-reconnect resume task (replay history + welcome line). Hold the
    # ref to keep asyncio's weakref registry from GCing it mid-flight.
    resume_task: asyncio.Task[None] | None = None

    async def _finalize_via_shutdown(reason: str) -> None:
        """走 LiveKit 框架完整 shutdown 序列, 触发 on_session_end.

        Mirror EndCallTool's shutdown sequence so all fallback paths exit
        cleanly. Calling session.aclose() alone skips the worker shutdown_fut,
        which means on_session_end never fires and send_report never posts,
        leaving the frontend stuck on "interview in progress".

        步骤 / Steps:
            1) session.shutdown() 触发 graceful drain
            2) 注册 delete_room 为 shutdown 回调, 在框架 lifecycle 末尾执行
            3) ctx.shutdown(reason) 解锁 worker 的 _shutdown_fut, 进入官方关闭流程
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

    def _session_already_closing() -> bool:
        # 公共 race guard: close 事件可能与定时器在同一 tick 落地, 定时器内的
        # cancel() 不保证赶在 sleep 返回前到达, 显式检查避免对已 drain 的 session
        # 再 interrupt/shutdown.
        # Shared race guard: a close event landing on the same tick a timer
        # wakes may not cancel in time. Bail explicitly to avoid duplicate
        # interrupt/shutdown calls on an already-draining session.
        return state.close_reason is not None or shutdown_initiated

    async def _say_fixed_cue(
        text: str, *, allow_interruptions: bool, playout_timeout: float
    ) -> None:
        """绕过 LLM 直接 TTS 播一句固定话术 + 抢占 pipeline + 超时兜底.

        Speak a fixed cue via TTS (no LLM call), pre-empting any in-flight
        pipeline work and bounding the playout window.

        Why bypass LLM: 兜底路径需要"100% 可控"的告别词. generate_reply 的
        instructions 会被注入 role="system", 在压缩时间线 + 多个 system
        overlay 叠加下, fast LLM 容易角色错乱回成候选人. 固定字面话术杜绝
        漂移; bounded wait 防止 TTS 卡死时连带阻塞 shutdown.

        Fallback paths need a 100% controllable goodbye. Generate_reply's
        instructions land as role="system" and a fast LLM under context
        pressure can flip into the candidate role; literal say() avoids the
        LLM. Bounded wait keeps a hung TTS from blocking shutdown.
        """
        # 1) 抢占 pipeline: 打断进行中的 agent 语音, 清空 user turn 缓冲.
        #    否则 say() 会被 enqueue 到下一个 turn, 实测可能永远播不到.
        # 1) Pre-empt so the cue plays immediately instead of being queued
        #    behind an open user turn.
        try:
            session.interrupt()
        except Exception:
            logger.exception("session.interrupt() before fixed cue failed")
        try:
            session.clear_user_turn()
        except Exception:
            logger.exception("session.clear_user_turn() before fixed cue failed")

        try:
            handle = session.say(text, allow_interruptions=allow_interruptions)
            await asyncio.wait_for(handle.wait_for_playout(), timeout=playout_timeout)
        except asyncio.TimeoutError:
            logger.warning(
                "fixed cue playout exceeded %.0fs; continuing", playout_timeout
            )
        except Exception:
            logger.exception("fixed cue play failed")

    def _schedule_cue(
        *,
        delay: float,
        race_skip_log: str,
        run: Callable[[], Awaitable[None]],
    ) -> asyncio.Task[None]:
        """通用定时器: sleep → race guard → run; CancelledError 安静吞掉.

        Shared timer skeleton: sleep, re-check the close race, then run the
        provided coroutine. Swallow CancelledError because cancel() from
        _on_close is the normal early-exit path, not an error.
        """

        async def _runner() -> None:
            try:
                await asyncio.sleep(delay)
                if _session_already_closing():
                    logger.info(race_skip_log)
                    return
                await run()
            except asyncio.CancelledError:
                pass

        return asyncio.create_task(_runner())

    # 硬超时兜底: per-turn instructions 会引导模型 graceful 收尾 (soft wrap →
    # final wrap → end_call). 如果模型在超时 + grace 后仍未结束, 强制说告别词
    # 并走 shutdown, 杜绝"卡死的面试无限跑下去".
    # Hard timeout safety net. If the LLM still hasn't ended after a generous
    # grace period, force a goodbye and shutdown so a stuck interview can't
    # run forever.
    async def _enforce_time_limit() -> None:
        logger.warning("interview exceeded time limit; forcing shutdown")
        await _say_fixed_cue(
            "非常感谢你今天的分享。因为时间关系，本场面试到此结束。"
            "我们会综合评估你的表现并尽快反馈结果，祝你一切顺利。",
            allow_interruptions=False,
            playout_timeout=_TIMEOUT_REPLY_PLAYOUT_SECONDS,
        )
        await _finalize_via_shutdown(reason="task_completed")

    timeout_task = _schedule_cue(
        delay=time_limit + hard_grace,
        race_skip_log="time-limit timer fired but session already closing; skipping",
        run=_enforce_time_limit,
    )

    # 18:30 主动收尾提示: 软提示走 on_user_turn_completed, 但只在用户说话时
    # 触发. 候选人沉默或 turn detector 把长 user turn 一直挂着时, 该提示永远
    # 到不了模型, 模型不会调 enter_wrap_up. 这里独立计时强制 agent 开口提示.
    # Active wind-down trigger at INTERVIEW_FINAL_WRAP_SECONDS. The soft hint
    # in on_user_turn_completed only fires on user turns; a silent candidate
    # means the hint never reaches the model. This timer forces a spoken cue.
    async def _force_wind_down() -> None:
        # 模型已主动进入收尾流程 → 不抢话直接退.
        # Skip if the model already entered wrap-up on its own.
        if interview_agent.wrap_up_started:
            return
        logger.info("forcing wind-down cue at final wrap time")
        await _say_fixed_cue(
            "时间快到了，咱们准备进入收尾环节，请简单回答一下当前问题。",
            allow_interruptions=True,
            playout_timeout=_WIND_DOWN_PLAYOUT_SECONDS,
        )

    final_wrap_task = _schedule_cue(
        delay=INTERVIEW_FINAL_WRAP_SECONDS,
        race_skip_log="wind-down timer fired but session already closing; skipping",
        run=_force_wind_down,
    )

    # ---- 热重连 / Hot reconnect -------------------------------------------
    # 候选人断连不立即 aclose, 起 3 分钟宽限计时, 同 identity 重新加入则取消
    # 继续对话; 否则计时到时走完整 shutdown -> /api/agent/report.
    # Do NOT immediately aclose on participant disconnect. Start a 3-min grace
    # timer; if the same identity rejoins within the window, cancel and resume.
    # Otherwise fire the full shutdown so /api/agent/report finalises the round.
    candidate_identity = participant.identity

    async def _grace_expired() -> None:
        logger.info(
            "hot-reconnect grace expired for %s; finalising via framework shutdown",
            candidate_identity,
        )
        # 走完整 shutdown 序列, 不裸 session.aclose() — 后者跳过 worker
        # shutdown_fut, 导致 on_session_end 不跑, send_report 不发, web 端
        # round status 永远停在进行中.
        # Full shutdown rather than bare aclose so on_session_end fires
        # and send_report posts to /api/agent/report.
        await _finalize_via_shutdown(reason="participant_disconnected")

    def _on_participant_disconnected(p: rtc.RemoteParticipant) -> None:
        nonlocal grace_task
        if p.identity != candidate_identity:
            return
        if grace_task is not None and not grace_task.done():
            return
        logger.info(
            "candidate %s disconnected; %ds hot-reconnect grace started",
            p.identity,
            _HOT_RECONNECT_GRACE_SECONDS,
        )
        # 立即打断 TTS 避免对空房间继续讲话; STT 无输入即无新 LLM 调用.
        # Interrupt ongoing TTS so we don't speak to an empty room.
        try:
            session.interrupt()
        except Exception:
            logger.exception("session.interrupt() during grace start failed")
        grace_task = _schedule_cue(
            delay=_HOT_RECONNECT_GRACE_SECONDS,
            race_skip_log=(
                f"grace timer expired for {candidate_identity} but session "
                "already closing; skipping"
            ),
            run=_grace_expired,
        )

    async def _resume_after_reconnect(target_identity: str) -> None:
        """重连后: 先回放历史, 再 TTS 一句"欢迎回来".

        After reconnect: replay history first, then welcome line.

        顺序约束: 前端 useSessionMessages 用首次到达时间排序, 不是消息
        timestamp; 如果 say 抢先, 历史会出现在欢迎气泡之后顺序错乱.

        Ordering matters: the frontend hook orders by first-seen client time,
        not by timestamp, so history must arrive before the welcome bubble.
        """
        try:
            await replay_turns_to(
                ctx.room.local_participant,
                turns=list(state.turns),
                target_identity=target_identity,
                agent_identity=ctx.room.local_participant.identity,
                candidate_identity=candidate_identity,
            )
        except Exception:
            logger.exception("transcript replay coroutine failed")
        # 用 say() 直接 TTS, 不走 generate_reply: 小模型 (Qwen-turbo /
        # deepseek-v4-flash 等) 会把"候选人刚才因网络问题短暂离线"这种元指令
        # 当成候选人在反思, 进而切换到候选人口吻. say() 跳过 LLM 杜绝漂移.
        # Bypass LLM-driven greet: small models misread the meta-instruction
        # as the candidate's own utterance and flip role.
        try:
            session.say("欢迎回来，我们继续刚才的话题。", allow_interruptions=True)
        except Exception:
            logger.exception("re-greeting after reconnect failed")

    def _on_participant_connected(p: rtc.RemoteParticipant) -> None:
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
