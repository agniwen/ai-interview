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

  it("deduplicates reordered manifests but retries a newly recovered file", () => {
    const tracks = ["candidate", "interviewer"].map((role, index) => ({
      displayName: role,
      durationMs: 4000,
      egressId: `EG_${index}`,
      endedAtMs: 6000,
      error: null,
      fileKey: `${role}.ogg`,
      id: `55efbc70-c0ba-496b-bd67-9e3b4d46210${index}`,
      participantIdentity: role,
      publishedAtMs: 1000,
      role,
      sizeBytes: 100,
      startedAtMs: 2000,
      status: "completed",
      trackId: `TR_${index}`,
      updatedAtMs: 6000,
    }));
    const parsed = humanInterviewRecordingJobSchema.parse({
      meetingId: "meeting",
      organizationId: "org",
      tracks,
      version: 2,
    });
    const reversed = humanInterviewRecordingJobSchema.parse({
      ...parsed,
      tracks: tracks.toReversed(),
    });
    expect(buildHumanInterviewRecordingJobId(parsed)).toBe(
      buildHumanInterviewRecordingJobId(reversed),
    );
    expect(
      buildHumanInterviewRecordingJobId(
        humanInterviewRecordingJobSchema.parse({
          ...parsed,
          tracks: tracks.map((track) => ({ ...track, status: "failed" })),
        }),
      ),
    ).not.toBe(buildHumanInterviewRecordingJobId(parsed));
  });
});
