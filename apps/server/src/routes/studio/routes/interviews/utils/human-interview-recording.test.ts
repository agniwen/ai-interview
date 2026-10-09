import { describe, expect, it, vi } from "vitest";
import { EncodedFileType, TrackSource, TrackType } from "livekit-server-sdk";
import type { EncodedFileOutput } from "livekit-server-sdk";
import { startHumanInterviewRoomRecording } from "./human-interview-recording";

describe("startHumanInterviewRoomRecording", () => {
  it("同时创建完整会议混音和候选人参与者音轨", async () => {
    const startRoomCompositeEgress = vi.fn(
      (_roomName: string, _output: EncodedFileOutput, _options: { audioOnly: true }) =>
        Promise.resolve({ egressId: "egress-1" }),
    );
    const stopEgress = vi.fn((_egressId: string) => Promise.resolve({}));
    const startTrackCompositeEgress = vi.fn(() =>
      Promise.resolve({ egressId: "egress-candidate" }),
    );

    await expect(
      startHumanInterviewRoomRecording(
        {
          candidateFileKey: "human-interviews/org/meeting/candidate-audio.ogg",
          candidateIdentity: "candidate_round-1",
          fileKey: "human-interviews/org/meeting/room-audio.ogg",
          roomName: "human_meeting",
        },
        {
          createEgressClient: () => ({
            listEgress: () => Promise.resolve([]),
            startRoomCompositeEgress,
            startTrackCompositeEgress,
            stopEgress,
          }),
          getParticipant: () =>
            Promise.resolve({
              tracks: [
                { sid: "candidate-mic", source: TrackSource.MICROPHONE, type: TrackType.AUDIO },
              ],
            }),
          loadUploadConfig: () =>
            Promise.resolve({
              accessKey: "access",
              bucket: "recordings",
              endpoint: "https://r2.example.com",
              forcePathStyle: true,
              region: "auto",
              secret: "secret",
            }),
        },
      ),
    ).resolves.toEqual({ candidateEgressId: "egress-candidate", egressId: "egress-1" });

    expect(startRoomCompositeEgress).toHaveBeenCalledTimes(1);
    const [roomName, output, options] = startRoomCompositeEgress.mock.calls[0] ?? [];
    expect(roomName).toBe("human_meeting");
    expect(options).toEqual({ audioOnly: true });
    expect(output).toMatchObject({
      fileType: EncodedFileType.OGG,
      filepath: "human-interviews/org/meeting/room-audio.ogg",
      output: { case: "s3" },
    });
    expect(startTrackCompositeEgress).toHaveBeenCalledWith(
      "human_meeting",
      expect.objectContaining({
        filepath: "human-interviews/org/meeting/candidate-audio.ogg",
      }),
      { audioTrackId: "candidate-mic" },
    );
  });
});
