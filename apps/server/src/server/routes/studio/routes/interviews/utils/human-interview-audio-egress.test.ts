import { describe, expect, it, vi } from "vitest";
import { EncodedFileType, TrackSource, TrackType } from "livekit-server-sdk";
import { startHumanInterviewRoomRecording } from "./human-interview-recording";

const input = {
  candidateFileKey: "human-interviews/org/meeting/candidate-audio.ogg",
  candidateIdentity: "candidate_round-1",
  fileKey: "human-interviews/org/meeting/room-audio.ogg",
  roomName: "human_meeting",
};

function setup() {
  const client = {
    listEgress: vi.fn(() => Promise.resolve([])),
    startParticipantEgress: vi.fn(() =>
      Promise.reject(new Error("no supported codec is compatible with all outputs")),
    ),
    startRoomCompositeEgress: vi.fn(() => Promise.resolve({ egressId: "egress-room" })),
    startTrackCompositeEgress: vi.fn(() => Promise.resolve({ egressId: "egress-candidate" })),
    stopEgress: vi.fn(() => Promise.resolve({})),
  };
  const getParticipant = vi.fn(() =>
    Promise.resolve({
      tracks: [
        { sid: "camera", source: TrackSource.CAMERA, type: TrackType.VIDEO },
        { sid: "share-audio", source: TrackSource.SCREEN_SHARE_AUDIO, type: TrackType.AUDIO },
        { sid: "candidate-mic", source: TrackSource.MICROPHONE, type: TrackType.AUDIO },
      ],
    }),
  );
  return {
    client,
    dependencies: {
      createEgressClient: () => client,
      getParticipant,
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
    getParticipant,
  };
}

describe("candidate microphone egress", () => {
  it("keeps dual OGG outputs but only records the candidate microphone", async () => {
    const { client, dependencies, getParticipant } = setup();
    await expect(startHumanInterviewRoomRecording(input, dependencies)).resolves.toEqual({
      candidateEgressId: "egress-candidate",
      egressId: "egress-room",
    });
    expect(getParticipant).toHaveBeenCalledWith(input.roomName, input.candidateIdentity);
    expect(client.startRoomCompositeEgress).toHaveBeenCalledWith(
      input.roomName,
      expect.objectContaining({ fileType: EncodedFileType.OGG, filepath: input.fileKey }),
      { audioOnly: true },
    );
    expect(client.startTrackCompositeEgress).toHaveBeenCalledWith(
      input.roomName,
      expect.objectContaining({
        fileType: EncodedFileType.OGG,
        filepath: input.candidateFileKey,
        output: { case: "s3", value: expect.objectContaining({ bucket: "recordings" }) },
      }),
      { audioTrackId: "candidate-mic" },
    );
    expect(client.startParticipantEgress).not.toHaveBeenCalled();
  });

  it("does not start either output before the microphone is published", async () => {
    const { client, dependencies, getParticipant } = setup();
    getParticipant.mockResolvedValue({
      tracks: [{ sid: "share", source: TrackSource.SCREEN_SHARE_AUDIO, type: TrackType.AUDIO }],
    });
    await expect(startHumanInterviewRoomRecording(input, dependencies)).rejects.toThrow(
      "候选人麦克风音轨尚未发布",
    );
    expect(client.startRoomCompositeEgress).not.toHaveBeenCalled();
    expect(client.startTrackCompositeEgress).not.toHaveBeenCalled();
  });

  it("stops the room output when candidate startup fails", async () => {
    const { client, dependencies } = setup();
    client.startTrackCompositeEgress.mockRejectedValue(new Error("egress unavailable"));
    await expect(startHumanInterviewRoomRecording(input, dependencies)).rejects.toThrow(
      "egress unavailable",
    );
    expect(client.stopEgress).toHaveBeenCalledWith("egress-room");
  });

  it("stops the room output when the candidate task ID is missing", async () => {
    const { client, dependencies } = setup();
    client.startTrackCompositeEgress.mockResolvedValue({ egressId: "" });
    await expect(startHumanInterviewRoomRecording(input, dependencies)).rejects.toThrow(
      "LiveKit 未返回候选人录音任务 ID",
    );
    expect(client.stopEgress).toHaveBeenCalledWith("egress-room");
  });
});
