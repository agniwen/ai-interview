import asyncio
import base64
import json
from types import SimpleNamespace

import aiohttp
import pytest
from livekit import rtc
from livekit.agents import llm

from qwen_realtime import RealtimeModel


class Socket:
    def __init__(self):
        self.incoming = asyncio.Queue()
        self.sent = []
        self.closed = False
        self.auto_ack = True
        self.feed("session.created", session={"id": "session-test"})

    def feed(self, kind, **payload):
        self.incoming.put_nowait(
            SimpleNamespace(
                type=aiohttp.WSMsgType.TEXT, data=json.dumps({"type": kind, **payload})
            )
        )

    async def receive(self):
        return await self.incoming.get()

    async def send_json(self, event):
        self.sent.append(event)
        if not self.auto_ack:
            return
        if event["type"] == "session.update":
            self.feed("session.updated", session=event["session"])
        elif event["type"] == "conversation.item.create":
            self.feed(
                "conversation.item.created",
                item=event["item"],
                previous_item_id=event.get("previous_item_id"),
            )
        elif event["type"] == "conversation.item.delete":
            self.feed("conversation.item.deleted", item_id=event["item_id"])

    async def close(self):
        self.closed = True


class Http:
    def __init__(self, socket):
        self.socket = socket

    async def ws_connect(self, url, **kwargs):
        self.url = str(url)
        self.headers = kwargs["headers"]
        return self.socket


@pytest.fixture
async def connected():
    socket = Socket()
    http = Http(socket)
    model = RealtimeModel(api_key="test-secret", http_session=http, request_timeout=0.5)
    session = model.session()
    await session.update_instructions("收集信息，不要代替候选人回答。")
    yield session, socket, http
    await model.aclose()


async def eventually(predicate):
    async with asyncio.timeout(1):
        while not predicate():
            await asyncio.sleep(0.001)


async def test_default_voice_uses_restrained_delivery(connected):
    _, socket, _ = connected
    config = socket.sent[0]["session"]
    assert config["voice"] == "longanlingxin"
    assert config["enable_speech_emotion"] is False


async def test_interrupted_response_can_be_replaced_before_late_done(connected):
    session, socket, _ = connected
    await begin_response(session, socket)
    old = session._response
    session.interrupt()
    session._handle_event({"type": "response.created", "response": {"id": "r2"}})
    assert old.messages.closed
    assert old.functions.closed
    session._handle_event(
        {"type": "response.done", "response": {"id": "r1", "status": "cancelled"}}
    )
    assert session._response.id == "r2"
    session._handle_event(
        {"type": "response.done", "response": {"id": "r2", "status": "completed"}}
    )
    assert session._response is None


async def begin_response(session, socket, response_id="r1"):
    future = session.generate_reply()
    await eventually(lambda: any(e["type"] == "response.create" for e in socket.sent))
    socket.feed("response.created", response={"id": response_id})
    return await future


async def test_opening_without_user_uses_private_transport_bootstrap(connected):
    session, socket, _ = connected
    added = []
    session.on("remote_item_added", added.append)
    await begin_response(session, socket)
    created = [
        e["item"] for e in socket.sent if e["type"] == "conversation.item.create"
    ]
    bootstrap = next(item for item in created if item.get("role") == "user")
    assert session.chat_ctx.get_by_id(bootstrap["id"]) is None
    assert not any(event.item.id == bootstrap["id"] for event in added)
    socket.feed("response.done", response={"id": "r1", "status": "completed"})
    await eventually(
        lambda: any(
            e.get("item_id") == bootstrap["id"]
            and e["type"] == "conversation.item.delete"
            for e in socket.sent
        )
    )


async def test_real_user_history_does_not_get_a_bootstrap(connected):
    session, socket, _ = connected
    chat = llm.ChatContext.empty()
    chat.add_message(role="user", content="你好，我准备好了。")
    await session.update_chat_ctx(chat)
    await begin_response(session, socket)
    created = [
        e["item"] for e in socket.sent if e["type"] == "conversation.item.create"
    ]
    assert [item["id"] for item in created if item.get("role") == "user"] == [
        chat.items[0].id
    ]


async def test_initial_configuration_precedes_audio_and_does_not_claim_unsupported_features(
    connected,
):
    session, socket, http = connected
    config = socket.sent[0]["session"]
    assert config["input_audio_format"] == "pcm"
    assert config["turn_detection"] == {"type": "smart_turn"}
    assert config["voice"] == "longanlingxin"
    assert "model=qwen-audio-3.0-realtime-plus" in http.url
    assert http.headers["Authorization"] == "Bearer test-secret"
    assert session.capabilities.auto_tool_reply_generation is False
    assert session.capabilities.message_truncation is False
    assert session.capabilities.supports_say is False
    with pytest.raises(ValueError, match="tool_choice"):
        session.update_options(tool_choice="required")
    session.push_audio(rtc.AudioFrame(bytes(640), 16000, 1, 320))
    await eventually(lambda: socket.sent[-1]["type"] == "input_audio_buffer.append")
    assert len(base64.b64decode(socket.sent[-1]["audio"])) == 640


async def test_nested_tool_arguments_are_visible_without_schema_references(connected):
    session, socket, _ = connected
    from pydantic import BaseModel

    class NestedAnswer(BaseModel):
        answer_summary: str

    @llm.function_tool
    async def record_answers(updates: list[NestedAnswer]):
        """Save nested answer summaries."""
        return len(updates)

    await session.update_tools([record_answers])
    tools = socket.sent[-1]["session"]["tools"]
    record = next(
        tool["function"]
        for tool in tools
        if tool["function"]["name"] == "record_answers"
    )
    item = record["parameters"]["properties"]["updates"]["items"]
    assert "answer_summary" in item["required"]
    assert item["properties"]["answer_summary"]["type"] == "string"
    assert "$ref" not in json.dumps(record)


async def test_streams_audio_and_text_and_closes_on_cancel(connected):
    session, socket, _ = connected
    generation = await begin_response(session, socket)
    socket.feed(
        "response.output_item.added",
        response_id="r1",
        item={"id": "a1", "type": "message", "role": "assistant", "content": []},
    )
    message = await anext(generation.message_stream.__aiter__())
    socket.feed(
        "response.content_part.added",
        response_id="r1",
        item_id="a1",
        part={"type": "audio"},
    )
    socket.feed(
        "response.audio_transcript.delta",
        response_id="r1",
        item_id="a1",
        delta="你负责哪些部分？",
    )
    socket.feed(
        "response.audio.delta",
        response_id="r1",
        item_id="a1",
        delta=base64.b64encode(bytes(960)).decode(),
    )
    socket.feed(
        "response.done", response={"id": "r1", "status": "cancelled", "output": []}
    )
    assert await message.modalities == ["text", "audio"]
    assert [s async for s in message.text_stream] == ["你负责哪些部分？"]
    frames = [f async for f in message.audio_stream]
    assert sum(f.samples_per_channel for f in frames) == 480
    assert all(f.sample_rate == 24000 for f in frames)
    assert [f async for f in generation.function_stream] == []
    assert [m async for m in generation.message_stream] == []


async def test_tool_call_is_delivered_once_and_result_is_acknowledged_before_next_reply(
    connected,
):
    session, socket, _ = connected

    @llm.function_tool
    async def record_answer(question_id: str, answer: str):
        """记录候选人回答。"""
        return {"completed": 1, "total": 3}

    await session.update_tools([record_answer])
    schema = socket.sent[-1]["session"]["tools"][0]
    assert schema["function"]["name"] == "record_answer"
    assert schema["function"]["parameters"]["required"] == ["question_id", "answer"]
    generation = await begin_response(session, socket)
    call = {
        "id": "f1",
        "type": "function_call",
        "call_id": "c1",
        "name": "record_answer",
        "arguments": '{"question_id":"q1","answer":"负责后端"}',
    }
    socket.feed(
        "response.function_call_arguments.done",
        response_id="r1",
        item_id="f1",
        **{k: v for k, v in call.items() if k not in ("id", "type")},
    )
    socket.feed("response.output_item.done", response_id="r1", item=call)
    socket.feed(
        "response.done", response={"id": "r1", "status": "completed", "output": [call]}
    )
    calls = [f async for f in generation.function_stream]
    assert len(calls) == 1
    assert calls[0].call_id == "c1"
    ctx = session.chat_ctx.copy()
    ctx.items.append(
        llm.FunctionCallOutput(
            call_id="c1",
            name="record_answer",
            output='{"completed":1,"total":3}',
            is_error=False,
        )
    )
    await session.update_chat_ctx(ctx)
    sent_items = [
        e["item"] for e in socket.sent if e["type"] == "conversation.item.create"
    ]
    assert sent_items[-1]["type"] == "function_call_output"
    assert sent_items[-1]["call_id"] == "c1"
    assert len([e for e in socket.sent if e["type"] == "response.create"]) == 1


async def test_transcripts_use_confirmed_text_and_stash_without_duplicating_history(
    connected,
):
    session, socket, _ = connected
    events = []
    session.on("input_audio_transcription_completed", events.append)
    socket.feed("input_audio_buffer.speech_started", item_id="u1")
    socket.feed(
        "conversation.item.input_audio_transcription.delta",
        item_id="u1",
        text="我负责",
        stash="后端",
    )
    socket.feed(
        "conversation.item.input_audio_transcription.delta",
        item_id="u1",
        text="我负责后端",
        stash="开发",
    )
    socket.feed(
        "conversation.item.input_audio_transcription.completed",
        item_id="u1",
        transcript="我负责后端开发",
    )
    await eventually(lambda: len(events) == 3)
    assert [e.transcript for e in events] == [
        "我负责后端",
        "我负责后端开发",
        "我负责后端开发",
    ]
    assert events[-1].is_final
    assert events[-1].turn_started_at is not None
    assert session.chat_ctx.get_by_id("u1").text_content == "我负责后端开发"


async def test_idle_interrupt_does_not_send_invalid_cancel(connected):
    session, socket, _ = connected
    session.interrupt()
    await asyncio.sleep(0)
    assert not any(e["type"] == "response.cancel" for e in socket.sent)
    await begin_response(session, socket)
    session.interrupt()
    session.interrupt()
    await eventually(lambda: any(e["type"] == "response.cancel" for e in socket.sent))
    assert len([e for e in socket.sent if e["type"] == "response.cancel"]) == 1


async def test_disconnect_fails_pending_generation_and_closes_streams(connected):
    session, socket, _ = connected
    errors = []
    session.on("error", errors.append)
    future = session.generate_reply()
    await eventually(lambda: any(e["type"] == "response.create" for e in socket.sent))
    socket.incoming.put_nowait(
        SimpleNamespace(type=aiohttp.WSMsgType.CLOSED, data=None)
    )
    with pytest.raises(llm.RealtimeError):
        await future
    assert errors and errors[-1].recoverable is False


async def test_manual_audio_commit_and_clear_are_only_sent_in_manual_mode(connected):
    session, socket, _ = connected
    session.commit_audio()
    session.clear_audio()
    await asyncio.sleep(0)
    assert not any(
        e["type"] in {"input_audio_buffer.commit", "input_audio_buffer.clear"}
        for e in socket.sent
    )
    manual = session.realtime_model.session(turn_detection_disabled=True)
    assert manual.capabilities.turn_detection is False
    await manual.aclose()


async def test_audio_can_be_queued_before_handshake_but_never_sent_before_configuration():
    socket = Socket()
    model = RealtimeModel(api_key="test", http_session=Http(socket))
    session = model.session()
    session.push_audio(rtc.AudioFrame(bytes(640), 16000, 1, 320))
    try:
        await session.update_instructions("你好")
        kinds = [event["type"] for event in socket.sent]
        assert kinds[0] == "session.update"
        assert kinds.index("input_audio_buffer.append") > 0
    finally:
        await model.aclose()


async def test_resamples_48khz_and_flushes_manual_audio():
    socket = Socket()
    model = RealtimeModel(api_key="test", http_session=Http(socket))
    session = model.session(turn_detection_disabled=True)
    try:
        await session.update_instructions("你好")
        session.push_audio(rtc.AudioFrame(bytes(9600), 48000, 1, 4800))
        session.commit_audio()
        await eventually(lambda: socket.sent[-1]["type"] == "input_audio_buffer.commit")
        packets = [
            base64.b64decode(e["audio"])
            for e in socket.sent
            if e["type"] == "input_audio_buffer.append"
        ]
        assert abs(sum(len(packet) for packet in packets) - 3200) <= 4
        assert all(len(packet) <= 640 for packet in packets)
        assert socket.sent[0]["session"]["turn_detection"] is None
    finally:
        await model.aclose()


async def test_invalid_smart_turn_and_ambient_audio_do_not_become_answers(connected):
    session, socket, _ = connected
    stops, transcripts = [], []
    session.on("input_speech_stopped", stops.append)
    session.on("input_audio_transcription_completed", transcripts.append)
    socket.feed("conversation.item.ambient_audio_transcription.delta", text="嗯")
    socket.feed("input_audio_buffer.speech_started", item_id="noise")
    socket.feed(
        "input_audio_buffer.speech_stopped", item_id="noise", reason="turn_invalid"
    )
    socket.feed(
        "conversation.item.input_audio_transcription.completed",
        item_id="noise",
        transcript="嗯",
    )
    await eventually(lambda: len(stops) == 1)
    assert stops[0].user_transcription_enabled is False
    assert transcripts == []
    assert session.chat_ctx.get_by_id("noise") is None


async def test_provider_rejection_does_not_mark_context_update_successful(connected):
    session, socket, _ = connected
    socket.auto_ack = False
    ctx = llm.ChatContext.empty()
    ctx.add_message(role="user", content="测试")
    update = asyncio.create_task(session.update_chat_ctx(ctx))
    await eventually(lambda: socket.sent[-1]["type"] == "conversation.item.create")
    socket.feed(
        "error",
        error={
            "code": "invalid_value",
            "param": "conversation.item.create",
            "message": "sensitive provider payload must not be logged",
        },
    )
    with pytest.raises(llm.RealtimeError, match="invalid_value") as exc:
        await update
    assert "sensitive" not in str(exc.value)
    assert session.chat_ctx.items == []


async def test_context_prepend_is_rejected_before_any_remote_mutation(connected):
    session, socket, _ = connected
    ctx = llm.ChatContext.empty()
    ctx.add_message(role="user", content="原消息")
    await session.update_chat_ctx(ctx)
    before = len(socket.sent)
    desired = session.chat_ctx.copy()
    desired.items.insert(0, llm.ChatMessage(role="system", content=["前置消息"]))
    with pytest.raises(llm.RealtimeError, match="prepend"):
        await session.update_chat_ctx(desired)
    assert len(socket.sent) == before


async def test_cancel_before_response_created_does_not_spawn_unowned_speech(connected):
    session, socket, _ = connected
    generations = []
    session.on("generation_created", generations.append)
    reply = session.generate_reply()
    await eventually(lambda: any(e["type"] == "response.create" for e in socket.sent))
    reply.cancel()
    with pytest.raises(asyncio.CancelledError):
        await reply
    socket.feed("response.created", response={"id": "late"})
    await eventually(lambda: any(e["type"] == "response.cancel" for e in socket.sent))
    assert generations[0].user_initiated is True
    socket.feed(
        "response.audio.delta", response_id="late", item_id="late-message", delta="AAAA"
    )
    socket.feed("response.done", response={"id": "late", "status": "cancelled"})
    assert [m async for m in generations[0].message_stream] == []


async def test_server_and_client_cancel_race_is_not_a_fatal_error(connected):
    session, socket, _ = connected
    errors = []
    session.on("error", errors.append)
    await begin_response(session, socket)
    session.interrupt()
    socket.feed("response.done", response={"id": "r1", "status": "cancelled"})
    socket.feed("error", error={"code": "invalid_value", "param": "response.cancel"})
    await eventually(lambda: session._response is None)
    assert not errors


async def test_response_instructions_are_removed_before_next_reply(connected):
    session, socket, _ = connected
    reply = session.generate_reply(instructions="本轮简短打招呼")
    await eventually(lambda: any(e["type"] == "response.create" for e in socket.sent))
    instruction = next(
        e["item"] for e in socket.sent if e["type"] == "conversation.item.create"
    )
    socket.feed("response.created", response={"id": "r1"})
    await reply
    socket.feed("response.done", response={"id": "r1", "status": "completed"})
    await eventually(lambda: socket.sent[-1]["type"] == "conversation.item.delete")
    await eventually(lambda: session.chat_ctx.get_by_id(instruction["id"]) is None)


async def test_usage_maps_qwen_plural_token_details(connected):
    session, socket, _ = connected
    metrics = []
    session.on("metrics_collected", metrics.append)
    await begin_response(session, socket)
    socket.feed(
        "response.done",
        response={
            "id": "r1",
            "status": "completed",
            "usage": {
                "input_tokens": 100,
                "output_tokens": 20,
                "total_tokens": 120,
                "input_tokens_details": {"text_tokens": 60, "audio_tokens": 40},
                "output_tokens_details": {"text_tokens": 5, "audio_tokens": 15},
            },
        },
    )
    await eventually(lambda: len(metrics) == 1)
    assert metrics[0].input_token_details.audio_tokens == 40
    assert metrics[0].output_token_details.audio_tokens == 15
    assert metrics[0].total_tokens == 120


async def test_missing_response_done_does_not_hang_stream_consumers():
    socket = Socket()
    model = RealtimeModel(
        api_key="test", http_session=Http(socket), response_timeout=0.05
    )
    session = model.session()
    errors = []
    session.on("error", errors.append)
    try:
        await session.update_instructions("你好")
        generation = await begin_response(session, socket)
        async with asyncio.timeout(1):
            assert [m async for m in generation.message_stream] == []
            assert [f async for f in generation.function_stream] == []
        assert errors and "completion timed out" in str(errors[-1].error)
    finally:
        await model.aclose()


@pytest.mark.parametrize(
    "failure", ["response_idle_timeout", "user_idle_timeout", "disconnect"]
)
async def test_idle_timeout_reconnects_history_without_replaying_tools_or_greeting(
    failure,
):
    sockets = [Socket(), Socket(), Socket()]

    class RotatingHttp:
        calls = 0

        async def ws_connect(self, url, **kwargs):
            socket = sockets[self.calls]
            self.calls += 1
            return socket

    http = RotatingHttp()
    model = RealtimeModel(api_key="test", http_session=http, request_timeout=0.5)
    session = model.session()
    errors = []
    session.on("error", errors.append)
    try:
        await session.update_instructions("继续原来的面试")
        chat = llm.ChatContext.empty()
        chat.add_message(role="user", content="我使用豆包")
        chat.items.append(
            llm.FunctionCall(
                id="f1", call_id="c1", name="record_answer", arguments="{}"
            )
        )
        chat.items.append(
            llm.FunctionCallOutput(
                id="o1", call_id="c1", output="saved", is_error=False
            )
        )
        chat.add_message(role="assistant", content="用于什么工作？")
        await session.update_chat_ctx(chat)
        for index in range(2):
            if failure == "disconnect":
                sockets[index].incoming.put_nowait(
                    SimpleNamespace(type=aiohttp.WSMsgType.CLOSED)
                )
            else:
                sockets[index].feed("error", error={"code": failure})
            await eventually(lambda index=index: http.calls == index + 2)
            await eventually(
                lambda index=index: len(sockets[index + 1].sent) >= 1 + len(chat.items)
            )
            restored = sockets[index + 1].sent
            assert restored[0]["session"]["instructions"] == "继续原来的面试"
            assert [
                event["item"]["id"]
                for event in restored
                if event["type"] == "conversation.item.create"
            ] == [item.id for item in chat.items]
            assert not any(event["type"] == "response.create" for event in restored)
            assert not errors
            assert [item.id for item in session.chat_ctx.items] == [
                item.id for item in chat.items
            ]
        await begin_response(session, sockets[2], "continued")
    finally:
        await model.aclose()


async def test_idle_timeout_with_unresolved_tool_still_fails_closed(connected):
    session, socket, _ = connected
    errors = []
    session.on("error", errors.append)
    chat = llm.ChatContext.empty()
    chat.items.append(
        llm.FunctionCall(id="pending", call_id="pending", name="save", arguments="{}")
    )
    await session.update_chat_ctx(chat)
    socket.feed("error", error={"code": "response_idle_timeout"})
    await eventually(lambda: bool(errors))
    assert errors[0].recoverable is False


@pytest.mark.parametrize("phase", ["user", "assistant", "first_user"])
async def test_disconnect_mid_speech_restores_confirmed_history_and_requests_repeat(
    phase,
):
    sockets = [Socket(), Socket()]

    class RotatingHttp:
        calls = 0

        async def ws_connect(self, *args, **kwargs):
            result = sockets[self.calls]
            self.calls += 1
            return result

    http = RotatingHttp()
    model = RealtimeModel(api_key="test", http_session=http)
    session = model.session()
    errors = []
    session.on("error", errors.append)
    try:
        await session.update_instructions("继续面试")

        @llm.function_tool
        async def save_fact(value: str) -> str:
            """Save a confirmed fact."""
            return value

        await session.update_tools([save_fact])
        ctx = llm.ChatContext.empty()
        if phase != "first_user":
            ctx.add_message(role="user", content="我用豆包写初稿")
        await session.update_chat_ctx(ctx)
        if phase in {"user", "first_user"}:
            sockets[0].feed("input_audio_buffer.speech_started", item_id="unfinished")
            sockets[0].feed(
                "conversation.item.input_audio_transcription.delta",
                item_id="unfinished",
                text="效率大概",
            )
            await eventually(lambda: bool(session._transcripts))
        else:
            generation = await begin_response(session, sockets[0])
            sockets[0].feed(
                "response.audio_transcript.delta",
                response_id="r1",
                item_id="a1",
                delta="请问你的",
            )
            await eventually(lambda: bool(session._response.items))
        sockets[0].incoming.put_nowait(SimpleNamespace(type=aiohttp.WSMsgType.CLOSED))
        await eventually(lambda: http.calls == 2)
        await eventually(
            lambda: any(e["type"] == "response.create" for e in sockets[1].sent)
        )
        assert not errors
        assert session.chat_ctx.get_by_id("unfinished") is None
        restored = [
            e["item"]
            for e in sockets[1].sent
            if e["type"] == "conversation.item.create"
        ]
        if phase == "first_user":
            assert any(item.get("role") == "user" for item in restored)
            assert not any(
                getattr(item, "role", None) == "user" for item in session.chat_ctx.items
            )
        else:
            assert any("我用豆包写初稿" in str(item) for item in restored)
        recovery_config = next(
            e["session"]
            for e in sockets[1].sent
            if e["type"] == "session.update"
            and "再说一遍" in e["session"].get("instructions", "")
        )
        assert recovery_config["tools"] == []
        if phase == "assistant":
            assert [f async for f in generation.function_stream] == []
        sockets[1].feed("response.created", response={"id": "recovered"})
        sockets[1].feed(
            "response.done", response={"id": "recovered", "status": "completed"}
        )
        await eventually(lambda: session._idle.is_set())
        restored_config = [
            e["session"] for e in sockets[1].sent if e["type"] == "session.update"
        ][-1]
        assert restored_config["tools"][0]["function"]["name"] == "save_fact"
        assert [
            e["session"]["instructions"]
            for e in sockets[1].sent
            if e["type"] == "session.update" and "instructions" in e["session"]
        ][-1] == "继续面试"
    finally:
        await model.aclose()


async def test_reconnect_retries_a_dropped_restore_connection():
    sockets = [Socket(), Socket(), Socket()]
    sockets[1].incoming = asyncio.Queue()
    sockets[1].incoming.put_nowait(SimpleNamespace(type=aiohttp.WSMsgType.CLOSED))

    class RotatingHttp:
        calls = 0

        async def ws_connect(self, *args, **kwargs):
            socket = sockets[self.calls]
            self.calls += 1
            return socket

    http = RotatingHttp()
    model = RealtimeModel(api_key="test", http_session=http)
    session = model.session()
    errors = []
    session.on("error", errors.append)
    try:
        await session.update_instructions("保留进度")
        sockets[0].incoming.put_nowait(SimpleNamespace(type=aiohttp.WSMsgType.CLOSED))
        await eventually(lambda: http.calls == 3)
        await eventually(lambda: bool(sockets[2].sent))
        assert sockets[2].sent[0]["session"]["instructions"] == "保留进度"
        assert not errors
    finally:
        await model.aclose()


async def test_automatic_response_timeout_restores_instead_of_ending_interview():
    sockets = [Socket(), Socket()]

    class RotatingHttp:
        calls = 0

        async def ws_connect(self, *args, **kwargs):
            socket = sockets[self.calls]
            self.calls += 1
            return socket

    http = RotatingHttp()
    model = RealtimeModel(api_key="test", http_session=http, response_timeout=0.05)
    session = model.session()
    errors, generations = [], []
    session.on("error", errors.append)
    session.on("generation_created", generations.append)
    try:
        await session.update_instructions("继续原来的面试")
        chat = llm.ChatContext.empty()
        chat.add_message(role="user", content="我用豆包写初稿")
        await session.update_chat_ctx(chat)
        sockets[0].feed("response.created", response={"id": "stalled"})
        await eventually(lambda: len(generations) == 1)
        await eventually(lambda: http.calls == 2)
        await eventually(
            lambda: any(e["type"] == "response.create" for e in sockets[1].sent)
        )
        assert [m async for m in generations[0].message_stream] == []
        assert [f async for f in generations[0].function_stream] == []
        assert not errors
        assert [
            item.text_content
            for item in session.chat_ctx.items
            if isinstance(item, llm.ChatMessage) and item.role == "user"
        ] == ["我用豆包写初稿"]
    finally:
        await model.aclose()
