import { and, eq } from "drizzle-orm";
import type { InterviewEvidenceSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import { db } from "@app/server/lib/server/db";
import { serializeDate } from "@app/server/lib/server/db/serialize";
import { jsonValueSchema } from "@app/server/lib/server/stable-stringify";
import { interviewConversation, interviewEvidenceSnapshot } from "@arc/db-schema/schema";
import { loadSubmissionsByInterview } from "@app/server/server/routes/studio/routes/forms/dao/submissions";
import {
  hashSnapshotPayload,
  loadActiveInterviewContextSnapshot,
} from "@app/server/server/routes/studio/routes/interviews/dao/context-snapshots";
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
  row: typeof interviewEvidenceSnapshot.$inferSelect,
): InterviewEvidenceSnapshotRecord {
  return {
    contentHash: row.contentHash,
    contextSnapshotId: row.contextSnapshotId,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt),
    id: row.id,
    interviewRecordId: row.interviewRecordId,
    organizationId: row.organizationId,
    payload: row.payload,
    scheduleEntryId: row.scheduleEntryId,
  };
}

const productionDependencies: EvidenceSnapshotDependencies = {
  findExistingSnapshot: async (conversationId, contentHash) => {
    const [existing] = await db
      .select()
      .from(interviewEvidenceSnapshot)
      .where(
        and(
          eq(interviewEvidenceSnapshot.conversationId, conversationId),
          eq(interviewEvidenceSnapshot.contentHash, contentHash),
        ),
      )
      .limit(1);
    return existing ? serializeEvidenceRow(existing) : null;
  },
  hashSnapshotPayload: (payload) => hashSnapshotPayload(jsonValueSchema.parse(payload)),
  insertSnapshot: async (input) => {
    const [inserted] = await db.insert(interviewEvidenceSnapshot).values(input).returning();
    return inserted ? serializeEvidenceRow(inserted) : null;
  },
  loadContextSnapshot: loadActiveInterviewContextSnapshot,
  loadConversation: async (conversationId, interviewRecordId) => {
    const [conversation] = await db
      .select({
        lastSyncedAt: interviewConversation.lastSyncedAt,
        organizationId: interviewConversation.organizationId,
        recordingDurationSecs: interviewConversation.recordingDurationSecs,
        recordingEgressId: interviewConversation.recordingEgressId,
        recordingFileKey: interviewConversation.recordingFileKey,
        recordingStatus: interviewConversation.recordingStatus,
        scheduleEntryId: interviewConversation.scheduleEntryId,
        transcript: interviewConversation.transcript,
        updatedAt: interviewConversation.updatedAt,
        webhookReceivedAt: interviewConversation.webhookReceivedAt,
      })
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.conversationId, conversationId),
          eq(interviewConversation.interviewRecordId, interviewRecordId),
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
