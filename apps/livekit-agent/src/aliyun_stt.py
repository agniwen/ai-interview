"""Aliyun DashScope streaming STT plugin for LiveKit Agents.

Adapted from livekit-plugins-aliyun v1.3.0 (by wangmengdi)
to work with livekit-agents >= 1.5.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass

import aiohttp
from livekit import rtc
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
    stt,
    utils,
)
from livekit.agents.language import LanguageCode
from livekit.agents.types import NOT_GIVEN, NotGivenOr, TimedString

logger = logging.getLogger("aliyun-stt")

DEFAULT_MODEL = "qwen-audio-3.0-asr-flash-streaming"
DEFAULT_BASE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"


def _milliseconds_to_seconds(value: int | float | None, *, default: float = 0.0):
    if value is None:
        return default
    return value / 1000


def _to_timed_word(word: dict) -> TimedString:
    start_time = _milliseconds_to_seconds(word.get("begin_time"))
    end_time = _milliseconds_to_seconds(
        word.get("end_time"),
        default=start_time,
    )
    return TimedString(
        f"{word.get('text', '')}{word.get('punctuation', '')}",
        start_time=start_time,
        end_time=end_time,
        start_time_offset=0.0,
    )


@dataclass
class STTOptions:
    api_key: str | None
    base_url: str
    language: str | None
    detect_language: bool
    interim_results: bool
    punctuate: bool
    model: str
    max_sentence_silence: int = 1300
    sample_rate: int = 16000
    workspace: str | None = None
    vocabulary_id: str | None = None
    disfluency_removal_enabled: bool = False
    semantic_punctuation_enabled: bool = False
    punctuation_prediction_enabled: bool = True
    inverse_text_normalization_enabled: bool = True

    def get_ws_url(self):
        return self.base_url

    def get_header(self):
        header = {
            "Authorization": f"Bearer {self.api_key}",
            "X-DashScope-DataInspection": "enable",
        }
        if self.workspace is not None:
            header["X-DashScope-WorkSpace"] = self.workspace
        return header

    def get_run_task_params(self, task_id: str):
        parameters = {
            "format": "pcm",
            "sample_rate": self.sample_rate,
            "semantic_punctuation_enabled": self.semantic_punctuation_enabled,
            "max_sentence_silence": self.max_sentence_silence,
            "heartbeat": True,
            "language_hints": [self.language],
        }
        if self.vocabulary_id is not None:
            parameters["vocabulary_id"] = self.vocabulary_id

        # These parameters belong to the older Paraformer API and are not part
        # of Qwen-Audio-3.0-ASR-Flash-Streaming's documented request schema.
        if not self.model.startswith("qwen-audio-3.0-asr-flash"):
            parameters.update(
                {
                    "disfluency_removal_enabled": self.disfluency_removal_enabled,
                    "punctuation_prediction_enabled": self.punctuation_prediction_enabled,
                    "inverse_text_normalization_enabled": self.inverse_text_normalization_enabled,
                }
            )

        return {
            "header": {
                "action": "run-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "model": self.model,
                "parameters": parameters,
                "input": {},
            },
        }

    def get_finish_task_params(self, task_id: str):
        return {
            "header": {
                "action": "finish-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {"input": {}},
        }


class STT(stt.STT):
    def __init__(
        self,
        *,
        language="zh",
        detect_language: bool = False,
        interim_results: bool = True,
        punctuate: bool = True,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        base_url: str | None = None,
        max_sentence_silence: int = 1300,
        disfluency_removal_enabled: bool = False,
        semantic_punctuation_enabled: bool = False,
        punctuation_prediction_enabled: bool = True,
        inverse_text_normalization_enabled: bool = True,
        vocabulary_id: str | None = None,
        workspace: str | None = None,
        http_session: aiohttp.ClientSession | None = None,
    ) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True,
                interim_results=interim_results,
                aligned_transcript="word",
                offline_recognize=False,
            )
        )
        api_key = api_key or os.environ.get("DASHSCOPE_API_KEY")
        if api_key is None:
            raise ValueError("DASHSCOPE_API_KEY is required")
        self._opts = STTOptions(
            api_key=api_key,
            base_url=base_url or DEFAULT_BASE_URL,
            language=language,
            detect_language=detect_language,
            interim_results=interim_results,
            punctuate=punctuate,
            model=model,
            max_sentence_silence=max_sentence_silence,
            disfluency_removal_enabled=disfluency_removal_enabled,
            semantic_punctuation_enabled=semantic_punctuation_enabled,
            punctuation_prediction_enabled=punctuation_prediction_enabled,
            inverse_text_normalization_enabled=inverse_text_normalization_enabled,
            vocabulary_id=vocabulary_id,
            workspace=workspace,
        )
        self._session = http_session

    @property
    def model(self) -> str:
        return self._opts.model

    @property
    def provider(self) -> str:
        return "aliyun"

    def _ensure_session(self) -> aiohttp.ClientSession:
        if not self._session:
            self._session = utils.http_context.http_session()
        return self._session

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        raise NotImplementedError("recognize is not supported, use stream() instead")

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> SpeechStream:
        # 基类用 NotGivenOr[str] 区分"未传"与"显式 None"，覆写需对齐 LSP。  # noqa: RUF003
        # 实际生效的语言始终来自 self._opts.language（在 __init__ 中校验非空）。  # noqa: RUF003
        # Match base-class signature (NotGivenOr[str]) for LSP compatibility;
        # the effective language is taken from self._opts.language, which is
        # validated as non-None in SpeechStream.__init__.
        return SpeechStream(
            stt=self,
            opts=self._opts,
            conn_options=conn_options,
            http_session=self._ensure_session(),
        )


class SpeechStream(stt.SpeechStream):
    def __init__(
        self,
        stt: STT,
        opts: STTOptions,
        conn_options: APIConnectOptions,
        http_session: aiohttp.ClientSession,
    ) -> None:
        super().__init__(
            stt=stt,
            conn_options=conn_options,
            sample_rate=opts.sample_rate,
        )
        if opts.language is None:
            raise ValueError("language detection is not supported in streaming mode")
        self._opts = opts
        # 把已校验的非空语言包成 LanguageCode，避免下游 SpeechData 收到 str | None。  # noqa: RUF003
        # Wrap the validated language in LanguageCode so downstream SpeechData
        # calls get a concrete LanguageCode instead of `str | None`.
        self._language: LanguageCode = LanguageCode(opts.language)
        self._speaking = False
        self._request_id = utils.shortuuid()
        self._session = http_session

    async def _connect_ws(self) -> aiohttp.ClientWebSocketResponse:
        try:
            ws = await asyncio.wait_for(
                self._session.ws_connect(
                    self._opts.get_ws_url(), headers=self._opts.get_header()
                ),
                self._conn_options.timeout,
            )
        except TimeoutError as error:
            raise APITimeoutError("DashScope STT connection timed out") from error
        except aiohttp.ClientError as error:
            raise APIConnectionError(
                f"DashScope STT connection failed: {type(error).__name__}"
            ) from error
        logger.info("connected to DashScope STT websocket")
        return ws

    async def _run(self) -> None:
        task_id = utils.shortuuid()
        task_started = asyncio.Event()

        @utils.log_exceptions(logger=logger)
        async def send_task(ws: aiohttp.ClientWebSocketResponse):
            try:
                await asyncio.wait_for(
                    task_started.wait(),
                    timeout=self._conn_options.timeout,
                )
            except TimeoutError as error:
                raise APITimeoutError(
                    "DashScope STT did not acknowledge task start"
                ) from error

            samples_100ms = self._opts.sample_rate // 10
            audio_bstream = utils.audio.AudioByteStream(
                sample_rate=self._opts.sample_rate,
                num_channels=1,
                samples_per_channel=samples_100ms,
            )

            has_ended = False
            async for data in self._input_ch:
                frames: list[rtc.AudioFrame] = []
                if isinstance(data, rtc.AudioFrame):
                    frames.extend(audio_bstream.write(data.data.tobytes()))
                elif isinstance(data, self._FlushSentinel):
                    frames.extend(audio_bstream.flush())
                    has_ended = True

                for frame in frames:
                    await ws.send_bytes(frame.data.tobytes())

                if has_ended:
                    await ws.send_json(self._opts.get_finish_task_params(task_id))
                    has_ended = False

        @utils.log_exceptions(logger=logger)
        async def recv_task(ws: aiohttp.ClientWebSocketResponse):
            while True:
                msg = await ws.receive()
                if msg.type in (
                    aiohttp.WSMsgType.CLOSED,
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSING,
                ):
                    raise APIConnectionError(
                        "DashScope STT connection closed unexpectedly"
                    )
                if msg.type == aiohttp.WSMsgType.ERROR:
                    raise APIConnectionError("DashScope STT WebSocket failed")
                if msg.type != aiohttp.WSMsgType.TEXT:
                    continue

                try:
                    finished = self._process_stream_event(
                        json.loads(msg.data),
                        task_id=task_id,
                        task_started=task_started,
                    )
                except APIStatusError:
                    raise
                except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                    logger.exception("failed to process STT message")
                    continue
                if finished:
                    return

        ws: aiohttp.ClientWebSocketResponse | None = None
        tasks: list[asyncio.Task] = []
        try:
            ws = await self._connect_ws()
            await ws.send_json(self._opts.get_run_task_params(task_id=task_id))
            tasks = [
                asyncio.create_task(send_task(ws)),
                asyncio.create_task(recv_task(ws)),
            ]
            await asyncio.gather(*tasks)
        except aiohttp.ClientError as error:
            raise APIConnectionError(
                f"DashScope STT WebSocket failed: {type(error).__name__}"
            ) from error
        finally:
            await utils.aio.gracefully_cancel(*tasks)
            if ws is not None:
                await ws.close()

    def _process_stream_event(
        self,
        data: dict,
        *,
        task_id: str | None = None,
        task_started: asyncio.Event | None = None,
    ) -> bool:
        header = data["header"]
        if task_id is not None and header.get("task_id") != task_id:
            return False

        event_type = header["event"]
        if event_type == "task-started":
            if task_started is not None:
                task_started.set()
            return False
        if event_type == "task-failed":
            error_code = header.get("error_code", "UNKNOWN")
            error_message = header.get("error_message", "DashScope STT task failed")
            raise APIStatusError(
                message=f"DashScope STT task failed: {error_message}",
                request_id=header.get("task_id"),
                body={"error_code": error_code, "error_message": error_message},
            )
        if event_type == "task-finished":
            return True
        if event_type != "result-generated":
            return False

        output = data["payload"]["output"]

        # Gummy models return data in "transcription", Paraformer uses "sentence"
        transcript = output.get("transcription") or output.get("sentence", output)
        is_sentence_end = transcript.get("sentence_end", False)
        # Gummy returns sentence_end as string "true"/"false"
        if isinstance(is_sentence_end, str):
            is_sentence_end = is_sentence_end.lower() == "true"
        text = transcript.get("text", "")
        if not text:
            return

        words = [
            _to_timed_word(word)
            for word in transcript.get("words", [])
            if word.get("text")
        ]
        start_time = _milliseconds_to_seconds(transcript.get("begin_time"))
        end_time = _milliseconds_to_seconds(
            transcript.get("end_time"),
            default=start_time,
        )
        if words:
            start_time = words[0].start_time
            end_time = words[-1].end_time

        if not self._speaking:
            self._event_ch.send_nowait(
                stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
            )
            self._speaking = True

        if text and not is_sentence_end:
            self._event_ch.send_nowait(
                stt.SpeechEvent(
                    type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
                    request_id=self._request_id,
                    alternatives=[
                        stt.SpeechData(
                            language=self._language,
                            text=text,
                            start_time=start_time,
                            end_time=end_time,
                            words=words or None,
                        )
                    ],
                )
            )

        if text and is_sentence_end:
            self._event_ch.send_nowait(
                stt.SpeechEvent(
                    type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                    request_id=self._request_id,
                    alternatives=[
                        stt.SpeechData(
                            language=self._language,
                            text=text,
                            start_time=start_time,
                            end_time=end_time,
                            words=words or None,
                        )
                    ],
                )
            )
            self._event_ch.send_nowait(
                stt.SpeechEvent(
                    type=stt.SpeechEventType.END_OF_SPEECH,
                    request_id=self._request_id,
                )
            )
            self._speaking = False
            logger.info("transcription: %s", text)

        return False
