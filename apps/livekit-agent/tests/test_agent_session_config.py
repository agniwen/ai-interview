from types import SimpleNamespace

import agent as agent_module
from agent import _build_room_options, _build_session, prewarm


class _FakeAgentSession:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeComponent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def test_prewarm_allows_long_interview_answers(monkeypatch):
    calls = []

    def fake_load(**kwargs):
        calls.append(kwargs)
        return "silero-vad"

    monkeypatch.setattr(agent_module.silero, "VAD", SimpleNamespace(load=fake_load))

    proc = SimpleNamespace(userdata={})
    prewarm(proc)

    assert proc.userdata["vad"] == "silero-vad"
    assert calls == [
        {
            "activation_threshold": 0.5,
            "max_buffered_speech": 600.0,
            "min_silence_duration": 1.5,
            "min_speech_duration": 0.05,
            "prefix_padding_duration": 0.5,
        }
    ]


def test_agent_session_uses_scribe_v2_realtime_stt(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.elevenlabs, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(agent_module, "MultilingualModel", lambda: "turn-detector")

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    stt = session.kwargs["stt"]

    assert stt.kwargs["model_id"] == "scribe_v2_realtime"
    assert "language_code" not in stt.kwargs
    assert stt.kwargs["tag_audio_events"] is False
    assert "api_key" not in stt.kwargs


def test_agent_session_endpointing_waits_for_interview_pauses(monkeypatch):
    monkeypatch.setattr(agent_module, "AgentSession", _FakeAgentSession)
    monkeypatch.setattr(agent_module.elevenlabs, "STT", _FakeComponent)
    monkeypatch.setattr(agent_module.openai, "LLM", _FakeComponent)
    monkeypatch.setattr(agent_module.minimax, "TTS", _FakeComponent)
    monkeypatch.setattr(agent_module, "MultilingualModel", lambda: "turn-detector")

    session = _build_session(
        proc=SimpleNamespace(userdata={"vad": "silero-vad"}),
        selected_voice="voice_agent_Male_Phone_1",
        state=object(),
    )

    endpointing = session.kwargs["turn_handling"]["endpointing"]

    assert endpointing["mode"] == "dynamic"
    assert endpointing["min_delay"] == 1.5
    assert endpointing["max_delay"] == 5.0


def test_room_options_enable_text_input_when_round_allows_it():
    options = _build_room_options(allow_text_input=True)

    assert options.text_input is True
    assert options.close_on_disconnect is False


def test_room_options_disable_text_input_when_round_disallows_it():
    options = _build_room_options(allow_text_input=False)

    assert options.text_input is False
    assert options.close_on_disconnect is False
