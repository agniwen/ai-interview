import { and, eq } from "drizzle-orm";
import type { InterviewEvidenceSnapshotPayload } from "@app/db-schema/interview-snapshots";
import { db } from "../../../../lib/server/db/index";
import { serializeDate } from "../../../../lib/server/db/serialize";
import { jsonValueSchema } from "../../../../lib/server/stable-stringify";
import { aiInterviewConversation, recruitingEvidenceSnapshot } from "@app/db-schema/schema";
import { loadSubmissionsByInterview } from "../../studio/routes/forms/dao/submissions";
import {
  hashSnapshotPayload,
  loadActiveInterviewContextSnapshot,
} from "../../studio/routes/interviews/dao/context-snapshots";
import { createInterviewEvidenceSnapshotWithDependencies } from "./evidence-snapshot-core";
import type { EvidenceSnapshotDependencies } from "./evidence-snapshot-core";

export interface CreateInterviewEvidenceSnapshotOptions {
  conversationId: string;
  interviewRecordId: string;
}

export interface InterviewEvidenceSnapshotRecord {
  contentHash: string;
  contextSnapshotId: string;
  conversationId: string;
  createdAt: string;
  id: string;
  interviewRecordId: string;
  organizationId: string;
  payload: InterviewEvidenceSnapshotPayload;
  scheduleEntryId: string | null;
}

function serializeEvidenceRow(
  row: typeof recruitingEvidenceSnapshot.$inferSelect,
): InterviewEvidenceSnapshotRecord {
  return {
    contentHash: row.contentHash,
    contextSnapshotId: row.contextSnapshotId,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt),
    id: row.id,
    interviewRecordId: row.recruitingRecordId,
    organizationId: row.organizationId,
    payload: row.payload,
    scheduleEntryId: row.aiRoundId,
  };
}

const productionDependencies: EvidenceSnapshotDependencies = {
  findExistingSnapshot: async (conversationId, contentHash) => {
    const [existing] = await db
      .select()
      .from(recruitingEvidenceSnapshot)
      .where(
        and(
          eq(recruitingEvidenceSnapshot.conversationId, conversationId),
          eq(recruitingEvidenceSnapshot.contentHash, contentHash),
        ),
      )
      .limit(1);
    return existing ? serializeEvidenceRow(existing) : null;
  },
  hashSnapshotPayload: (payload) => hashSnapshotPayload(jsonValueSchema.parse(payload)),
  insertSnapshot: async (input) => {
    const [inserted] = await db
      .insert(recruitingEvidenceSnapshot)
      .values({
        ...input,
        aiRoundId: input.scheduleEntryId,
        recruitingRecordId: input.interviewRecordId,
      })
      .returning();
    return inserted ? serializeEvidenceRow(inserted) : null;
  },
  loadContextSnapshot: loadActiveInterviewContextSnapshot,
  loadConversation: async (conversationId, interviewRecordId) => {
    const [conversation] = await db
      .select({
        lastSyncedAt: aiInterviewConversation.lastSyncedAt,
        organizationId: aiInterviewConversation.organizationId,
        recordingDurationSecs: aiInterviewConversation.recordingDurationSecs,
        recordingEgressId: aiInterviewConversation.recordingEgressId,
        recordingFileKey: aiInterviewConversation.recordingFileKey,
        recordingStatus: aiInterviewConversation.recordingStatus,
        scheduleEntryId: aiInterviewConversation.aiRoundId,
        transcript: aiInterviewConversation.transcript,
        updatedAt: aiInterviewConversation.updatedAt,
        webhookReceivedAt: aiInterviewConversation.webhookReceivedAt,
      })
      .from(aiInterviewConversation)
      .where(
        and(
          eq(aiInterviewConversation.conversationId, conversationId),
          eq(aiInterviewConversation.recruitingRecordId, interviewRecordId),
        ),
      )
      .limit(1);
    return conversation ?? null;
  },
  loadSubmissions: async (interviewRecordId) => {
    const submissions = await loadSubmissionsByInterview(interviewRecordId);
    return submissions.map((submission) => ({
      ...submission,
      submittedAt: new Date(submission.submittedAt),
    }));
  },
};

export function createInterviewEvidenceSnapshot(
  options: CreateInterviewEvidenceSnapshotOptions,
): Promise<InterviewEvidenceSnapshotRecord> {
  return createInterviewEvidenceSnapshotWithDependencies(options, productionDependencies);
}
