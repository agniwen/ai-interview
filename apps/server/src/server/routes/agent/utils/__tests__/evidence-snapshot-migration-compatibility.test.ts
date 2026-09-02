import { beforeEach, describe, expect, it } from "vitest";
import type { InterviewContextSnapshotPayload } from "@app/db-schema/interview-snapshots";
import { createInterviewEvidenceSnapshotWithDependencies } from "../evidence-snapshot-core";
import type {
  EvidenceSnapshotConversation,
  EvidenceSnapshotDependencies,
} from "../evidence-snapshot-core";

const generatedAt = new Date("2026-07-27T04:00:00.000Z");
const contextPayload: InterviewContextSnapshotPayload = {
  candidate: {
    candidateEmail: null,
    candidateName: "候选人",
    candidatePhone: null,
    resumeProfile: null,
    targetRole: null,
  },
  createdAt: generatedAt.toISOString(),
  forms: [],
  globalConfig: {
    closingInstructions: null,
    companyContext: null,
    openingInstructions: null,
  },
  interviewRecordId: "interview-1",
  interviewers: [],
  jobDescription: null,
  personalizedQuestions: [],
  questionTemplates: [],
  scheduleEntryId: "round-1",
  schemaVersion: 1,
};

const conversation: EvidenceSnapshotConversation = {
  lastSyncedAt: generatedAt,
  organizationId: "org-1",
  recordingDurationSecs: null,
  recordingEgressId: null,
  recordingFileKey: null,
  recordingStatus: null,
  scheduleEntryId: "round-1",
  transcript: [{ message: "候选人回答", role: "user" }],
  updatedAt: generatedAt,
  webhookReceivedAt: generatedAt,
};

const inserted: string[] = [];
const calls = {
  conversationLoads: 0,
  hashPayloads: 0,
  inserted,
};

const dependencies: EvidenceSnapshotDependencies = {
  findExistingSnapshot: () => Promise.resolve(null),
  hashSnapshotPayload: () => {
    calls.hashPayloads += 1;
    return "snapshot-hash";
  },
  insertSnapshot: (input) => {
    calls.inserted.push(input.id);
    return Promise.resolve({
      ...input,
      createdAt: input.createdAt.toISOString(),
    });
  },
  loadContextSnapshot: () =>
    Promise.resolve({
      id: "context-1",
      payload: contextPayload,
    }),
  loadConversation: () => {
    calls.conversationLoads += 1;
    return Promise.resolve(conversation);
  },
  loadSubmissions: () => Promise.resolve([]),
};

describe("createInterviewEvidenceSnapshot migration compatibility", () => {
  beforeEach(() => {
    calls.conversationLoads = 0;
    calls.hashPayloads = 0;
    calls.inserted.length = 0;
  });

  it("builds the snapshot through a typed dependency boundary", async () => {
    const snapshot = await createInterviewEvidenceSnapshotWithDependencies(
      {
        conversationId: "conversation-1",
        interviewRecordId: "interview-1",
      },
      dependencies,
    );

    expect(snapshot).toMatchObject({
      contextSnapshotId: "context-1",
      conversationId: "conversation-1",
      id: expect.any(String),
      interviewRecordId: "interview-1",
      organizationId: "org-1",
    });
    expect(snapshot.payload.transcript).toEqual(conversation.transcript);
    expect(calls.conversationLoads).toBe(1);
    expect(calls.hashPayloads).toBe(1);
    expect(calls.inserted).toHaveLength(1);
  });
});
