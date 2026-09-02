import { describe, expect, it, vi } from "vitest";
import {
  startEligibleHumanInterviewRecording,
  startEligibleHumanInterviewRecordingWithRetry,
} from "./human-interview-recording-service";

const claim = {
  candidateIdentity: "candidate_round-1",
  meetingId: "meeting-1",
  organizationId: "org-1",
  roomName: "human_room_1",
};

function dependencies() {
  return {
    buildCandidateFileKey: vi.fn(() =>
      Promise.resolve("human-interviews/org-1/meeting-1/candidate-audio.ogg"),
    ),
    buildFileKey: vi.fn(() => Promise.resolve("human-interviews/org-1/meeting-1/room-audio.ogg")),
    claimStart: vi.fn(() => Promise.resolve(claim)),
    findActiveRecordings: vi.fn(() => Promise.resolve<string[]>([])),
    markFailed: vi.fn(() => Promise.resolve()),
    markStarted: vi.fn(() => Promise.resolve(true)),
    sleep: vi.fn(() => Promise.resolve()),
    startRecording: vi.fn(() =>
      Promise.resolve({ candidateEgressId: "egress-candidate", egressId: "egress-new" }),
    ),
    stopRecording: vi.fn(() => Promise.resolve()),
  };
}

describe("startEligibleHumanInterviewRecording", () => {
  it("stops orphaned egresses before replacing a stale starting claim", async () => {
    const deps = dependencies();
    deps.findActiveRecordings.mockResolvedValue(["egress-existing"]);

    await startEligibleHumanInterviewRecording(claim.roomName, deps);

    expect(deps.stopRecording).toHaveBeenCalledWith("egress-existing");
    expect(deps.markStarted).toHaveBeenCalledWith({
      candidateEgressId: "egress-candidate",
      candidateFileKey: "human-interviews/org-1/meeting-1/candidate-audio.ogg",
      egressId: "egress-new",
      fileKey: "human-interviews/org-1/meeting-1/room-audio.ogg",
      meetingId: claim.meetingId,
    });
  });

  it("stops a newly-started egress when the room ended during startup", async () => {
    const deps = dependencies();
    deps.markStarted.mockResolvedValue(false);

    await startEligibleHumanInterviewRecording(claim.roomName, deps);

    expect(deps.stopRecording).toHaveBeenCalledWith("egress-new");
    expect(deps.stopRecording).toHaveBeenCalledWith("egress-candidate");
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("retries a transient recording start failure independently of another join event", async () => {
    const deps = dependencies();
    deps.startRecording
      .mockRejectedValueOnce(new Error("temporary LiveKit failure"))
      .mockResolvedValueOnce({
        candidateEgressId: "egress-candidate-retried",
        egressId: "egress-retried",
      });

    await startEligibleHumanInterviewRecordingWithRetry(claim.roomName, deps);

    expect(deps.claimStart).toHaveBeenCalledTimes(2);
    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.sleep).toHaveBeenCalledTimes(1);
    expect(deps.markStarted).toHaveBeenLastCalledWith({
      candidateEgressId: "egress-candidate-retried",
      candidateFileKey: "human-interviews/org-1/meeting-1/candidate-audio.ogg",
      egressId: "egress-retried",
      fileKey: "human-interviews/org-1/meeting-1/room-audio.ogg",
      meetingId: claim.meetingId,
    });
  });
});
