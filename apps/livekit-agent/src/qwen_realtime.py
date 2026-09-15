"""Qwen Audio 3.0 Realtime transport for LiveKit Agents 1.7.

Protocol: https://help.aliyun.com/zh/model-studio/fun-audiochat-client-events
Events: https://help.aliyun.com/zh/model-studio/qwen-audio-realtime-server-events
SDK: https://github.com/livekit/agents/blob/main/livekit-agents/livekit/agents/llm/realtime.py

The adapter only translates protocol events. LiveKit executes tools; application
tools own interview state. A lost connection fails closed instead of replaying
possibly executed tools or silently discarding unacknowledged candidate audio.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import os
import time
from dataclasses import dataclass, field, replace
from typing import Any, Literal

import aiohttp
from livekit import rtc
from livekit.agents import llm, utils
from livekit.agents.metrics import RealtimeModelMetrics
from livekit.agents.metrics.base import Metadata
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from yarl import URL

INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000
DEFAULT_MODEL = "qwen-audio-3.0-realtime-plus"
DEFAULT_BASE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"


def _inline_schema_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Expose nested Pydantic fields directly to Qwen's tool argument generator."""

    def expand(value, seen: frozenset[str]):
        if isinstance(value, list):
            return [expand(item, seen) for item in value]
        if not isinstance(value, dict):
            return value
        ref = value.get("$ref")
        if ref is not None:
            if not isinstance(ref, str) or not ref.startswith("#/") or ref in seen:
                raise ValueError(
                    "Qwen tools require finite, local JSON schema references"
                )
            resolved = schema
            try:
                for part in ref[2:].split("/"):
                    resolved = resolved[part.replace("~1", "/").replace("~0", "~")]
            except (KeyError, TypeError):
                raise ValueError("Unresolved Qwen tool schema reference") from None
            siblings = {key: item for key, item in value.items() if key != "$ref"}
            return {**expand(resolved, seen | {ref}), **expand(siblings, seen)}
        return {
            key: expand(item, seen)
            for key, item in value.items()
            if key not in {"$defs", "definitions"}
        }

    return expand(schema, frozenset())


def _tool_schema(tool: llm.Tool) -> dict[str, Any]:
    if isinstance(tool, llm.FunctionTool):
        result = llm.utils.build_legacy_openai_schema(tool, internally_tagged=False)
    elif isinstance(tool, llm.RawFunctionTool):
        schema = dict(tool.info.raw_schema)
        schema.pop("type", None)
        schema.pop("meta", None)
        result = {"type": "function", "function": schema}
    else:
        raise ValueError("Qwen Realtime only supports function tools")
    if "parameters" in result["function"]:
        result["function"]["parameters"] = _inline_schema_refs(
            result["function"]["parameters"]
        )
    return result


def _wire_item(item: llm.ChatItem) -> dict[str, Any] | None:
    if isinstance(item, llm.ChatMessage):
        if any(not isinstance(part, str) for part in item.content):
            raise ValueError(
                "Use push_audio for audio; Qwen history synchronization accepts text only"
            )
        if not item.text_content:
            return None
        role = "system" if item.role == "developer" else item.role
        return {
            "id": item.id,
            "type": "message",
            "role": role,
            "content": [
                {
                    "type": "output_text" if role == "assistant" else "input_text",
                    "text": item.text_content,
                }
            ],
        }
    if isinstance(item, llm.FunctionCall):
        return {
            "id": item.id,
            "type": "function_call",
            "call_id": item.call_id,
            "name": item.name,
            "arguments": item.arguments,
        }
    if isinstance(item, llm.FunctionCallOutput):
        return {
            "id": item.id,
            "type": "function_call_output",
            "call_id": item.call_id,
            "output": item.output,
        }
    # Agent handoff/configuration events belong to LiveKit's history, not Qwen.
    return None


@dataclass
class _Message:
    id: str
    text: utils.aio.Chan[str] = field(default_factory=utils.aio.Chan)
    audio: utils.aio.Chan[rtc.AudioFrame] = field(default_factory=utils.aio.Chan)
    modalities: asyncio.Future = field(
        default_factory=lambda: asyncio.get_running_loop().create_future()
    )
    transcript: str = ""
    pcm: bytearray = field(default_factory=bytearray)

    def close(self) -> None:
        if not self.modalities.done():
            self.modalities.set_result(["text"])
        self.text.close()
        self.audio.close()


@dataclass
class _Response:
    id: str
    messages: utils.aio.Chan[llm.MessageGeneration] = field(
        default_factory=utils.aio.Chan
    )
    functions: utils.aio.Chan[llm.FunctionCall] = field(default_factory=utils.aio.Chan)
    items: dict[str, _Message] = field(default_factory=dict)
    calls: set[str] = field(default_factory=set)
    started: float = field(default_factory=time.time)
    first_token: float | None = None
    cancelled: bool = False
    watchdog: asyncio.Task | None = None

    def close(self) -> None:
        if self.watchdog is not None and self.watchdog is not asyncio.current_task():
            self.watchdog.cancel()
        for message in self.items.values():
            message.close()
        self.messages.close()
        self.functions.close()


class RealtimeModel(llm.RealtimeModel):
    def __init__(
        self,
        *,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        workspace: str | None = None,
        voice: str = "longanlingxin",
        turn_detection: Literal["smart_turn", "server_vad"] | None = "smart_turn",
        silence_duration_ms: int = 1000,
        max_history_turns: int = 20,
        request_timeout: float = 15.0,
        response_timeout: float = 120.0,
        http_session: aiohttp.ClientSession | None = None,
    ) -> None:
        if not (api_key or os.environ.get("DASHSCOPE_API_KEY")):
            raise ValueError("DASHSCOPE_API_KEY is required for Qwen Realtime")
        if URL(base_url).scheme != "wss":
            raise ValueError("Qwen Realtime base_url must use wss://")
        if turn_detection not in ("smart_turn", "server_vad", None):
            raise ValueError("Invalid Qwen turn_detection")
        if not 1 <= max_history_turns <= 50 or not 200 <= silence_duration_ms <= 6000:
            raise ValueError("Invalid Qwen history or silence limit")
        if request_timeout <= 0 or response_timeout <= 0:
            raise ValueError("Qwen timeouts must be positive")
        super().__init__(
            capabilities=llm.RealtimeCapabilities(
                message_truncation=False,
                turn_detection=turn_detection is not None,
                user_transcription=True,
                auto_tool_reply_generation=False,
                audio_output=True,
                manual_function_calls=True,
                can_disable_turn_detection=True,
                mutable_chat_context=True,
                mutable_instructions=True,
                mutable_tools=True,
            )
        )
        self._model = model
        self._api_key = api_key or os.environ["DASHSCOPE_API_KEY"]
        self._url = URL(base_url).update_query(model=model)
        self._workspace = workspace
        self._voice = voice
        self._turn_detection = turn_detection
        self._silence = silence_duration_ms
        self._history_turns = max_history_turns
        self._timeout = request_timeout
        self._response_timeout = response_timeout
        self._http = http_session
        self._sessions: set[RealtimeSession] = set()

    @classmethod
    def from_env(cls) -> RealtimeModel:
        """Read only the owning agent process's environment."""
        return cls(
            model=os.getenv("DASHSCOPE_REALTIME_MODEL") or DEFAULT_MODEL,
            base_url=os.getenv("DASHSCOPE_REALTIME_BASE_URL") or DEFAULT_BASE_URL,
            workspace=os.getenv("DASHSCOPE_WORKSPACE_ID") or None,
            voice=os.getenv("DASHSCOPE_REALTIME_VOICE") or "longanlingxin",
            turn_detection=os.getenv("DASHSCOPE_REALTIME_TURN_DETECTION")
            or "smart_turn",
        )

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "aliyun"

    def session(self, *, turn_detection_disabled: bool = False) -> RealtimeSession:
        session = RealtimeSession(
            self, manual=turn_detection_disabled or self._turn_detection is None
        )
        self._sessions.add(session)
        return session

    async def aclose(self) -> None:
        await asyncio.gather(*(session.aclose() for session in tuple(self._sessions)))


class RealtimeSession(llm.RealtimeSession):
    def __init__(self, model: RealtimeModel, *, manual: bool) -> None:
        super().__init__(model)
        self._model = model
        self._manual = manual
        self._chat = llm.ChatContext.empty()
        self._tools = llm.ToolContext.empty()
        self._tool_choice: str = "auto"
        self._tool_update_task: asyncio.Task | None = None
        self._ready = asyncio.get_running_loop().create_future()
        # A session may fail before its first consumer awaits initialization.
        self._ready.add_done_callback(
            lambda f: f.exception() if not f.cancelled() else None
        )
        self._outgoing: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=500)
        self._acks: dict[tuple[str, str], asyncio.Future] = {}
        self._config_lock = asyncio.Lock()
        self._chat_lock = asyncio.Lock()
        self._reply_lock = asyncio.Lock()
        self._idle = asyncio.Event()
        self._idle.set()
        self._response: _Response | None = None
        self._pending_reply: asyncio.Future | None = None
        self._reply_requested = False
        self._cancel_before_created = False
        self._cancel_requested = False
        self._temporary_instructions: str | None = None
        self._bootstrap_item: str | None = None
        self._speech_started: dict[str, float] = {}
        self._transcripts: dict[str, str] = {}
        self._invalid_turns: set[str] = set()
        self._resampler: rtc.AudioResampler | None = None
        self._input_rate: int | None = None
        self._input_buffer = utils.audio.AudioByteStream(
            sample_rate=INPUT_SAMPLE_RATE, num_channels=1, samples_per_channel=320
        )
        self._has_audio = False
        self._closed = False
        self._failure: llm.RealtimeError | None = None
        self._background: set[asyncio.Task] = set()
        self._main = asyncio.create_task(self._run(), name="qwen-realtime")

    @property
    def capabilities(self) -> llm.RealtimeCapabilities:
        return replace(self._model.capabilities, turn_detection=not self._manual)

    @property
    def chat_ctx(self) -> llm.ChatContext:
        return self._chat.copy()

    @property
    def tools(self) -> llm.ToolContext:
        return self._tools.copy()

    def _spawn(self, coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        self._background.add(task)

        def finished(done: asyncio.Task) -> None:
            self._background.discard(done)
            if not done.cancelled():
                error = done.exception()
                if error is not None and not self._closed:
                    self._fail(
                        error
                        if isinstance(error, llm.RealtimeError)
                        else llm.RealtimeError(
                            f"Qwen Realtime operation failed ({type(error).__name__})"
                        )
                    )

        task.add_done_callback(finished)
        return task

    def _enqueue(self, event: dict[str, Any]) -> None:
        if self._failure:
            raise self._failure
        if self._closed:
            raise llm.RealtimeError("Qwen Realtime session is closed")
        try:
            self._outgoing.put_nowait(event)
        except asyncio.QueueFull:
            error = llm.RealtimeError("Qwen Realtime send queue overflow")
            self._fail(error)
            self._main.cancel()
            raise error from None

    async def _request(
        self, event: dict[str, Any], ack: str, item_id: str = ""
    ) -> None:
        key = (ack, item_id)
        future = asyncio.get_running_loop().create_future()
        self._acks[key] = future
        try:
            self._enqueue(event)
            await asyncio.wait_for(future, timeout=self._model._timeout)
        except asyncio.TimeoutError:
            error = llm.RealtimeError(f"Qwen Realtime acknowledgement timed out: {ack}")
            self._fail(error)
            self._main.cancel()
            raise error from None
        finally:
            self._acks.pop(key, None)

    async def _run(self) -> None:
        http = self._model._http or aiohttp.ClientSession()
        socket = None
        tasks = []
        try:
            headers = {"Authorization": f"Bearer {self._model._api_key}"}
            if self._model._workspace:
                headers["X-DashScope-WorkSpace"] = self._model._workspace
            started = time.monotonic()
            socket = await asyncio.wait_for(
                http.ws_connect(self._model._url, headers=headers, heartbeat=20),
                self._model._timeout,
            )
            first = await asyncio.wait_for(socket.receive(), self._model._timeout)
            if (
                first.type != aiohttp.WSMsgType.TEXT
                or json.loads(first.data).get("type") != "session.created"
            ):
                raise llm.RealtimeError("Qwen Realtime did not send session.created")
            tasks = [
                asyncio.create_task(self._send(socket)),
                asyncio.create_task(self._receive(socket)),
            ]
            config = {
                "modalities": ["text", "audio"],
                "voice": self._model._voice,
                "enable_speech_emotion": False,
                "input_audio_format": "pcm",
                "output_audio_format": "pcm",
                "max_history_turns": self._model._history_turns,
                "turn_detection": None
                if self._manual
                else {"type": self._model._turn_detection},
            }
            if self._model._turn_detection == "server_vad" and not self._manual:
                config["turn_detection"]["silence_duration_ms"] = self._model._silence
            # Send initialization directly: queued microphone frames must not
            # race the first session.update (voice/turn mode are immutable later).
            future = asyncio.get_running_loop().create_future()
            self._acks[("session.updated", "")] = future
            await socket.send_json({"type": "session.update", "session": config})
            await asyncio.wait_for(future, self._model._timeout)
            self._acks.pop(("session.updated", ""), None)
            self._ready.set_result(None)
            self._report_connection_acquired(time.monotonic() - started)
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass
        except Exception as error:
            # Do not include provider payloads, headers or user content in errors.
            status = getattr(error, "status", None)
            safe = (
                error
                if isinstance(error, llm.RealtimeError)
                else llm.RealtimeError(
                    f"Qwen Realtime connection failed ({type(error).__name__}{f', HTTP {status}' if status else ''})"
                )
            )
            self._fail(safe)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            if socket is not None:
                await socket.close()
            if self._model._http is None:
                await http.close()
            if not self._closed and self._failure is None:
                self._fail(llm.RealtimeError("Qwen Realtime connection closed"))

    async def _send(self, socket) -> None:
        await self._ready
        while True:
            await socket.send_json(await self._outgoing.get())

    async def _receive(self, socket) -> None:
        while True:
            message = await socket.receive()
            if message.type == aiohttp.WSMsgType.TEXT:
                self._handle_event(json.loads(message.data))
            elif message.type in (
                aiohttp.WSMsgType.CLOSE,
                aiohttp.WSMsgType.CLOSED,
                aiohttp.WSMsgType.ERROR,
            ):
                raise llm.RealtimeError(
                    "Qwen Realtime WebSocket disconnected; tool execution was not replayed"
                )

    def _fail(self, error: llm.RealtimeError) -> None:
        if self._failure is not None:
            return
        self._failure = error
        for future in [self._ready, self._pending_reply, *self._acks.values()]:
            if future is not None and not future.done():
                future.set_exception(error)
        if self._response:
            self._response.close()
        self._idle.set()
        self.emit(
            "error",
            llm.RealtimeModelError(
                timestamp=time.time(),
                label=self._model.label,
                error=error,
                recoverable=False,
            ),
        )
        if asyncio.current_task() is not self._main:
            self._main.cancel()

    async def update_instructions(self, instructions: str) -> None:
        await self._ready
        async with self._config_lock:
            await self._request(
                {"type": "session.update", "session": {"instructions": instructions}},
                "session.updated",
            )

    async def update_tools(self, tools: list[llm.Tool]) -> None:
        schemas = [_tool_schema(tool) for tool in tools]
        await self._ready
        async with self._config_lock:
            await self._request(
                {
                    "type": "session.update",
                    "session": {
                        "tools": schemas if self._tool_choice == "auto" else []
                    },
                },
                "session.updated",
            )
            self._tools = llm.ToolContext(tools)

    def update_options(
        self, *, tool_choice: NotGivenOr[llm.ToolChoice | None] = NOT_GIVEN
    ) -> None:
        if not utils.is_given(tool_choice):
            return
        if tool_choice not in (None, "auto", "none"):
            raise ValueError(
                "Qwen Realtime does not support required or named tool_choice"
            )
        choice = tool_choice or "auto"
        if choice != self._tool_choice:
            self._tool_choice = choice
            self._tool_update_task = self._spawn(self._sync_tool_choice())

    async def _sync_tool_choice(self) -> None:
        await self._ready
        async with self._config_lock:
            await self._request(
                {
                    "type": "session.update",
                    "session": {
                        "tools": [_tool_schema(t) for t in self._tools.flatten()]
                        if self._tool_choice == "auto"
                        else []
                    },
                },
                "session.updated",
            )

    async def update_chat_ctx(self, chat_ctx: llm.ChatContext) -> None:
        await self._ready
        async with self._chat_lock:
            # Validate the entire change before applying the first mutation.
            desired = {item.id: (item, _wire_item(item)) for item in chat_ctx.items}
            desired = {
                key: value
                for key, value in desired.items()
                if value[1] is not None or self._chat.get_by_id(key) is not None
            }
            current = {item.id: item for item in self._chat.items}
            removals = [
                item_id
                for item_id in current
                if item_id not in desired
                or (
                    desired[item_id][1] is not None
                    and _wire_item(current[item_id]) != desired[item_id][1]
                )
            ]
            retained = [item_id for item_id in current if item_id not in removals]
            desired_ids = list(desired)
            # Preflight before deletes: Qwen does not document the OpenAI 'root'
            # insertion sentinel. Reject unsupported reorder/prepend atomically.
            if retained and (
                desired_ids[0] != retained[0]
                or [item_id for item_id in desired_ids if item_id in retained]
                != retained
            ):
                raise llm.RealtimeError(
                    "Qwen history prepend/reorder requires a new session"
                )
            for item_id in list(current):
                if item_id in removals:
                    await self._request(
                        {"type": "conversation.item.delete", "item_id": item_id},
                        "conversation.item.deleted",
                        item_id,
                    )
            previous = None
            for item_id, (_, wire) in desired.items():
                if self._chat.get_by_id(item_id) is None and wire is not None:
                    event = {"type": "conversation.item.create", "item": wire}
                    if previous is not None:
                        event["previous_item_id"] = previous
                    elif self._chat.items:
                        # The Qwen docs don't define OpenAI's special 'root' ID.
                        raise llm.RealtimeError(
                            "Qwen cannot prepend history without rebuilding the session"
                        )
                    await self._request(event, "conversation.item.created", item_id)
                previous = item_id

    def _store_item(self, item: llm.ChatItem, previous: str | None = None) -> None:
        for index, current in enumerate(self._chat.items):
            if current.id == item.id:
                self._chat.items[index] = item
                return
        index = next(
            (
                i + 1
                for i, current in enumerate(self._chat.items)
                if current.id == previous
            ),
            len(self._chat.items),
        )
        self._chat.items.insert(index, item)

    def push_audio(self, frame: rtc.AudioFrame) -> None:
        if frame.num_channels != 1:
            raise ValueError("Qwen Realtime requires mono microphone audio")
        if self._input_rate != frame.sample_rate:
            if self._input_rate is not None:
                raise ValueError(
                    "Microphone sample rate cannot change within a Qwen session"
                )
            self._input_rate = frame.sample_rate
            if frame.sample_rate != INPUT_SAMPLE_RATE:
                self._resampler = rtc.AudioResampler(
                    frame.sample_rate, INPUT_SAMPLE_RATE, num_channels=1
                )
        for chunk in self._resampler.push(frame) if self._resampler else [frame]:
            for packet in self._input_buffer.write(chunk.data.tobytes()):
                self._append_audio(packet)

    def _append_audio(self, frame: rtc.AudioFrame) -> None:
        self._has_audio = True
        self._enqueue(
            {
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(frame.data).decode("ascii"),
            }
        )

    def push_video(self, frame: rtc.VideoFrame) -> None:
        raise NotImplementedError("Qwen Audio Realtime does not support video")

    def commit_audio(self) -> None:
        if self._manual:
            if self._resampler:
                for frame in self._resampler.flush():
                    for packet in self._input_buffer.write(frame.data.tobytes()):
                        self._append_audio(packet)
            for packet in self._input_buffer.flush():
                self._append_audio(packet)
            if self._has_audio:
                self._enqueue({"type": "input_audio_buffer.commit"})
                self._has_audio = False

    def clear_audio(self) -> None:
        if self._manual:
            self._input_buffer = utils.audio.AudioByteStream(
                sample_rate=INPUT_SAMPLE_RATE, num_channels=1, samples_per_channel=320
            )
            self._resampler = None
            self._input_rate = None
            self._has_audio = False
            self._enqueue({"type": "input_audio_buffer.clear"})

    def generate_reply(
        self,
        *,
        instructions: NotGivenOr[str] = NOT_GIVEN,
        tool_choice: NotGivenOr[llm.ToolChoice] = NOT_GIVEN,
        tools: NotGivenOr[list[llm.Tool]] = NOT_GIVEN,
    ) -> asyncio.Future[llm.GenerationCreatedEvent]:
        return self._spawn(self._generate_reply(instructions, tool_choice, tools))

    async def _generate_reply(
        self, instructions, tool_choice, tools
    ) -> llm.GenerationCreatedEvent:
        await self._ready
        async with self._reply_lock:
            try:
                await asyncio.wait_for(self._idle.wait(), self._model._timeout)
                if self._failure:
                    raise self._failure
                self.update_options(tool_choice=tool_choice)
                if utils.is_given(tools):
                    await self.update_tools(tools)
                # Await a pending synchronous update_options change, without
                # adding an extra provider round trip to every normal reply.
                if self._tool_update_task is not None:
                    task = self._tool_update_task
                    await asyncio.shield(task)
                    if self._tool_update_task is task:
                        self._tool_update_task = None
                # Qwen rejects response.create until a user message exists.
                # This transport-only signal permits Agent.on_enter greetings;
                # it must never appear as a candidate answer in LiveKit history.
                async with self._chat_lock:
                    if not any(
                        isinstance(item, llm.ChatMessage) and item.role == "user"
                        for item in self._chat.items
                    ):
                        bootstrap = llm.ChatMessage(
                            role="user",
                            content=[
                                "[系统启动信号，不是候选人回答] 请按系统指令以面试官身份开始或继续发言；"
                                "候选人尚未提供回答，不要替候选人编造信息。"
                            ],
                        )
                        self._bootstrap_item = bootstrap.id
                        await self._request(
                            {
                                "type": "conversation.item.create",
                                "item": _wire_item(bootstrap),
                            },
                            "conversation.item.created",
                            bootstrap.id,
                        )
                if utils.is_given(instructions) and instructions:
                    item = llm.ChatMessage(role="system", content=[instructions])
                    await self._request(
                        {"type": "conversation.item.create", "item": _wire_item(item)},
                        "conversation.item.created",
                        item.id,
                    )
                    self._temporary_instructions = item.id
                future = asyncio.get_running_loop().create_future()
                self._pending_reply = future
                self._reply_requested = True
                self._cancel_before_created = False
                self._idle.clear()
                self._enqueue({"type": "response.create"})
                return await asyncio.wait_for(future, self._model._timeout)
            except asyncio.TimeoutError:
                error = llm.RealtimeError("Qwen Realtime response creation timed out")
                self._fail(error)
                self._main.cancel()
                raise error from None
            finally:
                if self._reply_requested:
                    self._cancel_before_created = True
                self._pending_reply = None

    def interrupt(self) -> None:
        if self._reply_requested:
            self._cancel_before_created = True
        if self._response is not None and not self._response.cancelled:
            self._response.cancelled = True
            self._cancel_requested = True
            self._enqueue({"type": "response.cancel"})

    def truncate(
        self,
        *,
        message_id: str,
        modalities: list[Literal["text", "audio"]],
        audio_end_ms: int,
        audio_transcript: NotGivenOr[str] = NOT_GIVEN,
    ) -> None:
        raise NotImplementedError("Qwen has no documented audio-history truncation API")

    def _message(self, item_id: str) -> _Message:
        response = self._response
        assert response is not None
        if item_id not in response.items:
            message = _Message(item_id)
            response.items[item_id] = message
            response.messages.send_nowait(
                llm.MessageGeneration(
                    message_id=item_id,
                    text_stream=message.text,
                    audio_stream=message.audio,
                    modalities=message.modalities,
                )
            )
        return response.items[item_id]

    def _function(self, item: dict[str, Any]) -> None:
        response = self._response
        if response is None or response.cancelled or item["call_id"] in response.calls:
            return
        call = llm.FunctionCall(
            id=item.get("id") or item["item_id"],
            call_id=item["call_id"],
            name=item["name"],
            arguments=item["arguments"],
        )
        response.calls.add(call.call_id)
        self._store_item(call)
        response.functions.send_nowait(call)

    def _handle_event(self, event: dict[str, Any]) -> None:
        kind = event["type"]
        item_id = event.get("item_id", "")
        if kind == "error":
            detail = event.get("error", {})
            code = str(detail.get("code", "unknown"))
            # VAD may cancel the same response just before our cancel arrives.
            # Ignore only the documented idle-cancel rejection, never other
            # configuration/tool errors with the same generic invalid_value code.
            if (
                self._cancel_requested
                and detail.get("param") == "response.cancel"
                and code == "invalid_value"
            ):
                self._cancel_requested = False
                return
            # Without a reliable request correlation ID, continuing could apply
            # a tool result or configuration to the wrong request.
            raise llm.RealtimeError(
                f"Qwen Realtime rejected request ({code})", code=code
            )
        if kind == "session.updated":
            self._ack(kind)
        elif kind == "conversation.item.deleted":
            self._chat.items[:] = [i for i in self._chat.items if i.id != item_id]
            self._ack(kind, item_id)
        elif kind == "conversation.item.created":
            wire = event["item"]
            if wire["id"] == self._bootstrap_item:
                self._ack(kind, wire["id"])
                return
            existing = self._chat.get_by_id(wire["id"])
            item = None
            if wire["type"] == "message":
                content = [
                    p.get("text") or p.get("transcript", "")
                    for p in wire.get("content", [])
                ]
                item = llm.ChatMessage(
                    id=wire["id"],
                    role=wire["role"],
                    content=[p for p in content if p]
                    or (
                        existing.content
                        if isinstance(existing, llm.ChatMessage)
                        else []
                    ),
                )
            elif wire["type"] == "function_call" and wire.get("arguments"):
                item = llm.FunctionCall(
                    id=wire["id"],
                    call_id=wire["call_id"],
                    name=wire["name"],
                    arguments=wire["arguments"],
                )
            elif wire["type"] == "function_call_output":
                item = llm.FunctionCallOutput(
                    id=wire["id"],
                    call_id=wire["call_id"],
                    output=wire["output"],
                    is_error=False,
                )
            if item is not None:
                self._store_item(item, event.get("previous_item_id"))
                if existing is None:
                    self.emit(
                        "remote_item_added",
                        llm.RemoteItemAddedEvent(
                            previous_item_id=event.get("previous_item_id"), item=item
                        ),
                    )
            self._ack(kind, wire["id"])
        elif kind == "input_audio_buffer.speech_started":
            self._speech_started[item_id] = time.time()
            if self._model._turn_detection == "smart_turn":
                self._idle.clear()
            self.emit("input_speech_started", llm.InputSpeechStartedEvent())
        elif kind == "input_audio_buffer.speech_stopped":
            invalid = event.get("reason") == "turn_invalid"
            if invalid:
                self._invalid_turns.add(item_id)
                self._speech_started.pop(item_id, None)
                self._idle.set()
            self.emit(
                "input_speech_stopped",
                llm.InputSpeechStoppedEvent(user_transcription_enabled=not invalid),
            )
        elif kind.startswith("conversation.item.input_audio_transcription."):
            if item_id in self._invalid_turns:
                return
            final = kind.endswith((".completed", ".failed"))
            if kind.endswith(".failed"):
                transcript = ""
            elif final:
                transcript = event.get("transcript", "")
            else:
                transcript = event.get("text", "") + event.get("stash", "")
            started = self._speech_started.get(item_id)
            if final:
                self._speech_started.pop(item_id, None)
                self._transcripts.pop(item_id, None)
                if transcript:
                    self._store_item(
                        llm.ChatMessage(
                            id=item_id,
                            role="user",
                            content=[transcript],
                            created_at=started or time.time(),
                        )
                    )
            else:
                self._transcripts[item_id] = transcript
            self.emit(
                "input_audio_transcription_completed",
                llm.InputTranscriptionCompleted(
                    item_id=item_id,
                    transcript=transcript,
                    is_final=final,
                    turn_started_at=started,
                ),
            )
        elif kind == "response.created":
            if self._response is not None:
                raise llm.RealtimeError("Qwen emitted overlapping responses")
            self._idle.clear()
            response = self._response = _Response(event["response"]["id"])
            response.watchdog = self._spawn(self._watch_response(response))
            manual = self._reply_requested
            self._reply_requested = False
            generation = llm.GenerationCreatedEvent(
                message_stream=response.messages,
                function_stream=response.functions,
                user_initiated=manual,
                response_id=response.id,
            )
            if (
                manual
                and self._pending_reply is not None
                and not self._pending_reply.done()
            ):
                self._pending_reply.set_result(generation)
            if self._cancel_before_created and manual:
                self.interrupt()
                response.messages.close()
                response.functions.close()
            self._cancel_before_created = False
            self.emit("generation_created", generation)
        elif kind == "response.done":
            response = self._response
            if response is None or event["response"]["id"] != response.id:
                return
            completed = event["response"].get("status") == "completed"
            if completed:
                for item in event["response"].get("output", []):
                    if item["type"] == "function_call":
                        self._function(item)
            for message in response.items.values():
                if message.transcript:
                    self._store_item(
                        llm.ChatMessage(
                            id=message.id,
                            role="assistant",
                            content=[message.transcript],
                            interrupted=not completed,
                        )
                    )
            response.close()
            self._metrics(event["response"], response)
            self._response = None
            if event["response"].get("status") == "failed":
                raise llm.RealtimeError("Qwen Realtime generation failed")
            temporary_items = [
                item_id
                for item_id in (self._temporary_instructions, self._bootstrap_item)
                if item_id is not None
            ]
            if temporary_items:
                self._spawn(self._finish_instructions(temporary_items))
                self._temporary_instructions = None
                self._bootstrap_item = None
            else:
                self._idle.set()
        elif (
            self._response is not None and event.get("response_id") == self._response.id
        ):
            response = self._response
            if response.cancelled:
                return
            if kind == "response.function_call_arguments.done":
                self._function(event)
            elif kind == "response.output_item.done":
                if event["item"]["type"] == "function_call":
                    self._function(event["item"])
                elif event["item"]["id"] in response.items:
                    response.items[event["item"]["id"]].close()
            elif (
                kind == "response.output_item.added"
                and event["item"]["type"] == "message"
            ):
                self._message(event["item"]["id"])
            elif kind == "response.content_part.added":
                message = self._message(item_id)
                if not message.modalities.done():
                    message.modalities.set_result(
                        ["text", "audio"]
                        if event["part"]["type"] == "audio"
                        else ["text"]
                    )
            elif kind in ("response.text.delta", "response.audio_transcript.delta"):
                message = self._message(item_id)
                if not message.text.closed:
                    message.transcript += event["delta"]
                    message.text.send_nowait(event["delta"])
                    response.first_token = response.first_token or time.time()
            elif kind == "response.audio.delta":
                message = self._message(item_id)
                if message.audio.closed:
                    return
                if not message.modalities.done():
                    message.modalities.set_result(["text", "audio"])
                message.pcm.extend(base64.b64decode(event["delta"], validate=True))
                count = len(message.pcm) // 2 * 2
                if count:
                    message.audio.send_nowait(
                        rtc.AudioFrame(
                            bytes(message.pcm[:count]),
                            OUTPUT_SAMPLE_RATE,
                            1,
                            count // 2,
                        )
                    )
                    del message.pcm[:count]
                response.first_token = response.first_token or time.time()

    async def _finish_instructions(self, item_ids: list[str]) -> None:
        try:
            for item_id in item_ids:
                await self._request(
                    {"type": "conversation.item.delete", "item_id": item_id},
                    "conversation.item.deleted",
                    item_id,
                )
        except llm.RealtimeError as error:
            self._fail(error)
        finally:
            self._idle.set()

    async def _watch_response(self, response: _Response) -> None:
        await asyncio.sleep(self._model._response_timeout)
        if self._response is response:
            self._fail(llm.RealtimeError("Qwen Realtime response completion timed out"))

    def _ack(self, kind: str, item_id: str = "") -> None:
        future = self._acks.get((kind, item_id))
        if future is not None and not future.done():
            future.set_result(None)

    def _metrics(self, event: dict[str, Any], response: _Response) -> None:
        usage = event.get("usage") or {}
        input_details = usage.get("input_tokens_details") or {}
        output_details = usage.get("output_tokens_details") or {}
        duration = time.time() - response.started
        self.emit(
            "metrics_collected",
            RealtimeModelMetrics(
                timestamp=response.started,
                request_id=response.id,
                label=self._model.label,
                duration=duration,
                ttft=response.first_token - response.started
                if response.first_token
                else -1,
                cancelled=event.get("status") == "cancelled",
                input_tokens=usage.get("input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                tokens_per_second=usage.get("output_tokens", 0) / duration
                if duration
                else 0,
                input_token_details=RealtimeModelMetrics.InputTokenDetails(
                    text_tokens=input_details.get("text_tokens", 0),
                    audio_tokens=input_details.get("audio_tokens", 0),
                ),
                output_token_details=RealtimeModelMetrics.OutputTokenDetails(
                    text_tokens=output_details.get("text_tokens", 0),
                    audio_tokens=output_details.get("audio_tokens", 0),
                ),
                metadata=Metadata(
                    model_name=self._model.model, model_provider=self._model.provider
                ),
            ),
        )

    async def aclose(self) -> None:
        if self._closed:
            return
        self._closed = True
        error = llm.RealtimeError("Qwen Realtime session closed")
        for future in [self._ready, self._pending_reply, *self._acks.values()]:
            if future is not None and not future.done():
                future.set_exception(error)
        if self._response:
            self._response.close()
        self._idle.set()
        self._main.cancel()
        tasks = list(self._background)
        for task in tasks:
            task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._main
        await asyncio.gather(*tasks, return_exceptions=True)
        self._model._sessions.discard(self)
