import asyncio
import json
from types import SimpleNamespace

import aiohttp
import pytest
from livekit import rtc
from livekit.agents import DEFAULT_API_CONNECT_OPTIONS, APIStatusError, stt

from aliyun_stt import STT, SpeechStream


class _EventChannel:
    def __init__(self):
        self.events = []

    def send_nowait(self, event):
        self.events.append(event)


class _FakeWebSocket:
    def __init__(self):
        self.audio_started = False
        self.closed = False
        self.messages = asyncio.Queue()
        self.sent_json = []

    async def close(self):
        self.closed = True

    async def receive(self):
        message = await self.messages.get()
        if json.loads(message.data)["header"]["event"] == "task-started":
            self.audio_started = True
        return message

    async def send_bytes(self, _data):
        assert self.audio_started is True

    async def send_json(self, data):
        self.sent_json.append(data)
        if data["header"]["action"] == "finish-task":
            await self.messages.put(
                SimpleNamespace(
                    data=json.dumps(
                        {
                            "header": {
                                "event": "task-finished",
                                "task_id": data["header"]["task_id"],
                            },
                            "payload": {},
                        }
                    ),
                    type=aiohttp.WSMsgType.TEXT,
                )
            )


class _FakeHttpSession:
    def __init__(self, websocket):
        self.websocket = websocket
        self.ws_connect_calls = []

    async def ws_connect(self, url, *, headers):
        self.ws_connect_calls.append((url, headers))
        return self.websocket


def test_qwen_audio_streaming_is_the_default_aligned_stt():
    recognizer = STT(api_key="test-key")

    assert recognizer._opts.model == "qwen-audio-3.0-asr-flash-streaming"
    assert recognizer.capabilities.streaming is True
    assert recognizer.capabilities.interim_results is True
    assert recognizer.capabilities.aligned_transcript == "word"
    assert recognizer.capabilities.offline_recognize is False
    assert recognizer.model == "qwen-audio-3.0-asr-flash-streaming"
    assert recognizer.provider == "aliyun"


def test_qwen_audio_uses_configured_workspace_endpoint():
    recognizer = STT(
        api_key="test-key",
        base_url="wss://workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
        workspace="workspace",
    )

    assert recognizer._opts.get_ws_url() == (
        "wss://workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference"
    )
    assert recognizer._opts.get_header()["X-DashScope-WorkSpace"] == "workspace"


def test_qwen_audio_request_only_sends_supported_parameters():
    recognizer = STT(api_key="test-key")

    request = recognizer._opts.get_run_task_params("task-id")
    parameters = request["payload"]["parameters"]

    assert request["payload"]["model"] == "qwen-audio-3.0-asr-flash-streaming"
    assert parameters == {
        "format": "pcm",
        "sample_rate": 16000,
        "semantic_punctuation_enabled": False,
        "max_sentence_silence": 1300,
        "heartbeat": True,
        "language_hints": ["zh"],
    }


def test_qwen_audio_events_convert_milliseconds_and_include_timed_words():
    stream = object.__new__(SpeechStream)
    stream._event_ch = _EventChannel()
    stream._language = "zh"
    stream._request_id = "request-id"
    stream._speaking = False

    stream._process_stream_event(
        {
            "header": {"event": "result-generated"},
            "payload": {
                "output": {
                    "sentence": {
                        "begin_time": 170,
                        "end_time": 920,
                        "text": "好，我知道了",
                        "sentence_end": True,
                        "words": [
                            {
                                "begin_time": 170,
                                "end_time": 295,
                                "text": "好",
                                "punctuation": "，",
                            },
                            {
                                "begin_time": 295,
                                "end_time": 920,
                                "text": "我知道了",
                                "punctuation": "",
                            },
                        ],
                    }
                }
            },
        }
    )

    transcript = next(
        event
        for event in stream._event_ch.events
        if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT
    ).alternatives[0]

    assert transcript.start_time == 0.17
    assert transcript.end_time == 0.92
    assert [
        (str(word), word.start_time, word.end_time) for word in transcript.words
    ] == [
        ("好，", 0.17, 0.295),
        ("我知道了", 0.295, 0.92),
    ]


def test_heartbeat_does_not_emit_a_false_start_of_speech():
    stream = object.__new__(SpeechStream)
    stream._event_ch = _EventChannel()
    stream._language = "zh"
    stream._request_id = "request-id"
    stream._speaking = False

    stream._process_stream_event(
        {
            "header": {"event": "result-generated"},
            "payload": {
                "output": {
                    "sentence": {
                        "heartbeat": True,
                        "text": "",
                        "sentence_end": False,
                    }
                }
            },
        }
    )

    assert stream._event_ch.events == []
    assert stream._speaking is False


def test_interim_transcript_accepts_null_sentence_end_time():
    stream = object.__new__(SpeechStream)
    stream._event_ch = _EventChannel()
    stream._language = "zh"
    stream._request_id = "request-id"
    stream._speaking = False

    stream._process_stream_event(
        {
            "header": {"event": "result-generated"},
            "payload": {
                "output": {
                    "sentence": {
                        "begin_time": 170,
                        "end_time": None,
                        "text": "候选人正在回答",
                        "sentence_end": False,
                        "words": [
                            {
                                "begin_time": 170,
                                "end_time": 920,
                                "text": "候选人正在回答",
                                "punctuation": "",
                            }
                        ],
                    }
                }
            },
        }
    )

    transcript = next(
        event
        for event in stream._event_ch.events
        if event.type == stt.SpeechEventType.INTERIM_TRANSCRIPT
    ).alternatives[0]

    assert transcript.start_time == 0.17
    assert transcript.end_time == 0.92


def test_interim_transcript_accepts_null_word_end_time():
    stream = object.__new__(SpeechStream)
    stream._event_ch = _EventChannel()
    stream._language = "zh"
    stream._request_id = "request-id"
    stream._speaking = False

    stream._process_stream_event(
        {
            "header": {"event": "result-generated"},
            "payload": {
                "output": {
                    "sentence": {
                        "begin_time": 170,
                        "end_time": None,
                        "text": "候选人",
                        "sentence_end": False,
                        "words": [
                            {
                                "begin_time": 170,
                                "end_time": None,
                                "text": "候选人",
                                "punctuation": "",
                            }
                        ],
                    }
                }
            },
        }
    )

    transcript = next(
        event
        for event in stream._event_ch.events
        if event.type == stt.SpeechEventType.INTERIM_TRANSCRIPT
    ).alternatives[0]

    assert transcript.start_time == 0.17
    assert transcript.end_time == 0.17
    assert transcript.words[0].start_time == 0.17
    assert transcript.words[0].end_time == 0.17


async def test_stream_resamples_input_to_the_declared_pcm_rate(monkeypatch):
    async def keep_stream_open(_stream):
        await asyncio.Future()

    monkeypatch.setattr(SpeechStream, "_run", keep_stream_open)
    recognizer = STT(api_key="test-key", http_session=object())
    stream = recognizer.stream(conn_options=DEFAULT_API_CONNECT_OPTIONS)

    try:
        assert stream._needed_sr == 16000
    finally:
        await stream.aclose()


async def test_stream_waits_for_task_started_before_sending_audio():
    websocket = _FakeWebSocket()
    session = _FakeHttpSession(websocket)
    recognizer = STT(api_key="test-key", http_session=session)
    stream = recognizer.stream(conn_options=DEFAULT_API_CONNECT_OPTIONS)
    task_id = None

    try:
        while not websocket.sent_json:
            await asyncio.sleep(0)
        task_id = websocket.sent_json[0]["header"]["task_id"]
        stream.push_frame(rtc.AudioFrame.create(16000, 1, 1600))
        stream.end_input()
        await asyncio.sleep(0)
        await websocket.messages.put(
            SimpleNamespace(
                data=json.dumps(
                    {
                        "header": {"event": "task-started", "task_id": task_id},
                        "payload": {},
                    }
                ),
                type=aiohttp.WSMsgType.TEXT,
            )
        )
        await stream._task
    finally:
        await stream.aclose()

    assert task_id is not None
    assert websocket.closed is True
    assert [item["header"]["action"] for item in websocket.sent_json] == [
        "run-task",
        "finish-task",
    ]


def test_task_failed_becomes_a_livekit_api_error():
    stream = object.__new__(SpeechStream)
    stream._event_ch = _EventChannel()
    stream._language = "zh"
    stream._request_id = "request-id"
    stream._speaking = False
    task_started = asyncio.Event()

    with pytest.raises(APIStatusError, match="request timeout") as error:
        stream._process_stream_event(
            {
                "header": {
                    "error_code": "CLIENT_ERROR",
                    "error_message": "request timeout after 23 seconds.",
                    "event": "task-failed",
                    "task_id": "task-id",
                },
                "payload": {},
            },
            task_id="task-id",
            task_started=task_started,
        )

    assert error.value.request_id == "task-id"
    assert error.value.body["error_code"] == "CLIENT_ERROR"
