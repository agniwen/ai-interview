import asyncio

from livekit.agents import DEFAULT_API_CONNECT_OPTIONS, stt

from aliyun_stt import STT, SpeechStream


class _EventChannel:
    def __init__(self):
        self.events = []

    def send_nowait(self, event):
        self.events.append(event)


def test_qwen_audio_streaming_is_the_default_aligned_stt():
    recognizer = STT(api_key="test-key")

    assert recognizer._opts.model == "qwen-audio-3.0-asr-flash-streaming"
    assert recognizer.capabilities.streaming is True
    assert recognizer.capabilities.interim_results is True
    assert recognizer.capabilities.aligned_transcript == "word"
    assert recognizer.capabilities.offline_recognize is False


def test_qwen_audio_request_only_sends_supported_parameters():
    recognizer = STT(api_key="test-key", max_sentence_silence=1000)

    request = recognizer._opts.get_run_task_params("task-id")
    parameters = request["payload"]["parameters"]

    assert request["payload"]["model"] == "qwen-audio-3.0-asr-flash-streaming"
    assert parameters == {
        "format": "pcm",
        "sample_rate": 16000,
        "semantic_punctuation_enabled": False,
        "max_sentence_silence": 1000,
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
