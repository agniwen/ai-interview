"""Tests for agent._accumulate_metrics.

锁定 metrics 事件 -> session/turns 桶的字段映射. send_report 把这份结构直接透传到
web 端 /api/agent/report, 任何 schema 漂移都需要这里挂一道.

Locks the metrics-event -> session/turns bucket mapping. send_report ships
this dict shape straight to the web /api/agent/report endpoint, so any field
drift should fail here first.

We stub the lk_metrics.* classes via monkey-patch so we don't have to satisfy
the real livekit metrics dataclass constructors (some require many fields).
The function only checks isinstance(m, lk_metrics.<Cls>); replacing the class
symbol with our stub makes our SimpleNamespace-like objects qualify.
"""

from types import SimpleNamespace

import agent as agent_module
from agent import _accumulate_metrics, _empty_metrics_state


class _StubLLM: ...


class _StubSTT: ...


class _StubTTS: ...


class _StubEOU: ...


class _StubInterruption: ...


class _StubVAD: ...


def _patch_metrics_types(monkeypatch) -> None:
    monkeypatch.setattr(agent_module.lk_metrics, "LLMMetrics", _StubLLM)
    monkeypatch.setattr(agent_module.lk_metrics, "STTMetrics", _StubSTT)
    monkeypatch.setattr(agent_module.lk_metrics, "TTSMetrics", _StubTTS)
    monkeypatch.setattr(agent_module.lk_metrics, "EOUMetrics", _StubEOU)
    monkeypatch.setattr(
        agent_module.lk_metrics, "InterruptionMetrics", _StubInterruption
    )
    monkeypatch.setattr(agent_module.lk_metrics, "VADMetrics", _StubVAD)


def _evt(cls, **fields):
    obj = cls()
    for k, v in fields.items():
        setattr(obj, k, v)
    return obj


def test_llm_event_accumulates_session_and_turn(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()

    _accumulate_metrics(
        state,
        _evt(
            _StubLLM,
            completion_tokens=10,
            prompt_tokens=30,
            total_tokens=40,
            duration=1.5,
            ttft=0.4,
            speech_id="s1",
        ),
    )

    llm = state["session"]["llm"]
    assert llm["request_count"] == 1
    assert llm["total_completion_tokens"] == 10
    assert llm["total_prompt_tokens"] == 30
    assert llm["total_tokens"] == 40
    assert llm["total_duration"] == 1.5
    assert llm["ttft_sum"] == 0.4
    assert llm["ttft_count"] == 1
    assert state["turns"]["s1"] == {
        "llm_ttft": 0.4,
        "llm_duration": 1.5,
        "llm_total_tokens": 40,
    }


def test_llm_event_without_speech_id_skips_turn_bucket(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()

    _accumulate_metrics(
        state,
        _evt(
            _StubLLM,
            completion_tokens=5,
            prompt_tokens=10,
            total_tokens=15,
            duration=0.5,
            ttft=0.0,
            speech_id=None,
        ),
    )

    assert state["session"]["llm"]["request_count"] == 1
    # ttft=0 不计入 ttft_sum
    # ttft=0 must not be counted into the average
    assert state["session"]["llm"]["ttft_count"] == 0
    assert state["turns"] == {}


def test_stt_event_accumulates(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()

    _accumulate_metrics(state, _evt(_StubSTT, audio_duration=4.0, duration=0.8))

    stt = state["session"]["stt"]
    assert stt["request_count"] == 1
    assert stt["total_audio_duration"] == 4.0
    assert stt["total_duration"] == 0.8


def test_tts_event_accumulates_session_and_turn(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()

    _accumulate_metrics(
        state,
        _evt(
            _StubTTS,
            audio_duration=2.5,
            characters_count=120,
            duration=1.0,
            ttfb=0.3,
            speech_id="s2",
        ),
    )

    tts = state["session"]["tts"]
    assert tts["request_count"] == 1
    assert tts["total_audio_duration"] == 2.5
    assert tts["total_characters"] == 120
    assert tts["total_duration"] == 1.0
    assert tts["ttfb_sum"] == 0.3
    assert tts["ttfb_count"] == 1
    assert state["turns"]["s2"] == {
        "tts_ttfb": 0.3,
        "tts_duration": 1.0,
        "tts_characters": 120,
    }


def test_eou_event_accumulates_session_and_turn(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()

    _accumulate_metrics(
        state,
        _evt(
            _StubEOU,
            end_of_utterance_delay=0.6,
            transcription_delay=0.2,
            on_user_turn_completed_delay=0.1,
            speech_id="s3",
        ),
    )

    eou = state["session"]["eou"]
    assert eou["count"] == 1
    assert eou["end_of_utterance_delay_sum"] == 0.6
    assert eou["transcription_delay_sum"] == 0.2
    assert eou["on_user_turn_completed_delay_sum"] == 0.1
    assert state["turns"]["s3"] == {
        "eou_delay": 0.6,
        "transcription_delay": 0.2,
    }


def test_interruption_event_overwrites_cumulative_counters(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()

    # framework 报的是累计值, 不能 sum, 必须覆盖.
    # Framework reports cumulative numbers — must overwrite, not sum.
    _accumulate_metrics(
        state,
        _evt(
            _StubInterruption,
            num_interruptions=1,
            num_backchannels=0,
            num_requests=2,
            detection_delay=0.15,
        ),
    )
    _accumulate_metrics(
        state,
        _evt(
            _StubInterruption,
            num_interruptions=3,
            num_backchannels=2,
            num_requests=5,
            detection_delay=0.25,
        ),
    )

    it = state["session"]["interruption"]
    assert it["num_interruptions"] == 3
    assert it["num_backchannels"] == 2
    assert it["num_requests"] == 5
    assert it["latest_detection_delay"] == 0.25


def test_vad_event_overwrites_totals(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()

    _accumulate_metrics(
        state,
        _evt(_StubVAD, inference_duration_total=10.0, inference_count=100),
    )
    _accumulate_metrics(
        state,
        _evt(_StubVAD, inference_duration_total=12.5, inference_count=125),
    )

    vad = state["session"]["vad"]
    assert vad["total_inference_duration"] == 12.5
    assert vad["total_inference_count"] == 125


def test_unknown_event_is_ignored(monkeypatch):
    _patch_metrics_types(monkeypatch)
    state = _empty_metrics_state()
    before = _empty_metrics_state()

    _accumulate_metrics(state, SimpleNamespace(foo="bar"))

    assert state == before
