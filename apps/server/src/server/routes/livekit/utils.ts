import { TrackSource, TrackType } from "@livekit/protocol";

export function shouldStartHumanInterviewRecording(event: {
  event: string;
  participant?: { identity: string };
  room?: { name: string };
  track?: { source: TrackSource; type: TrackType };
}): boolean {
  if (!event.room?.name.startsWith("human_")) {
    return false;
  }
  // Joining may precede microphone publication; the recording claim prevents duplicate starts.
  return Boolean(
    (event.event === "participant_joined" && event.participant?.identity) ||
    (event.event === "track_published" &&
      event.participant?.identity.startsWith("candidate_") &&
      event.track?.source === TrackSource.MICROPHONE &&
      event.track.type === TrackType.AUDIO),
  );
}
