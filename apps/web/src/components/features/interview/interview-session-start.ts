import type { useSession } from "@livekit/components-react";

type InterviewSession = ReturnType<typeof useSession>;

export async function startInterviewSession({
  microphoneDeviceId = "default",
  recordingEnabled,
  session,
  startMuted,
}: {
  microphoneDeviceId?: string;
  recordingEnabled: boolean;
  session: InterviewSession;
  startMuted: boolean;
}) {
  // Before connecting this only sets the room's capture default, so the first microphone track
  // already uses the device the candidate picked on the entry page.
  if (microphoneDeviceId !== "default") {
    await session.room.switchActiveDevice("audioinput", microphoneDeviceId, false);
  }
  await session.start({
    tracks: {
      // Enable camera by default so server-side RoomCompositeEgress captures
      // video; if the browser denies permission, LiveKit skips that track.
      camera: {
        enabled: recordingEnabled,
      },
      microphone: {
        enabled: !startMuted,
        publishOptions: {
          // @ts-expect-error Preserve the existing capture-option call shape.
          audioCaptureOptions: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
          // Capture speech while room.connect is in progress so the agent can
          // receive the candidate's first words through the pre-connect buffer.
          preConnectBuffer: true,
        },
      },
    },
  });

  // LiveKit replaces the `default` alias with the physical device id after
  // publishing. Switch only after the session has connected so device changes
  // cannot race the initial microphone capture and track publication.
  await session.room.switchActiveDevice("audioinput", microphoneDeviceId, false);
}
