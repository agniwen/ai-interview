import type {
  InterviewContextSnapshotPayload,
  InterviewEvidenceSnapshotFormSubmission,
  InterviewEvidenceSnapshotPayload,
} from "@arc/db-schema/interview-snapshots";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewEvidenceSnapshotRecord } from "./evidence-snapshot";

export interface EvidenceSnapshotConversation {
  lastSyncedAt: Date | null;
  organizationId: string;
  recordingDurationSecs: number | null;
  recordingEgressId: string | null;
  recordingFileKey: string | null;
  recordingStatus: string | null;
  scheduleEntryId: string | null;
  transcript: InterviewTranscriptTurn[];
  updatedAt: Date;
  webhookReceivedAt: Date | null;
}

export interface EvidenceSnapshotContext {
  id: string;
  payload: InterviewContextSnapshotPayload;
}

export interface EvidenceSnapshotSubmission extends Omit<
  InterviewEvidenceSnapshotFormSubmission,
  "submittedAt"
> {
  submittedAt: Date;
}

export interface EvidenceSnapshotDependencies {
  findExistingSnapshot: (
    conversationId: string,
    contentHash: string,
  ) => Promise<InterviewEvidenceSnapshotRecord | null>;
  hashSnapshotPayload: (payload: InterviewEvidenceSnapshotPayload) => string;
  insertSnapshot: (input: {
    contentHash: string;
    contextSnapshotId: string;
    conversationId: string;
    createdAt: Date;
    id: string;
    interviewRecordId: string;
    organizationId: string;
    payload: InterviewEvidenceSnapshotPayload;
    scheduleEntryId: string | null;
  }) => Promise<InterviewEvidenceSnapshotRecord | null>;
  loadContextSnapshot: (interviewRecordId: string) => Promise<EvidenceSnapshotContext | null>;
  loadConversation: (
    conversationId: string,
    interviewRecordId: string,
  ) => Promise<EvidenceSnapshotConversation | null>;
  loadSubmissions: (interviewRecordId: string) => Promise<EvidenceSnapshotSubmission[]>;
}

export async function createInterviewEvidenceSnapshotWithDependencies(
  options: { conversationId: string; interviewRecordId: string },
  dependencies: EvidenceSnapshotDependencies,
): Promise<InterviewEvidenceSnapshotRecord> {
  const conversation = await dependencies.loadConversation(
    options.conversationId,
    options.interviewRecordId,
  );
  if (!conversation) {
    throw new Error(`interview conversation ${options.conversationId} not found`);
  }

  const contextSnapshot = await dependencies.loadContextSnapshot(options.interviewRecordId);
  if (!contextSnapshot) {
    throw new Error(`interview context snapshot ${options.interviewRecordId} not found`);
  }
  const submissions = await dependencies.loadSubmissions(options.interviewRecordId);
  const generatedAt =
    conversation.webhookReceivedAt ?? conversation.lastSyncedAt ?? conversation.updatedAt;

  const payload: InterviewEvidenceSnapshotPayload = {
    context: contextSnapshot.payload,
    contextSnapshotId: contextSnapshot.id,
    conversationId: options.conversationId,
    formSubmissions: submissions.map((submission) => ({
      answers: submission.answers,
      snapshot: submission.snapshot,
      submittedAt: submission.submittedAt.toISOString(),
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
  const contentHash = dependencies.hashSnapshotPayload(payload);
  const existing = await dependencies.findExistingSnapshot(options.conversationId, contentHash);
  if (existing) {
    return existing;
  }

  const inserted = await dependencies.insertSnapshot({
    contentHash,
    contextSnapshotId: contextSnapshot.id,
    conversationId: options.conversationId,
    createdAt: generatedAt,
    id: crypto.randomUUID(),
    interviewRecordId: options.interviewRecordId,
    organizationId: conversation.organizationId,
    payload,
    scheduleEntryId: conversation.scheduleEntryId,
  });
  if (!inserted) {
    throw new Error("interview evidence snapshot insert failed");
  }
  return inserted;
}
