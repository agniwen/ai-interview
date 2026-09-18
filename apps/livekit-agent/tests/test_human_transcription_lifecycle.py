"""Collector lifecycle contracts without provider calls or production callbacks."""

import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import ClassVar

import httpx
import pytest

from human_transcription import runtime
from human_transcription.contract import HumanJob
from human_transcription.outbox import EventOutbox


class Audio:
    instances: ClassVar[list] = []

    def __init__(self, track, **_):
        self.closed = asyncio.Event()
        self.close_calls = 0
        self.emitted = False
        self.track = track
        self.instances.append(self)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self.emitted:
            self.emitted = True
            return SimpleNamespace(
                frame=SimpleNamespace(samples_per_channel=320, sample_rate=16000)
            )
        await self.closed.wait()
        raise StopAsyncIteration

    async def aclose(self):
        self.close_calls += 1
        self.closed.set()


class Speech:
    def __init__(self):
        self.sent_ms = 0
        self.ended = asyncio.Event()
        self.final_handler = None
        self.interim_handler = None

    def push_frame(self, frame):
        self.sent_ms += 20
        sentence = {
            "sentence_id": 1,
            "begin_time": 0,
            "end_time": 20,
            "text": "测试发言",
        }
        self.interim_handler("provider", sentence)
        self.final_handler("provider", sentence)

    def end_input(self):
        self.ended.set()

    async def aclose(self):
        self.ended.set()

    def __aiter__(self):
        return self

    async def __anext__(self):
        await self.ended.wait()
        raise StopAsyncIteration


class CollectorHarness:
    def __init__(self, monkeypatch, tmp_path, people=3, stop_automatically=True):
        self.order = []
        self.events = {}
        self.previews = []
        self.callbacks = []
        self.listeners = {}
        self.connected = False
        self.cutoff_started = asyncio.Event()
        self.cutoff_release = asyncio.Event()
        self.cutoff_release.set()
        self.ready = asyncio.Event()
        self.stop_automatically = stop_automatically
        self.people = {
            f"person-{i}": {"role": "candidate" if i == 0 else "interviewer"}
            for i in range(people)
        }
        remote = {}
        for identity in self.people:
            pub = SimpleNamespace(
                sid=f"track-{identity}",
                source=runtime.rtc.TrackSource.SOURCE_MICROPHONE,
                track=object(),
            )
            remote[identity] = SimpleNamespace(
                identity=identity, track_publications={pub.sid: pub}
            )
        self.room = SimpleNamespace(
            name="human_meeting",
            remote_participants=remote,
            local_participant=SimpleNamespace(publish_data=self.publish),
            on=self.on,
            off=self.off,
            disconnect=self.disconnect,
        )
        self.ctx = SimpleNamespace(
            room=self.room,
            job=SimpleNamespace(
                metadata=json.dumps(
                    HumanJob("org", "meeting", "run", 1, "human_meeting").payload()
                )
            ),
            connect=self.connect,
            shutdown=lambda **_: self.order.append("shutdown"),
            add_shutdown_callback=self.callbacks.append,
        )
        monkeypatch.setenv("CALLBACK_BASE_URL", "http://callback.invalid")
        monkeypatch.setenv("AGENT_CALLBACK_SECRET", "test")
        monkeypatch.setenv("HUMAN_TRANSCRIPTION_OUTBOX_DIR", str(tmp_path))
        Audio.instances = []
        monkeypatch.setattr(runtime.rtc, "AudioStream", Audio)
        monkeypatch.setattr(
            runtime.aliyun_stt,
            "STT",
            lambda **_: SimpleNamespace(stream=lambda **_: Speech()),
        )
        monkeypatch.setattr(runtime.httpx, "AsyncClient", lambda **_: self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        self.order.append("client_closed")

    async def connect(self, **_):
        self.connected = True

    async def disconnect(self):
        self.connected = False
        self.order.append("disconnect")
        for callback in self.listeners.get("disconnected", []):
            callback()

    def on(self, event, callback):
        self.listeners.setdefault(event, []).append(callback)

    def off(self, event, callback):
        self.listeners[event].remove(callback)

    async def publish(self, data, **options):
        self.previews.append((data, options))

    async def post(self, url, json):
        if "client_closed" in self.order:
            raise RuntimeError("Cannot send a request, as the client has been closed.")
        path = url.rsplit("/", 1)[-1]
        self.order.append(path)
        result = {}
        if path == "claim":
            result = {
                "participants": self.people,
                "mode": "server_realtime",
                "startedAt": datetime.now(timezone.utc).isoformat(),
            }
        elif path == "ready":
            self.ready.set()
        elif path == "events":
            self.events.update({e["eventId"]: e for e in json["events"]})
            final_count = sum(e["kind"] == "final" for e in self.events.values())
            result = {
                "acknowledgedIds": [e["eventId"] for e in json["events"]],
                "stop": self.stop_automatically and final_count >= len(self.people),
            }
        elif path == "cutoff":
            self.cutoff_started.set()
            await self.cutoff_release.wait()
        elif path == "finish":
            self.connected_at_finish = self.connected
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: result)


async def test_three_speakers_drain_and_disconnect_before_server_can_delete_room(
    monkeypatch, tmp_path
):
    h = CollectorHarness(monkeypatch, tmp_path)
    await asyncio.wait_for(runtime.run_human_transcription(h.ctx), 3)
    assert {
        e["participantIdentity"] for e in h.events.values() if e["kind"] == "final"
    } == set(h.people)
    assert sum(e["kind"] == "stream_ended" for e in h.events.values()) == 3
    assert all(a.close_calls == 1 for a in Audio.instances)
    assert h.connected_at_finish is False
    assert h.order.index("disconnect") < h.order.index("finish")
    assert all(not callbacks for callbacks in h.listeners.values())
    assert h.previews
    assert all(
        options["destination_identities"] == ["person-1", "person-2"]
        for _, options in h.previews
    )


async def test_concurrent_shutdown_waits_for_the_same_drain(monkeypatch, tmp_path):
    h = CollectorHarness(monkeypatch, tmp_path, stop_automatically=False)
    h.cutoff_release.clear()
    task = asyncio.create_task(runtime.run_human_transcription(h.ctx))
    await asyncio.wait_for(h.ready.wait(), 2)
    first = asyncio.create_task(h.callbacks[0]())
    await asyncio.wait_for(h.cutoff_started.wait(), 2)
    second = asyncio.create_task(h.callbacks[0]())
    try:
        await asyncio.sleep(0)
        assert not second.done(), (
            "shutdown returned while resource cleanup was still running"
        )
    finally:
        h.cutoff_release.set()
        await asyncio.wait_for(asyncio.gather(first, second, task), 3)
    assert h.order.count("cutoff") == 1
    assert h.order.count("finish") == 1


async def test_republished_microphone_keeps_speaker_identity_and_closes_old_stream(
    monkeypatch, tmp_path
):
    h = CollectorHarness(monkeypatch, tmp_path, stop_automatically=False)
    task = asyncio.create_task(runtime.run_human_transcription(h.ctx))

    async def wait_for_final(track_id):
        while not any(
            e["kind"] == "final" and e["trackId"] == track_id for e in h.events.values()
        ):
            await asyncio.sleep(0.01)

    try:
        await asyncio.wait_for(wait_for_final("track-person-0"), 2)
        person = h.room.remote_participants["person-0"]
        publication = SimpleNamespace(
            sid="replacement",
            source=runtime.rtc.TrackSource.SOURCE_MICROPHONE,
            track=object(),
        )
        person.track_publications = {publication.sid: publication}
        h.listeners["track_subscribed"][0]()
        await asyncio.wait_for(wait_for_final("replacement"), 2)
    finally:
        await h.callbacks[0]()
        await asyncio.wait_for(task, 3)
    finals = [
        e
        for e in h.events.values()
        if e["kind"] == "final" and e["participantIdentity"] == "person-0"
    ]
    assert {e["trackId"] for e in finals} == {"track-person-0", "replacement"}
    assert len({e["streamEpoch"] for e in finals}) == 2
    assert any(e["kind"] == "gap" for e in h.events.values())
    assert len(Audio.instances) == 4
    assert all(a.close_calls == 1 for a in Audio.instances)


async def test_ready_failure_still_releases_room_and_listeners(monkeypatch, tmp_path):
    h = CollectorHarness(monkeypatch, tmp_path)
    original_post = h.post

    async def post(url, json):
        if url.endswith("/ready"):
            raise httpx.ConnectError("callback unavailable")
        return await original_post(url, json)

    monkeypatch.setattr(h, "post", post)
    with pytest.raises(httpx.ConnectError):
        await runtime.run_human_transcription(h.ctx)
    assert not h.connected
    assert all(not callbacks for callbacks in h.listeners.values())
    assert h.order.count("shutdown") == 1


async def test_failed_finish_callback_keeps_replayable_outbox(monkeypatch, tmp_path):
    h = CollectorHarness(monkeypatch, tmp_path)
    original_post = h.post

    async def post(url, json):
        if url.endswith("/finish"):
            raise httpx.ConnectError("callback unavailable")
        return await original_post(url, json)

    monkeypatch.setattr(h, "post", post)
    await asyncio.wait_for(runtime.run_human_transcription(h.ctx), 3)
    box = EventOutbox(next(tmp_path.glob("*.sqlite")))
    assert box.metadata()["finished"] is True
    assert not box.metadata().get("acknowledged")
    assert not h.connected
    assert all(a.close_calls == 1 for a in Audio.instances)


async def test_entrypoint_cancellation_keeps_callback_client_open_until_drained(
    monkeypatch, tmp_path
):
    h = CollectorHarness(monkeypatch, tmp_path)
    h.cutoff_release.clear()
    task = asyncio.create_task(runtime.run_human_transcription(h.ctx))
    await asyncio.wait_for(h.cutoff_started.wait(), 3)
    try:
        task.cancel()
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert "client_closed" not in h.order
        task.cancel()
        await asyncio.sleep(0)
        assert "client_closed" not in h.order
    finally:
        h.cutoff_release.set()
        await asyncio.gather(task, return_exceptions=True)
        await h.callbacks[0]()
    assert task.cancelled()
    assert h.order.index("finish") < h.order.index("client_closed")
    assert sum(e["kind"] == "stream_ended" for e in h.events.values()) == 3
    box = EventOutbox(next(tmp_path.glob("*.sqlite")))
    assert box.metadata()["acknowledged"] is True
    assert not h.connected
    assert all(a.close_calls == 1 for a in Audio.instances)


async def test_early_arrival_does_not_time_out_after_five_minutes(
    monkeypatch, tmp_path
):
    h = CollectorHarness(monkeypatch, tmp_path, stop_automatically=False)
    h.room.remote_participants = {"person-0": h.room.remote_participants["person-0"]}
    clock = [0]
    monkeypatch.setattr(
        runtime,
        "time",
        SimpleNamespace(
            monotonic=lambda: clock[0],
            time=lambda: datetime.now(timezone.utc).timestamp(),
        ),
    )
    original_connect = h.ctx.connect
    original_post = h.post

    async def connect(**options):
        await original_connect(**options)
        clock[0] = 6 * 60

    async def post(url, json):
        if url.endswith("/events"):
            h.order.append("events")
            return SimpleNamespace(
                raise_for_status=lambda: None,
                json=lambda: {"acknowledgedIds": [], "stop": True},
            )
        return await original_post(url, json)

    h.ctx.connect = connect
    monkeypatch.setattr(h, "post", post)
    await asyncio.wait_for(runtime.run_human_transcription(h.ctx), 3)
    assert "events" in h.order
    box = EventOutbox(next(tmp_path.glob("*.sqlite")))
    assert box.metadata()["acknowledged"] is True
    assert not h.connected
