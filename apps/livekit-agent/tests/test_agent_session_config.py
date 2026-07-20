from types import SimpleNamespace

import agent as agent_module
from agent import _build_room_options, _build_session, prewarm


class _FakeAgentSession:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeComponent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


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


def test_agent_session_uses_scribe_v2_realtime_stt(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.elevenlabs, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference, "TurnDetector", lambda: "audio-turn-detector"
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    stt = session.kwargs["stt"]

    assert stt.kwargs["model_id"] == "scribe_v2_realtime"
    assert stt.kwargs["language_code"] == "zh"
    assert stt.kwargs["tag_audio_events"] is False
    assert stt.kwargs["server_vad"] == {
        "min_silence_duration_ms": 100,
        "min_speech_duration_ms": 100,
        "vad_silence_threshold_secs": 0.6,
        "vad_threshold": 0.4,
    }
    assert "api_key" not in stt.kwargs


def test_agent_session_endpointing_balances_pauses_with_response_latency(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.elevenlabs, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference, "TurnDetector", lambda: "audio-turn-detector"
    )

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    endpointing = session.kwargs["turn_handling"]["endpointing"]

    assert endpointing["mode"] == "dynamic"
    assert endpointing["min_delay"] == 0.5
    assert endpointing["max_delay"] == 3.0


def test_agent_session_preemptively_starts_llm_generation(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.elevenlabs, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference, "TurnDetector", lambda: "audio-turn-detector"
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
    monkeypatch.setattr(agent_module.elevenlabs, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference, "TurnDetector", lambda: "audio-turn-detector"
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


def test_agent_session_uses_pcm_for_minimax_streaming_audio(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.elevenlabs, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(
        agent_module.inference, "TurnDetector", lambda: "audio-turn-detector"
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
