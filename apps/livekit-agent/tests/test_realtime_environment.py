"""Existing deployments need only their existing DashScope credential."""

import pytest

from agent_config import resolve_voice_mode
from qwen_realtime import DEFAULT_BASE_URL, DEFAULT_MODEL, RealtimeModel

OPTIONAL_ENV = (
    "DASHSCOPE_REALTIME_MODEL",
    "DASHSCOPE_REALTIME_BASE_URL",
    "DASHSCOPE_REALTIME_VOICE",
    "DASHSCOPE_REALTIME_TURN_DETECTION",
    "DASHSCOPE_WORKSPACE_ID",
)


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    monkeypatch.setenv("DASHSCOPE_API_KEY", "existing-test-key")
    for key in OPTIONAL_ENV:
        monkeypatch.delenv(key, raising=False)


@pytest.mark.parametrize("value", [None, "", "  "])
def test_existing_environment_uses_realtime_defaults(monkeypatch, value):
    if value is not None:
        for key in OPTIONAL_ENV:
            monkeypatch.setenv(key, value)
    model = RealtimeModel.from_env()
    assert model.model == DEFAULT_MODEL
    assert str(model._url.with_query(None)) == DEFAULT_BASE_URL
    assert model._voice == "longanlingxin"
    assert model._turn_detection == "smart_turn"
    assert model._workspace is None
    assert model._api_key == "existing-test-key"
    assert (
        resolve_voice_mode({} if value is None else {"INTERVIEW_VOICE_MODE": value})
        == "realtime"
    )


def test_explicit_realtime_overrides_are_preserved(monkeypatch):
    values = {
        "DASHSCOPE_REALTIME_MODEL": "qwen-audio-3.0-realtime-flash",
        "DASHSCOPE_REALTIME_BASE_URL": "wss://workspace.example/api-ws/v1/realtime",
        "DASHSCOPE_REALTIME_VOICE": "custom-voice",
        "DASHSCOPE_REALTIME_TURN_DETECTION": "server_vad",
        "DASHSCOPE_WORKSPACE_ID": "workspace-id",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, f" {value} ")
    model = RealtimeModel.from_env()
    assert model.model == values["DASHSCOPE_REALTIME_MODEL"]
    assert str(model._url.with_query(None)) == values["DASHSCOPE_REALTIME_BASE_URL"]
    assert model._voice == "custom-voice"
    assert model._turn_detection == "server_vad"
    assert model._workspace == "workspace-id"
    assert resolve_voice_mode({"INTERVIEW_VOICE_MODE": " pipeline "}) == "pipeline"


def test_credentials_are_still_required(monkeypatch):
    monkeypatch.delenv("DASHSCOPE_API_KEY")
    with pytest.raises(ValueError, match="DASHSCOPE_API_KEY"):
        RealtimeModel.from_env()


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("DASHSCOPE_REALTIME_BASE_URL", "http://invalid.example"),
        ("DASHSCOPE_REALTIME_TURN_DETECTION", "unsupported"),
    ],
)
def test_invalid_explicit_configuration_is_not_silently_replaced(
    monkeypatch, key, value
):
    monkeypatch.setenv(key, value)
    with pytest.raises(ValueError):
        RealtimeModel.from_env()
