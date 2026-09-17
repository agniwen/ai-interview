from types import SimpleNamespace

import pytest

import agent as agent_module
from agent import (
    _build_reconnect_message,
    _build_room_options,
    _build_session,
    prewarm,
)


async def test_failed_session_releases_job_and_deletes_room():
    calls = []
    callbacks = []

    async def delete_room():
        calls.append("room_deleted")

    ctx = SimpleNamespace(
        add_shutdown_callback=callbacks.append,
        shutdown=lambda **kwargs: calls.append(kwargs["reason"]),
        delete_room=delete_room,
    )
    agent_module._shutdown_failed_session(ctx)
    assert calls == ["system_shutdown"]
    assert len(callbacks) == 1
    await callbacks[0]()
    assert calls == ["system_shutdown", "room_deleted"]


class _FakeAgentSession:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeComponent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


@pytest.fixture(autouse=True)
def pipeline_rollback(monkeypatch):
    monkeypatch.setenv("INTERVIEW_VOICE_MODE", "pipeline")


def test_realtime_is_default_and_does_not_build_the_old_pipeline(monkeypatch):
    monkeypatch.delenv("INTERVIEW_VOICE_MODE", raising=False)
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(
        agent_module.qwen_realtime.RealtimeModel, "from_env", lambda: "qwen-realtime"
    )
    session = _build_session(
        proc=SimpleNamespace(userdata={}), selected_voice="old-tts-voice", state="state"
    )
    assert session.kwargs == {
        "llm": "qwen-realtime",
        "max_tool_steps": 8,
        "userdata": "state",
        "turn_handling": {"turn_detection": "realtime_llm"},
    }


def test_prewarm_balances_interview_pauses_with_response_latency(monkeypatch):
    calls = []

    def fake_vad(**kwargs):
        calls.append(kwargs)
        return "silero-vad"

    monkeypatch.setattr(agent_module.inference, "VAD", fake_vad)

    proc = SimpleNamespace(userdata={})
    prewarm(proc)

    assert proc.userdata["vad"] == "silero-vad"
    assert calls == [
        {
            "activation_threshold": 0.5,
            "model": "silero",
            "max_buffered_speech": 600.0,
            "min_silence_duration": 0.55,
            "min_speech_duration": 0.05,
            "prefix_padding_duration": 0.5,
        }
    ]


def test_agent_session_uses_qwen_audio_streaming_stt(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setenv("DASHSCOPE_STT_MODEL", "qwen-audio-test-streaming")
    monkeypatch.setenv("DASHSCOPE_STT_MAX_SENTENCE_SILENCE_MS", "1200")
    monkeypatch.setenv("DASHSCOPE_STT_VOCABULARY_ID", "vocabulary-id")
    monkeypatch.setenv("DASHSCOPE_STT_BASE_URL", "wss://workspace.example/inference")
    monkeypatch.setenv("DASHSCOPE_WORKSPACE_ID", "workspace-id")
    monkeypatch.setattr(
        agent_module.inference,
        "TurnDetector",
        lambda **_kwargs: "audio-turn-detector",
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    stt = session.kwargs["stt"]

    assert stt.kwargs["model"] == "qwen-audio-test-streaming"
    assert stt.kwargs["language"] == "zh"
    assert stt.kwargs["max_sentence_silence"] == 1200
    assert stt.kwargs["vocabulary_id"] == "vocabulary-id"
    assert stt.kwargs["base_url"] == "wss://workspace.example/inference"
    assert stt.kwargs["workspace"] == "workspace-id"
    assert "api_key" not in stt.kwargs


def test_agent_session_defaults_qwen_sentence_silence_to_1300ms(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference,
        "TurnDetector",
        lambda **_kwargs: "audio-turn-detector",
    )
    monkeypatch.delenv("DASHSCOPE_STT_MAX_SENTENCE_SILENCE_MS", raising=False)

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    assert session.kwargs["stt"].kwargs["max_sentence_silence"] == 1300


def test_agent_session_disables_parallel_llm_tool_calls(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference,
        "TurnDetector",
        lambda **_kwargs: "audio-turn-detector",
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    assert session.kwargs["llm"].kwargs["parallel_tool_calls"] is False


def test_reconnect_message_never_repeats_the_active_question():
    assert _build_reconnect_message(has_active_question=True) == (
        "欢迎回来，请继续刚才的回答。"
    )
    assert _build_reconnect_message(has_active_question=False) == (
        "欢迎回来，我们继续刚才的面试。"
    )


def test_agent_session_endpointing_balances_pauses_with_response_latency(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference,
        "TurnDetector",
        lambda **_kwargs: "audio-turn-detector",
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    endpointing = session.kwargs["turn_handling"]["endpointing"]

    assert endpointing["mode"] == "dynamic"
    assert endpointing["min_delay"] == 1.5
    assert endpointing["max_delay"] == 7.0


def test_agent_session_preemptively_starts_llm_generation(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference,
        "TurnDetector",
        lambda **_kwargs: "audio-turn-detector",
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    assert session.kwargs["turn_handling"]["preemptive_generation"] == {
        "enabled": True,
        "preemptive_tts": False,
    }
    assert "preemptive_generation" not in session.kwargs


def test_agent_session_uses_audio_turn_detector_and_user_turn_limit(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference,
        "TurnDetector",
        lambda **_kwargs: "audio-turn-detector",
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    turn_handling = session.kwargs["turn_handling"]

    assert turn_handling["turn_detection"] == "audio-turn-detector"
    assert turn_handling["user_turn_limit"] == {
        "max_duration": 240.0,
        "max_words": 1000,
    }


def test_cloud_session_keeps_adaptive_interruption(monkeypatch):
    turn_detector_calls = []

    def fake_turn_detector(**kwargs):
        turn_detector_calls.append(kwargs)
        return "audio-turn-detector"

    monkeypatch.setattr(agent_module, "_SELF_HOSTED", False)
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(agent_module.inference, "TurnDetector", fake_turn_detector)

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    assert turn_detector_calls == [{}]
    assert session.kwargs["turn_handling"]["interruption"]["mode"] == "adaptive"


def test_self_hosted_session_uses_local_turn_detection_and_vad_interruption(
    monkeypatch,
):
    turn_detector_calls = []

    def fake_turn_detector(**kwargs):
        turn_detector_calls.append(kwargs)
        return "audio-turn-detector"

    monkeypatch.setattr(agent_module, "_SELF_HOSTED", True)
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(agent_module.inference, "TurnDetector", fake_turn_detector)

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    assert turn_detector_calls == [{"version": "v1-mini"}]
    assert session.kwargs["turn_handling"]["interruption"]["mode"] == "vad"
    assert session.kwargs["turn_handling"]["interruption"]["min_duration"] == 0.6


def test_agent_session_uses_pcm_for_minimax_streaming_audio(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.aliyun_stt, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference,
        "TurnDetector",
        lambda **_kwargs: "audio-turn-detector",
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    tts = session.kwargs["tts"]

    assert tts.kwargs["audio_format"] == "pcm"
    assert tts.kwargs["language_boost"] == "Chinese"


def test_room_options_enable_text_input_when_round_allows_it():
    options = _build_room_options(allow_text_input=True)

    assert options.text_input is True
    assert options.close_on_disconnect is False


def test_room_options_disable_text_input_when_round_disallows_it():
    options = _build_room_options(allow_text_input=False)

    assert options.text_input is False
    assert options.close_on_disconnect is False


def test_self_hosted_room_options_disable_cloud_noise_cancellation(monkeypatch):
    monkeypatch.setattr(agent_module, "_SELF_HOSTED", True)
    monkeypatch.setattr(agent_module, "_DISABLE_NOISE_CANCELLATION", False)

    options = _build_room_options(allow_text_input=True)

    assert options.audio_input.noise_cancellation is None


def test_cloud_room_options_keep_noise_cancellation(monkeypatch):
    monkeypatch.setattr(agent_module, "_SELF_HOSTED", False)
    monkeypatch.setattr(agent_module, "_DISABLE_NOISE_CANCELLATION", False)

    options = _build_room_options(allow_text_input=True)

    assert (
        options.audio_input.noise_cancellation is agent_module._pick_noise_cancellation
    )


async def test_room_close_then_participant_disconnect_does_not_restart_reconnect(
    monkeypatch,
):
    from dataclasses import replace
    from unittest.mock import AsyncMock, Mock

    from livekit.agents import CloseReason
    from test_realtime_interview_agent import context

    dispatch = context()
    dispatch = replace(dispatch, recording=replace(dispatch.recording, enabled=False))
    monkeypatch.setattr(agent_module, "parse_dispatch_context", lambda _: dispatch)
    monkeypatch.setattr(agent_module.lkapi_module, "LiveKitAPI", lambda: None)
    callbacks = {}
    room_callbacks = {}
    session = SimpleNamespace(start=AsyncMock(), interrupt=Mock())
    session.on = lambda event: lambda callback: callbacks.__setitem__(event, callback)

    def build_session(**kwargs):
        session.userdata = kwargs["state"]
        return session

    monkeypatch.setattr(agent_module, "_build_session", build_session)
    participant = SimpleNamespace(identity="candidate", metadata="{}")
    ctx = SimpleNamespace(
        proc=SimpleNamespace(),
        room=SimpleNamespace(
            name="test-room",
            on=lambda event, callback: room_callbacks.__setitem__(event, callback),
        ),
        wait_for_participant=AsyncMock(return_value=participant),
    )
    await agent_module.my_agent(ctx)
    closed = SimpleNamespace(reason=CloseReason.USER_INITIATED)
    try:
        callbacks["close"](closed)
        room_callbacks["participant_disconnected"](participant)
        session.interrupt.assert_not_called()
        assert not session.userdata.clock.is_paused
    finally:
        callbacks["close"](closed)
