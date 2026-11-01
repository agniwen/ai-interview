interface TrackClaim {
  id: string;
  trackId: string;
  fileKey: string;
}

export async function recordHumanInterviewTracks(
  input: { roomName: string; tracks: TrackClaim[] },
  dependencies: {
    start: (input: { roomName: string; trackId: string; fileKey: string }) => Promise<string>;
    saveStarted: (input: { id: string; egressId: string }) => Promise<boolean>;
    saveStartError: (input: { id: string; error: string }) => Promise<void>;
    stop: (egressId: string) => Promise<void>;
  },
): Promise<void> {
  await Promise.all(
    input.tracks.map(async (track) => {
      try {
        const egressId = await dependencies.start({ ...track, roomName: input.roomName });
        const active = await dependencies.saveStarted({ egressId, id: track.id });
        if (!active) {
          await dependencies.stop(egressId);
        }
      } catch (error) {
        // A timed-out start may have succeeded remotely. Keep its file key for reconciliation.
        await dependencies.saveStartError({
          error: error instanceof Error ? error.message : "录音启动失败",
          id: track.id,
        });
      }
    }),
  );
}
