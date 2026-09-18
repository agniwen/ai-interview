"""Programmatic participant on the existing AgentServer; never publishes audio."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import suppress
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import httpx
from livekit import rtc
from livekit.agents import APIConnectOptions, AutoSubscribe, JobContext

import aliyun_stt
from human_transcription.contract import parse_human_job
from human_transcription.outbox import EventOutbox
from human_transcription.preview import PreviewPublisher
from human_transcription.retry import capture_with_retries

logger = logging.getLogger(__name__)


class SentenceLedger:
    def __init__(self):
        self.counter = 0
        self.revisions: dict[str, int] = {}

    def preview_identity(self, sentence: dict) -> tuple[str, int]:
        value = sentence.get("sentence_id")
        if value is None:
            value = sentence.get("begin_time")
        if value is None:
            value = f"local-{self.counter + 1}"
        key = str(value)
        revision = self.revisions.get(key, -1) + 1
        return key, revision

    def identify(self, sentence: dict) -> tuple[str, int]:
        key, revision = self.preview_identity(sentence)
        if sentence.get("sentence_id") is None and sentence.get("begin_time") is None:
            self.counter += 1
        self.revisions[key] = revision
        return key, revision


async def run_human_transcription(ctx: JobContext) -> None:
    job = parse_human_job(ctx.job.metadata, ctx.room.name)
    execution_id = str(uuid4())
    payload = {**job.payload(), "executionId": execution_id}
    base_url = os.environ["CALLBACK_BASE_URL"].rstrip("/")
    spool = Path(
        os.environ.get("HUMAN_TRANSCRIPTION_OUTBOX_DIR", ".data/human-transcription")
    )
    outbox = EventOutbox(spool / f"{job.run_id}-{job.generation}-{execution_id}.sqlite")
    outbox.set_metadata({"baseUrl": base_url, "payload": payload})
    stopping = asyncio.Event()
    events_ready = asyncio.Event()
    tasks: dict[str, asyncio.Task] = {}
    audio_streams: dict[str, rtc.AudioStream] = {}
    seen: set[str] = set()
    error: str | None = None
    draining = False
    empty_since: float | None = None
    connected_at = time.monotonic()
    retry_boundaries: dict[str, int] = {}
    async with httpx.AsyncClient(
        timeout=5,
        trust_env=False,
        headers={"X-Agent-Secret": os.environ["AGENT_CALLBACK_SECRET"]},
    ) as client:

        async def post(path: str, extra: dict | None = None):
            result = await client.post(
                f"{base_url}/api/agent/human-transcription/{path}",
                json={**payload, **(extra or {})},
            )
            result.raise_for_status()
            return result.json()

        claim = await post("claim")
        participants = claim["participants"]

        async def publish_preview(data, **options):
            await ctx.room.local_participant.publish_data(data, **options)

        preview = PreviewPublisher(
            publish_preview,
            {
                "runId": job.run_id,
                "generation": job.generation,
                "executionId": execution_id,
            },
            [
                identity
                for identity, person in participants.items()
                if person["role"] == "interviewer"
            ]
            if claim["mode"] == "server_realtime"
            else [],
        )
        anchor = datetime.fromisoformat(
            claim["startedAt"].replace("Z", "+00:00")
        ).timestamp()
        origin = time.monotonic() - max(0, time.time() - anchor)

        def elapsed():
            return max(0, round((time.monotonic() - origin) * 1000))

        async def capture(track, publication, person):
            nonlocal error
            epoch = str(uuid4())
            start = elapsed()
            ledger = SentenceLedger()
            received_ms = 0.0
            final_ms = 0
            stream = aliyun_stt.STT(
                **claim.get("hints", {}), max_sentence_silence=800
            ).stream(conn_options=APIConnectOptions(max_retry=0, timeout=5))
            audio = rtc.AudioStream(
                track, sample_rate=16000, num_channels=1, capacity=250
            )
            audio_streams[publication.sid] = audio

            def emit(
                kind, begin, end, text="", item_id=None, revision=0, task_id=epoch
            ):
                event = {
                    "eventId": str(uuid4()),
                    "itemId": item_id or str(uuid4()),
                    "kind": kind,
                    "participantIdentity": person.identity,
                    "providerTaskId": task_id,
                    "revision": revision,
                    "startMs": max(0, round(begin)),
                    "endMs": max(0, round(end)),
                    "streamEpoch": epoch,
                    "text": text,
                    "trackId": publication.sid,
                }
                if kind != "interim":
                    outbox.append(event)
                    events_ready.set()
                if kind in ("interim", "final"):
                    preview.offer(event)

            def interim(task_id, sentence):
                item_id, revision = ledger.preview_identity(sentence)
                begin = float(sentence.get("begin_time") or 0)
                end = float(sentence.get("end_time") or received_ms)
                emit(
                    "interim",
                    start + begin,
                    start + max(begin, end),
                    sentence["text"],
                    item_id,
                    revision,
                    task_id,
                )

            def final(task_id, sentence):
                nonlocal final_ms
                item_id, revision = ledger.identify(sentence)
                begin = float(sentence.get("begin_time") or 0)
                end = float(sentence.get("end_time") or received_ms)
                final_ms = max(final_ms, round(end))
                emit(
                    "final",
                    start + begin,
                    start + max(begin + 1, end),
                    sentence["text"],
                    item_id,
                    revision,
                    task_id,
                )

            stream.final_handler = final
            stream.interim_handler = interim
            if publication.sid in retry_boundaries:
                emit(
                    "gap",
                    retry_boundaries.pop(publication.sid),
                    start,
                    "识别重连期间未覆盖",
                )
            emit("stream_started", start, start)

            async def feed():
                nonlocal received_ms
                async for frame in audio:
                    if stopping.is_set():
                        break
                    received_ms += (
                        frame.frame.samples_per_channel / frame.frame.sample_rate * 1000
                    )
                    if received_ms - stream.sent_ms > 5000:
                        raise RuntimeError("音频发送积压超过五秒")
                    stream.push_frame(frame.frame)
                stream.end_input()

            async def consume():
                async for _ in stream:
                    pass

            feed_task = asyncio.create_task(feed())
            consume_task = asyncio.create_task(consume())
            try:
                await asyncio.gather(feed_task, consume_task)
                emit("stream_ended", start, start + received_ms)
                return True
            except (Exception, asyncio.CancelledError) as exc:
                error = "实时音频采集或识别中断，等待录音补救"
                boundary = max(start + final_ms, start + received_ms, elapsed())
                with suppress(OverflowError):
                    emit("gap", start + final_ms, boundary)
                retry_boundaries[publication.sid] = boundary
                if isinstance(exc, asyncio.CancelledError):
                    raise
                if isinstance(exc, OverflowError):
                    stopping.set()
                return False
            finally:
                feed_task.cancel()
                consume_task.cancel()
                await asyncio.gather(feed_task, consume_task, return_exceptions=True)
                await stream.aclose()
                if audio_streams.pop(publication.sid, None) is not None:
                    await audio.aclose()

        def start_tracks(*_):
            nonlocal error
            if stopping.is_set():
                return
            present = [
                p
                for p in ctx.room.remote_participants.values()
                if p.identity in participants
            ]
            roles = {participants[p.identity]["role"] for p in present}
            if not {"candidate", "interviewer"}.issubset(roles):
                return
            for person in present:
                available = [
                    p
                    for p in person.track_publications.values()
                    if p.source == rtc.TrackSource.SOURCE_MICROPHONE and p.track
                ]
                if not available:
                    continue
                publication = available[-1]
                if publication.sid in seen:
                    continue
                previous = tasks.get(person.identity)
                if not previous and sum(not t.done() for t in tasks.values()) >= int(
                    os.environ.get("HUMAN_TRANSCRIPTION_MAX_TRACKS", "8")
                ):
                    error = "会议音轨超过实时转录容量，等待录音补救"
                    continue
                seen.add(publication.sid)
                if previous and not previous.done():
                    previous.cancel()
                tasks[person.identity] = asyncio.create_task(
                    replace_capture(previous, publication, person)
                )

        async def replace_capture(previous, publication, person):
            if previous:
                await asyncio.gather(previous, return_exceptions=True)
            await capture_with_retries(
                lambda: capture(publication.track, publication, person), stopping
            )

        async def flush():
            pending = outbox.pending()
            reply = await post("events", {"events": pending})
            outbox.ack(reply["acknowledgedIds"])
            if reply.get("stop"):
                stopping.set()

        async def finish():
            nonlocal draining, error
            if draining:
                return
            draining = True
            stopping.set()
            try:
                await post("cutoff")
            except Exception:
                logger.warning("human transcription cutoff callback unavailable")
            closing_audio = list(audio_streams.values())
            audio_streams.clear()
            await asyncio.gather(
                *(audio.aclose() for audio in closing_audio),
                return_exceptions=True,
            )
            pending_tasks = list(tasks.values())
            if pending_tasks:
                _, unfinished = await asyncio.wait(pending_tasks, timeout=8)
                for task in unfinished:
                    task.cancel()
                await asyncio.gather(*pending_tasks, return_exceptions=True)
            outbox.set_metadata(
                {
                    "baseUrl": base_url,
                    "payload": payload,
                    "finished": True,
                    "error": error,
                }
            )
            try:
                async with asyncio.timeout(5):
                    while outbox.pending():
                        await flush()
                    await post("finish", {"error": error})
                    outbox.set_metadata(
                        {"baseUrl": base_url, "payload": payload, "acknowledged": True}
                    )
            except Exception:
                logger.warning(
                    "human transcription retained unacknowledged events for recovery"
                )

        ctx.room.on("track_subscribed", start_tracks)
        ctx.room.on("disconnected", lambda *_: stopping.set())

        def on_left(*_):
            nonlocal empty_since
            if not any(
                p.identity in participants
                for p in ctx.room.remote_participants.values()
            ):
                empty_since = time.monotonic()

        def on_join(*_):
            nonlocal empty_since
            empty_since = None
            start_tracks()

        ctx.room.on("participant_connected", on_join)
        ctx.room.on("participant_disconnected", on_left)
        ctx.add_shutdown_callback(finish)
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
        if (await post("ready")).get("stop"):
            stopping.set()
        start_tracks()
        preview_task = asyncio.create_task(preview.run())
        try:
            failures = 0
            while not stopping.is_set():
                if empty_since is not None and time.monotonic() - empty_since >= 5:
                    break
                if not tasks and time.monotonic() - connected_at >= 300:
                    error = "等待参会者超时，未采集音频"
                    break
                try:
                    events_ready.clear()
                    await flush()
                    failures = 0
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 409:
                        error = "转录任务写入权已失效"
                        break
                    failures += 1
                except httpx.HTTPError:
                    failures += 1
                if failures >= 10:
                    error = "转录持久化中断"
                    break
                with suppress(TimeoutError):
                    await asyncio.wait_for(events_ready.wait(), timeout=1)
        finally:
            await finish()
            preview_task.cancel()
            await asyncio.gather(preview_task, return_exceptions=True)
            ctx.shutdown(reason="human transcription complete")
