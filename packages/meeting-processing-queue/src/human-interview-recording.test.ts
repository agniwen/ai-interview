import { describe, expect, it } from "vitest";
import {
  buildHumanInterviewRecordingJobId,
  humanInterviewRecordingJobSchema,
} from "./human-interview-recording";

describe("human interview recording queue contract", () => {
  const job = {
    candidateDurationMs: 60_000,
    candidateEgressId: "candidate-egress-1",
    candidateFileKey: "human-interviews/org/meeting/candidate-audio.ogg",
    candidateSizeBytes: 512,
    durationMs: 60_000,
    egressId: "egress-1",
    fileKey: "human-interviews/org/meeting/room-audio.ogg",
    meetingId: "meeting-1",
    organizationId: "org-1",
    sizeBytes: 1024,
  };

  it("校验录音入库任务并生成稳定 job id", () => {
    expect(humanInterviewRecordingJobSchema.parse(job)).toEqual(job);
    expect(buildHumanInterviewRecordingJobId(job)).toBe(buildHumanInterviewRecordingJobId(job));
    expect(buildHumanInterviewRecordingJobId({ ...job, egressId: "egress-2" })).not.toBe(
      buildHumanInterviewRecordingJobId(job),
    );
  });
});
