"""Local-only RTC/egress smoke test. Synthetic tone, never microphone capture.

Run with the Python environment from apps/livekit-agent:
  uv run ../../infra/livekit-local/smoke.py [--record --candidate-track]

Omit --candidate-track with --record to reproduce the existing participant/OGG failure.

Docs: https://docs.livekit.io/reference/python/livekit/rtc/audio_source.html
      https://docs.livekit.io/reference/python/livekit/api/egress_service.html
"""

import argparse
import asyncio
import json
import math
import uuid
from array import array
from contextlib import suppress
from pathlib import Path

from dotenv import dotenv_values
from livekit import api, rtc


async def tone(source: rtc.AudioSource) -> None:
    samples = array(
        "h", (int(1500 * math.sin(2 * math.pi * 400 * i / 48000)) for i in range(480))
    )
    while True:
        await source.capture_frame(rtc.AudioFrame(samples.tobytes(), 48000, 1, 480))
        await asyncio.sleep(0.01)


async def application(action: str, room_name: str) -> dict:
    root = Path(__file__).resolve().parents[2]
    process = await asyncio.create_subprocess_exec(
        "bun",
        f"--env-file={root / 'apps/web/.env'}",
        str(Path(__file__).with_name("smoke-application.ts")),
        action,
        room_name,
        cwd=root,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(), 60)
    except BaseException:
        process.kill()
        await process.wait()
        raise
    if process.returncode:
        raise RuntimeError(
            f"Application smoke {action} failed (details withheld to protect credentials)"
        )
    return json.loads(stdout)


async def run(record: bool, candidate_track: bool, use_application: bool) -> None:
    config = dotenv_values(Path(__file__).with_name(".env"))
    key = config["LIVEKIT_LOCAL_API_KEY"]
    secret = config["LIVEKIT_LOCAL_API_SECRET"]
    room_name = f"local-smoke-{uuid.uuid4().hex[:12]}"
    client = api.LiveKitAPI("http://127.0.0.1:7880", key, secret)
    room = rtc.Room()
    source = rtc.AudioSource(48000, 1)
    sender = None
    egress_ids = []
    try:
        token = (
            api.AccessToken(key, secret)
            .with_identity("synthetic-candidate")
            .with_grants(api.VideoGrants(room_join=True, room=room_name))
            .to_jwt()
        )
        await asyncio.wait_for(room.connect("ws://127.0.0.1:7880", token), 20)
        track = rtc.LocalAudioTrack.create_audio_track("synthetic-tone", source)
        publication = await room.local_participant.publish_track(
            track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        )
        sender = asyncio.create_task(tone(source))
        print(
            json.dumps({"room": room_name, "rtc": "connected", "audio": "synthetic"}),
            flush=True,
        )
        if not record:
            await asyncio.sleep(3)
            return

        room_output = api.EncodedFileOutput(
            file_type=api.EncodedFileType.OGG, filepath=f"/tmp/{room_name}-room.ogg"
        )
        candidate_output = api.EncodedFileOutput(
            file_type=api.EncodedFileType.OGG,
            filepath=f"/tmp/{room_name}-candidate.ogg",
        )
        if use_application:
            result = await application("start", room_name)
            egress_ids.extend([result["egressId"], result["candidateEgressId"]])
        else:
            egress_ids.extend(
                await start_probe_recordings(
                    client,
                    room_name,
                    publication.sid,
                    room_output,
                    candidate_output,
                    candidate_track,
                )
            )
        for _ in range(45):
            entries = (
                await client.egress.list_egress(
                    api.ListEgressRequest(room_name=room_name)
                )
            ).items
            if any(
                e.status in (api.EGRESS_FAILED, api.EGRESS_ABORTED) for e in entries
            ):
                raise RuntimeError(
                    "Egress failed: " + "; ".join(e.error for e in entries if e.error)
                )
            if len(entries) == 2 and all(
                e.status == api.EGRESS_ACTIVE for e in entries
            ):
                break
            await asyncio.sleep(1)
        else:
            raise TimeoutError("Both egress jobs did not become active")
        print(json.dumps({"egress": "both_active"}), flush=True)
        await asyncio.sleep(5)
        for egress_id in egress_ids:
            await client.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id))
        egress_ids.clear()
        for _ in range(45):
            entries = (
                await client.egress.list_egress(
                    api.ListEgressRequest(room_name=room_name)
                )
            ).items
            if len(entries) == 2 and all(
                e.status == api.EGRESS_COMPLETE for e in entries
            ):
                results = [f for e in entries for f in e.file_results]
                assert len(results) == 2 and all(
                    f.size > 0 and f.duration > 0 for f in results
                )
                print(
                    json.dumps(
                        {
                            "recordings": [
                                {
                                    "file": f.filename,
                                    "bytes": f.size,
                                    "duration_ns": f.duration,
                                }
                                for f in results
                            ]
                        }
                    ),
                    flush=True,
                )
                if use_application:
                    print(
                        json.dumps(await application("verify", room_name)), flush=True
                    )
                return
            if any(
                e.status in (api.EGRESS_FAILED, api.EGRESS_ABORTED) for e in entries
            ):
                raise RuntimeError("Recording failed during finalization")
            await asyncio.sleep(1)
        raise TimeoutError("Recordings did not finalize")
    finally:
        for egress_id in egress_ids:
            with suppress(Exception):
                await client.egress.stop_egress(
                    api.StopEgressRequest(egress_id=egress_id)
                )
        if sender:
            sender.cancel()
            with suppress(asyncio.CancelledError):
                await sender
        await room.disconnect()
        await source.aclose()
        with suppress(Exception):
            await client.room.delete_room(api.DeleteRoomRequest(room=room_name))
        await client.aclose()


async def start_probe_recordings(
    client, room_name, track_id, room_output, candidate_output, candidate_track
):
    mixed = await client.egress.start_room_composite_egress(
        api.RoomCompositeEgressRequest(
            room_name=room_name, audio_only=True, file_outputs=[room_output]
        )
    )
    try:
        return await start_candidate_probe(
            client,
            room_name,
            track_id,
            candidate_output,
            candidate_track,
            mixed.egress_id,
        )
    except BaseException:
        with suppress(Exception):
            await client.egress.stop_egress(
                api.StopEgressRequest(egress_id=mixed.egress_id)
            )
        raise


async def start_candidate_probe(
    client, room_name, track_id, candidate_output, candidate_track, mixed_id
):
    if candidate_track:
        candidate = await client.egress.start_track_composite_egress(
            api.TrackCompositeEgressRequest(
                room_name=room_name,
                audio_track_id=track_id,
                file_outputs=[candidate_output],
            )
        )
    else:
        candidate = await client.egress.start_participant_egress(
            api.ParticipantEgressRequest(
                room_name=room_name,
                identity="synthetic-candidate",
                file_outputs=[candidate_output],
            )
        )
    return [mixed_id, candidate.egress_id]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", action="store_true")
    parser.add_argument("--candidate-track", action="store_true")
    parser.add_argument(
        "--application",
        action="store_true",
        help="Use application adapter and upload synthetic audio to configured R2",
    )
    args = parser.parse_args()
    asyncio.run(
        asyncio.wait_for(
            run(
                args.record or args.application, args.candidate_track, args.application
            ),
            150,
        )
    )
