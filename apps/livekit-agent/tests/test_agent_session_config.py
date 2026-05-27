from types import SimpleNamespace

import agent as agent_module
from agent import _build_room_options, _build_session


class _FakeAgentSession:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class _FakeComponent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def test_agent_session_uses_scribe_v2_stt(monkeypatch):
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

    assert stt.kwargs["model_id"] == "scribe_v2"
    assert stt.kwargs["language_code"] == "zh"
    assert "server_vad" not in stt.kwargs


def test_room_options_disable_text_input():
    options = _build_room_options()

    assert options.text_input is False
    assert options.close_on_disconnect is False
