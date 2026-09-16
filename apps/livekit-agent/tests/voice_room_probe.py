"""Opt-in real RTC audio probe; synthetic data, no recruiting callbacks.

Run from the agent directory:
  uv run python tests/voice_room_probe.py
Requires /tmp/ai-interview-voice-probe/{interrupt,backchannel,continue}.wav.
VOICE_PROBE_PAUSE=1 uses unfinished.wav and remainder.wav instead.
VOICE_PROBE_CONTROLLED=1 uses a deliberately verbose speaker to guarantee overlap;
otherwise this runs the real interview agent against two synthetic questions.
VOICE_PROBE_LABEL selects the artifact subdirectory. See VOICE_INTERRUPTION_E2E.md.
Uses two authenticated participants and deletes only its uniquely named room.
API references: https://docs.livekit.io/transport/media/raw-tracks/
and https://docs.livekit.io/agents/logic/turns/.
"""

import asyncio
import json
import math
import os
import sys
import time
import uuid
import wave
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import Agent, AgentSession, llm, room_io
from test_realtime_interview_agent import context

from qwen_realtime import RealtimeModel
from realtime_interview_agent import RealtimeInterviewAgent


async def main():
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    clips = Path("/tmp/ai-interview-voice-probe")
    output = clips / os.getenv("VOICE_PROBE_LABEL", "baseline")
    output.mkdir(exist_ok=True)
    room_name = f"voice-probe-{uuid.uuid4().hex[:12]}"
    events = []
    started = time.monotonic()

    def note(kind, **values):
        event = {"t": round(time.monotonic() - started, 3), "kind": kind, **values}
        events.append(event)
        if kind != "audio":
            print(json.dumps(event, ensure_ascii=False), flush=True)

    def token(identity, kind):
        return (
            api.AccessToken(
                os.environ["LIVEKIT_API_KEY"], os.environ["LIVEKIT_API_SECRET"]
            )
            .with_identity(identity)
            .with_kind(kind)
            .with_grants(api.VideoGrants(room_join=True, room=room_name))
            .to_jwt()
        )

    async with api.LiveKitAPI() as client:
        await client.room.create_room(api.CreateRoomRequest(name=room_name))
        host, candidate = rtc.Room(), rtc.Room()
        readers = []
        remote_frames = []

        async def read_audio(track):
            stream = rtc.AudioStream(track, sample_rate=24000, num_channels=1)
            try:
                async for event in stream:
                    raw = event.frame.data.tobytes()
                    samples = array("h", raw)
                    rms = math.sqrt(sum(x * x for x in samples) / len(samples))
                    remote_frames.append((time.monotonic() - started, raw))
                    note("audio", rms=round(rms, 1))
            finally:
                await stream.aclose()

        @candidate.on("track_subscribed")
        def subscribed(track, publication, participant):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                readers.append(asyncio.create_task(read_audio(track)))

        source = rtc.AudioSource(24000, 1, queue_size_ms=100)

        class TracedModel(RealtimeModel):
            def session(self, **kwargs):
                result = super().session(**kwargs)
                original = result._handle_event

                def handle(event):
                    if event["type"].startswith(
                        ("input_audio_buffer.speech_", "conversation.item.ambient_")
                    ):
                        note("provider", event=event)
                    original(event)

                result._handle_event = handle
                return result

        model = TracedModel.from_env()
        session = AgentSession(
            llm=model, turn_handling={"turn_detection": "realtime_llm"}
        )
        agent = RealtimeInterviewAgent(context())
        controlled = os.getenv("VOICE_PROBE_CONTROLLED") == "1"

        class LongSpeaker(Agent):
            async def on_enter(self):
                self.session.generate_reply(
                    user_input="请详细介绍项目复盘的方法，至少讲六个方面，每个方面两句话。"
                )

        speaker = (
            LongSpeaker(
                instructions="你是中文面试官，详细回答用户问题，每次至少讲150字。用户打断时立即停下倾听，不要忽略更正。"
            )
            if controlled
            else agent
        )
        speaking = asyncio.Event()

        @session.on("agent_state_changed")
        def state(event):
            note("agent_state", state=event.new_state)
            if event.new_state == "speaking":
                speaking.set()

        @session.on("user_state_changed")
        def user_state(event):
            note("user_state", state=event.new_state)

        @session.on("conversation_item_added")
        def item(event):
            if not isinstance(event.item, llm.ChatMessage):
                return
            note(
                "transcript",
                role=event.item.role,
                text=event.item.text_content,
                interrupted=event.item.interrupted,
            )

        @session.on("error")
        def error(event):
            note("error", error=str(event.error))

        async def silence(seconds):
            for _ in range(int(seconds / 0.02)):
                await source.capture_frame(rtc.AudioFrame(bytes(960), 24000, 1, 480))
                await asyncio.sleep(0.02)

        async def say(name):
            note("candidate_start", clip=name)
            with wave.open(str(clips / f"{name}.wav"), "rb") as file:
                assert file.getframerate() == 24000 and file.getnchannels() == 1
                while raw := file.readframes(480):
                    raw = raw.ljust(960, b"\0")
                    await source.capture_frame(rtc.AudioFrame(raw, 24000, 1, 480))
                    await asyncio.sleep(0.02)
            await source.wait_for_playout()
            note("candidate_end", clip=name)

        try:
            await host.connect(os.environ["LIVEKIT_URL"], token("probe-agent", "agent"))
            await candidate.connect(
                os.environ["LIVEKIT_URL"], token("probe-candidate", "standard")
            )
            track = rtc.LocalAudioTrack.create_audio_track("probe-microphone", source)
            await candidate.local_participant.publish_track(
                track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
            )
            await session.start(
                speaker,
                room=host,
                room_options=room_io.RoomOptions(
                    participant_identity="probe-candidate",
                    close_on_disconnect=False,
                ),
            )
            await asyncio.wait_for(speaking.wait(), 40)
            if os.getenv("VOICE_PROBE_PAUSE") == "1":
                await silence(8)
                await say("unfinished")
                await silence(0.6)
                await say("remainder")
                await silence(15)
                note("checkpoint", state=await agent.get_interview_state())
                first = next(e["t"] for e in events if e["kind"] == "candidate_start")
                last = max(e["t"] for e in events if e["kind"] == "candidate_end")
                assert not any(
                    e["kind"] == "agent_state"
                    and e["state"] == "speaking"
                    and first < e["t"] < last
                    for e in events
                ), "Agent spoke before the paused answer finished"
                assert agent.question_outcomes, "Spoken answer was not saved"
                assert remote_frames, "No remote audio was captured"
                return
            # Exclude the SDK's initial 3-second AEC warmup from model timing.
            await silence(4)
            await say("interrupt")
            await silence(12)
            if not controlled:
                note("checkpoint", state=await agent.get_interview_state())

            if session.agent_state != "speaking":
                speaking.clear()
                session.generate_reply(
                    user_input="请详细解释项目经历可以从背景、职责、难点、方案、结果几个方面说明，每个方面各说两句话。"
                )
                await asyncio.wait_for(speaking.wait(), 30)
            await silence(1)
            await say("backchannel")
            await silence(4)
            await say("continue")
            await silence(15)
            if not controlled:
                note("checkpoint", state=await agent.get_interview_state())
                assert agent.question_outcomes, "Spoken facts were not saved"
            else:
                assert any(
                    e["kind"] == "transcript"
                    and e["role"] == "assistant"
                    and e["interrupted"]
                    for e in events
                ), "No live interruption was observed"
            assert remote_frames, "No remote audio was captured"
            assert not any(e["kind"] == "error" for e in events), "Session failed"
        finally:
            await session.aclose()
            await model.aclose()
            await candidate.disconnect()
            await host.disconnect()
            await source.aclose()
            for task in readers:
                task.cancel()
            results = await asyncio.gather(*readers, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    note("reader_error", error=str(result))
            await client.room.delete_room(api.DeleteRoomRequest(room=room_name))
            output.joinpath("events.json").write_text(
                json.dumps(events, ensure_ascii=False, indent=2)
            )
            if remote_frames:
                timeline = bytearray(int((remote_frames[-1][0] + 1) * 24000) * 2)
                for timestamp, raw in remote_frames:
                    offset = int(timestamp * 24000) * 2
                    timeline[offset : offset + len(raw)] = raw
                with wave.open(str(output / "agent.wav"), "wb") as file:
                    file.setnchannels(1)
                    file.setsampwidth(2)
                    file.setframerate(24000)
                    file.writeframes(timeline)


if __name__ == "__main__":
    asyncio.run(main())
