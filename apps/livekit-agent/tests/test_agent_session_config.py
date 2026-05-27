from types import SimpleNamespace

import agent as agent_module
from agent import _build_session


class _FakeAgentSession:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeComponent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def test_agent_session_uses_realtime_stt_with_server_vad(monkeypatch):
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
    assert stt.kwargs["language_code"] == "zh"
    assert stt.kwargs["server_vad"] == {
        "vad_silence_threshold_secs": 1.2,
        "vad_threshold": 0.4,
        "min_speech_duration_ms": 100,
        "min_silence_duration_ms": 500,
    }
