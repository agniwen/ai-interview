import type { useSession } from "@livekit/components-react";

type InterviewSession = ReturnType<typeof useSession>;

export async function startInterviewSession({
  recordingEnabled,
  session,
  startMuted,
}: {
  recordingEnabled: boolean;
  session: InterviewSession;
  startMuted: boolean;
}) {
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
  await session.room.switchActiveDevice("audioinput", "default", false);
}
