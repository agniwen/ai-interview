import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../lib/server/db/index";
import {
  interviewContextSnapshot,
  interviewConversation,
  interviewEvidenceSnapshot,
  organization,
  studioInterview,
  studioInterviewSchedule,
} from "@app/db-schema/schema";
import type { InterviewContextSnapshotPayload } from "@app/db-schema/interview-snapshots";
import { createInterviewEvidenceSnapshot } from "../evidence-snapshot";

const ORG_ID = "test_evidence_snapshot_org";
const INTERVIEW_ID = "test_evidence_snapshot_interview";
const ROUND_ID = "test_evidence_snapshot_round";
const CONTEXT_ID = "test_evidence_context_snapshot";
const CONVERSATION_ID = "test_evidence_conversation";
const NOW = new Date("2026-06-26T12:00:00.000Z");

const contextPayload: InterviewContextSnapshotPayload = {
  candidate: {
    candidateEmail: "evidence@example.com",
    candidateName: "Evidence Candidate",
    candidatePhone: null,
    resumeProfile: null,
    targetRole: "Engineer",
  },
  createdAt: NOW.toISOString(),
  forms: [],
  globalConfig: {
    closingInstructions: "",
    companyContext: "Evidence company",
    openingInstructions: "",
  },
  interviewRecordId: INTERVIEW_ID,
  interviewers: [],
  jobDescription: null,
  personalizedQuestions: [],
  questionTemplates: [],
  scheduleEntryId: ROUND_ID,
  schemaVersion: 1,
};

async function cleanup() {
  await db
    .delete(interviewEvidenceSnapshot)
    .where(eq(interviewEvidenceSnapshot.conversationId, CONVERSATION_ID));
  await db
    .delete(interviewConversation)
    .where(eq(interviewConversation.conversationId, CONVERSATION_ID));
  await db.delete(interviewContextSnapshot).where(eq(interviewContextSnapshot.id, CONTEXT_ID));
  await db.delete(studioInterviewSchedule).where(eq(studioInterviewSchedule.id, ROUND_ID));
  await db.delete(studioInterview).where(eq(studioInterview.id, INTERVIEW_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "Evidence Snapshot Org",
    slug: ORG_ID,
  });
  await db.insert(studioInterview).values({
    candidateName: "Evidence Candidate",
    createdAt: NOW,
    id: INTERVIEW_ID,
    interviewQuestions: [],
    organizationId: ORG_ID,
    targetRole: "Engineer",
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values({
    createdAt: NOW,
    id: ROUND_ID,
    interviewRecordId: INTERVIEW_ID,
    organizationId: ORG_ID,
    roundLabel: "AI 面试",
    scheduledAt: null,
    sortOrder: 0,
    status: "completed",
    updatedAt: NOW,
  });
  await db.insert(interviewContextSnapshot).values({
    contentHash: "context-hash",
    createdAt: NOW,
    id: CONTEXT_ID,
    interviewRecordId: INTERVIEW_ID,
    organizationId: ORG_ID,
    payload: contextPayload,
    reason: "create",
    scheduleEntryId: ROUND_ID,
    status: "active",
    version: 1,
  });
  await db.insert(interviewConversation).values({
    conversationId: CONVERSATION_ID,
    createdAt: NOW,
    interviewRecordId: INTERVIEW_ID,
    lastSyncedAt: NOW,
    organizationId: ORG_ID,
    recordingDurationSecs: 120,
    recordingEgressId: "egress-1",
    recordingFileKey: "recordings/test.mp4",
    recordingStatus: "completed",
    scheduleEntryId: ROUND_ID,
    status: "completed",
    transcript: [
      { message: "请介绍项目", role: "agent", timeInCallSecs: 1 },
      { message: "我做过支付系统", role: "user", timeInCallSecs: 8 },
    ],
  });
}, 30_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("createInterviewEvidenceSnapshot", () => {
  it("creates an idempotent evidence snapshot for a conversation", async () => {
    const first = await createInterviewEvidenceSnapshot({
      conversationId: CONVERSATION_ID,
      interviewRecordId: INTERVIEW_ID,
    });
    const second = await createInterviewEvidenceSnapshot({
      conversationId: CONVERSATION_ID,
      interviewRecordId: INTERVIEW_ID,
    });

    expect(second.id).toBe(first.id);
    expect(first.payload.contextSnapshotId).toBe(CONTEXT_ID);
    expect(first.payload.context.candidate.candidateName).toBe("Evidence Candidate");
    expect(first.payload.transcript).toHaveLength(2);
    expect(first.payload.recording.fileKey).toBe("recordings/test.mp4");
  }, 60_000);
});
