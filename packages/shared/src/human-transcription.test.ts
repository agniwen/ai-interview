import { describe, expect, it } from "vitest";
import {
  appendHumanTranscriptionSchema,
  humanTranscriptionJobSchema,
  humanTranscriptionCallbackSchema,
} from "./human-transcription";

const job = {
  executionId: "00000000-0000-4000-8000-000000000001",
  generation: 1,
  kind: "human_interview_transcription",
  meetingId: "meeting",
  organizationId: "org",
  roomName: "human_meeting_abc",
  runId: "run",
  schemaVersion: 1,
};

describe("human transcription contract", () => {
  it("requires a per-execution identity on callbacks but not on dispatch metadata", () => {
    const { executionId, ...metadata } = job;
    expect(humanTranscriptionJobSchema.safeParse(metadata).success).toBe(true);
    expect(humanTranscriptionCallbackSchema.safeParse(metadata).success).toBe(false);
    expect(humanTranscriptionCallbackSchema.safeParse({ ...metadata, executionId }).success).toBe(
      true,
    );
    expect(
      humanTranscriptionCallbackSchema.safeParse({ ...metadata, executionId: "" }).success,
    ).toBe(false);
    expect(appendHumanTranscriptionSchema.safeParse({ ...metadata, events: [] }).success).toBe(
      false,
    );
  });
  it("rejects unknown versions, generations and room families", () => {
    expect(humanTranscriptionJobSchema.safeParse(job).success).toBe(true);
    for (const invalid of [
      { schemaVersion: 2 },
      { generation: 0 },
      { generation: true },
      { roomName: "ai_room" },
    ]) {
      expect(humanTranscriptionJobSchema.safeParse({ ...job, ...invalid }).success).toBe(false);
    }
  });
  it("rejects reversed audio ranges and oversized batches", () => {
    const event = {
      endMs: 90,
      eventId: "e",
      itemId: "1",
      kind: "final",
      participantIdentity: "candidate_round",
      providerTaskId: "provider",
      revision: 0,
      startMs: 100,
      streamEpoch: "epoch",
      text: "回答",
      trackId: "track",
    };
    expect(appendHumanTranscriptionSchema.safeParse({ ...job, events: [event] }).success).toBe(
      false,
    );
    expect(
      appendHumanTranscriptionSchema.safeParse({
        ...job,
        events: Array.from({ length: 101 }, () => ({ ...event, endMs: 120 })),
      }).success,
    ).toBe(false);
  });
});
