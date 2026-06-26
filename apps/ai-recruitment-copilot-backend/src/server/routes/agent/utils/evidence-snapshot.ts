import { and, eq } from "drizzle-orm";
import type { InterviewEvidenceSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { serializeDate } from "@arc/ai-recruitment-copilot-backend/lib/server/db/serialize";
import { interviewConversation, interviewEvidenceSnapshot } from "@arc/db-schema/schema";
import { loadSubmissionsByInterview } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/submissions";
import {
  hashSnapshotPayload,
  loadOrCreateActiveInterviewContextSnapshot,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";

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

export async function createInterviewEvidenceSnapshot(
  options: CreateInterviewEvidenceSnapshotOptions,
): Promise<InterviewEvidenceSnapshotRecord> {
  const [conversation] = await db
    .select()
    .from(interviewConversation)
    .where(
      and(
        eq(interviewConversation.conversationId, options.conversationId),
        eq(interviewConversation.interviewRecordId, options.interviewRecordId),
      ),
    )
    .limit(1);
  if (!conversation) {
    throw new Error(`interview conversation ${options.conversationId} not found`);
  }

  const contextSnapshot = await loadOrCreateActiveInterviewContextSnapshot({
    createdBy: null,
    interviewRecordId: options.interviewRecordId,
    reason: "create",
    scheduleEntryId: conversation.scheduleEntryId,
  });
  const submissions = await loadSubmissionsByInterview(options.interviewRecordId);
  const generatedAt =
    conversation.webhookReceivedAt ?? conversation.lastSyncedAt ?? conversation.updatedAt;

  const payload: InterviewEvidenceSnapshotPayload = {
    context: contextSnapshot.payload,
    contextSnapshotId: contextSnapshot.id,
    conversationId: options.conversationId,
    formSubmissions: submissions.map((submission) => ({
      answers: submission.answers,
      snapshot: submission.snapshot,
      submittedAt:
        typeof submission.submittedAt === "string"
          ? submission.submittedAt
          : submission.submittedAt.toISOString(),
      templateId: submission.templateId,
      version: submission.version,
      versionId: submission.versionId,
    })),
    generatedAt: generatedAt.toISOString(),
    interviewRecordId: options.interviewRecordId,
    recording: {
      durationSecs: conversation.recordingDurationSecs,
      egressId: conversation.recordingEgressId,
      fileKey: conversation.recordingFileKey,
      status: conversation.recordingStatus,
    },
    scheduleEntryId: conversation.scheduleEntryId,
    schemaVersion: 1,
    transcript: conversation.transcript,
  };
  const contentHash = hashSnapshotPayload(payload);

  const [existing] = await db
    .select()
    .from(interviewEvidenceSnapshot)
    .where(
      and(
        eq(interviewEvidenceSnapshot.conversationId, options.conversationId),
        eq(interviewEvidenceSnapshot.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return serializeEvidenceRow(existing);
  }

  const [inserted] = await db
    .insert(interviewEvidenceSnapshot)
    .values({
      contentHash,
      contextSnapshotId: contextSnapshot.id,
      conversationId: options.conversationId,
      createdAt: generatedAt,
      id: crypto.randomUUID(),
      interviewRecordId: options.interviewRecordId,
      organizationId: conversation.organizationId,
      payload,
      scheduleEntryId: conversation.scheduleEntryId,
    })
    .returning();
  if (!inserted) {
    throw new Error("interview evidence snapshot insert failed");
  }
  return serializeEvidenceRow(inserted);
}
