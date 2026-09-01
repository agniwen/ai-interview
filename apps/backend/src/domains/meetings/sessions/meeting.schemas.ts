import { z } from "zod";
import {
  completeSmallSavedMeetingSchema,
  createMultipartSavedMeetingSchema,
  createSmallSavedMeetingSchema,
  createMeetingNoteSchema,
  reassignMeetingOwnerSchema,
  trashedMeetingListQuerySchema,
  updateMeetingMetadataSchema,
  updateMeetingRecruitingContextSchema,
  updateMeetingShareSchema,
  updateMeetingNoteSchema,
} from "@arc/shared/meeting-recording";
import {
  createMeetingTranscriptCorrectionSchema,
  createMeetingLiveTranscriptAuthorizationSchema,
  meetingLiveTranscriptDraftSchema,
  meetingTranscriptionProviderSchema,
  updateMeetingTranscriptionPolicySchema,
} from "@arc/shared/meeting-transcription";
import {
  meetingIntelligencePayloadSchema,
  meetingIntelligenceTemplateSchema,
  requestMeetingIntelligenceSchema,
} from "@arc/shared/meeting-intelligence";
import { meetingLibrarySearchQuerySchema } from "@arc/shared/meeting-search";
import {
  createMeetingQuestionSchema,
  createMeetingQuestionThreadSchema,
  meetingAnswerPayloadSchema,
} from "@arc/shared/meeting-answer";

export {
  completeSmallSavedMeetingSchema,
  createMeetingTranscriptCorrectionSchema,
  createMeetingLiveTranscriptAuthorizationSchema,
  createMeetingNoteSchema,
  createMultipartSavedMeetingSchema,
  createSmallSavedMeetingSchema,
  reassignMeetingOwnerSchema,
  requestMeetingIntelligenceSchema,
  meetingLibrarySearchQuerySchema,
  createMeetingQuestionSchema,
  createMeetingQuestionThreadSchema,
  trashedMeetingListQuerySchema,
  updateMeetingMetadataSchema,
  updateMeetingNoteSchema,
  updateMeetingRecruitingContextSchema,
  updateMeetingShareSchema,
  updateMeetingTranscriptionPolicySchema,
};

export const meetingPathSchema = z.object({
  id: z.string().min(1),
  slug: z.string().trim().min(1),
});

export const workspaceMeetingPathSchema = z.object({ slug: z.string().trim().min(1) });

export const meetingNestedPathSchema = meetingPathSchema.extend({
  noteId: z.string().min(1).optional(),
  revisionId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
});

export const meetingAccessRoleSchema = z.enum(["administrator", "editor", "owner", "viewer"]);
export const meetingProcessingStateSchema = z.enum(["failed", "processing", "ready"]);
export const meetingCreatorSchema = z.object({
  id: z.string(),
  image: z.string().nullable(),
  name: z.string(),
});

export const meetingLibraryItemSchema = z.object({
  accessRole: meetingAccessRoleSchema,
  creator: meetingCreatorSchema,
  durationMs: z.number().int().nonnegative(),
  id: z.string(),
  processingState: meetingProcessingStateSchema,
  recordingAvailable: z.boolean(),
  savedAt: z.string().datetime(),
  title: z.string().nullable(),
  workspaceCustodied: z.boolean(),
});

export const meetingListResponseSchema = z.object({ records: z.array(meetingLibraryItemSchema) });

export const meetingDetailResponseSchema = z.object({
  accessRole: meetingAccessRoleSchema,
  archived: z.boolean(),
  creator: meetingCreatorSchema,
  durationMs: z.number().int().nonnegative(),
  id: z.string(),
  processingState: meetingProcessingStateSchema,
  recordingAvailable: z.boolean(),
  savedAt: z.string().datetime(),
  startedAt: z.string().datetime(),
  title: z.string(),
  verifiedAt: z.string().datetime().nullable(),
  workspaceCustodied: z.boolean(),
});

export const renamedMeetingResponseSchema = z.object({ title: z.string() });

export const purgeMeetingQuerySchema = z.object({
  localRecoveryCleanup: z.enum(["deleted", "failed", "not-reported"]).default("not-reported"),
});

export const meetingPlaybackResponseSchema = z.object({
  expiresAt: z.string().datetime(),
  url: z.string().url(),
});

export const meetingProcessingResponseSchema = z.object({
  state: z.enum(["processing", "ready", "unavailable"]),
});

export const meetingNoteSchema = z.object({
  author: z.object({ id: z.string().nullable(), name: z.string() }),
  body: z.string(),
  canDelete: z.boolean(),
  canEdit: z.boolean(),
  createdAt: z.string().datetime(),
  id: z.string(),
  meetingTimeMs: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const meetingNotesResponseSchema = z.object({ records: z.array(meetingNoteSchema) });

export const meetingShareResponseSchema = z.object({
  grants: z.array(
    z.object({
      member: z.object({ id: z.string(), image: z.string().nullable(), name: z.string() }),
      role: z.enum(["editor", "viewer"]),
    }),
  ),
  owner: z.object({ id: z.string(), image: z.string().nullable(), name: z.string() }),
  visibility: z.enum(["restricted", "workspace"]),
  workspaceCustodied: z.boolean(),
});

export const updatedResponseSchema = z.object({ updated: z.literal(true) });

export const meetingTranscriptionProviderCandidateSchema = z.object({
  id: meetingTranscriptionProviderSchema,
  label: z.string(),
  model: z.string(),
  region: z.string(),
});

export const meetingTranscriptionPolicyResponseSchema = z.object({
  allowedProviders: z.array(meetingTranscriptionProviderSchema),
  availableProviders: z.array(meetingTranscriptionProviderCandidateSchema),
  canManage: z.boolean(),
  fallbackProvider: meetingTranscriptionProviderSchema.nullable(),
  revision: z.number().int().nonnegative(),
  selectedProvider: meetingTranscriptionProviderSchema.nullable(),
  selectionReason: z.string().nullable(),
});

export const finalMeetingTranscriptTurnSchema = z.object({
  confidence: z.number().min(0).max(1).nullable(),
  endMs: z.number().int().nonnegative(),
  id: z.string(),
  sequence: z.number().int().nonnegative(),
  speakerDisplayName: z.string().nullable(),
  speakerKey: z.string(),
  startMs: z.number().int().nonnegative(),
  text: z.string(),
  track: z.enum(["local", "remote"]),
});

export const finalMeetingTranscriptRevisionSchema = z.object({
  basedOnRevisionId: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  id: z.string(),
  kind: z.enum(["final", "human"]),
  language: z.string().nullable(),
  model: z.string(),
  provider: meetingTranscriptionProviderSchema,
  region: z.string(),
  revision: z.number().int().positive(),
  turns: z.array(finalMeetingTranscriptTurnSchema),
});

export const meetingTranscriptResponseSchema = z.object({
  draft: meetingLiveTranscriptDraftSchema.nullable().optional(),
  error: z.string().nullable(),
  revision: finalMeetingTranscriptRevisionSchema.nullable(),
  state: z.enum(["failed", "pending", "processing", "ready"]),
});

export const meetingTranscriptRevisionSummarySchema = finalMeetingTranscriptRevisionSchema.omit({
  turns: true,
});

export const meetingTranscriptHistoryResponseSchema = z.object({
  records: z.array(meetingTranscriptRevisionSummarySchema),
});

export const meetingIntelligenceRevisionSchema = z.object({
  content: meetingIntelligencePayloadSchema,
  createdAt: z.string().datetime(),
  createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  id: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  provider: z.string(),
  revision: z.number().int().positive(),
  template: meetingIntelligenceTemplateSchema,
  transcriptRevisionId: z.string(),
});

export const meetingIntelligenceResponseSchema = z.object({
  canRegenerate: z.boolean(),
  current: meetingIntelligenceRevisionSchema.nullable(),
  error: z.string().nullable(),
  history: z.array(meetingIntelligenceRevisionSchema),
  state: z.enum(["failed", "pending", "processing", "ready"]),
  suggestedTemplate: meetingIntelligenceTemplateSchema,
});

export const meetingRecruitingRecordSchema = z.object({
  candidateName: z.string(),
  id: z.string(),
  jobDescriptionName: z.string().nullable(),
  outcome: z.string(),
  pipelineStage: z.string(),
  targetRole: z.string().nullable(),
});

export const meetingRecruitingContextResponseSchema = z.object({
  canManage: z.boolean(),
  link: z
    .object({
      linkedAt: z.string().datetime(),
      linkedBy: z.string().nullable(),
      record: meetingRecruitingRecordSchema,
      templateSuggestion: z.literal("recruiting-interview"),
    })
    .nullable(),
});

export const meetingRecruitingCandidatesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(200).optional(),
});

export const meetingRecruitingCandidatesResponseSchema = z.object({
  records: z.array(meetingRecruitingRecordSchema),
});

export const meetingRecruitingContextUpdateResponseSchema = z.object({
  state: z.enum(["unchanged", "updated"]),
});

export const meetingTrashActionResponseSchema = z.object({
  purgeAfter: z.string().datetime(),
  state: z.enum(["already-trashed", "trashed"]),
});

export const meetingRestoreResponseSchema = z.object({ state: z.literal("restored") });

export const trashedMeetingSchema = z.object({
  creator: meetingCreatorSchema,
  id: z.string(),
  purgeAfter: z.string().datetime(),
  savedAt: z.string().datetime(),
  title: z.string(),
  trashedAt: z.string().datetime(),
});

export const trashedMeetingListResponseSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  records: z.array(trashedMeetingSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
});

export const meetingSearchMatchSchema = z.object({
  endMs: z.number().int().nonnegative().nullable(),
  kind: z.enum(["creator", "date", "note", "speaker", "title", "transcript"]),
  snippet: z.string(),
  startMs: z.number().int().nonnegative().nullable(),
});

export const meetingSearchResponseSchema = z.object({
  records: z.array(meetingLibraryItemSchema.extend({ match: meetingSearchMatchSchema })),
});

export const recordingTitleRequestSchema = z.object({
  transcript: z.string().trim().min(12).max(6000),
});

export const recordingTitleResponseSchema = z.object({ title: z.string().min(1).max(28) });

const meetingUploadInstructionBaseSchema = z.object({
  expiresAt: z.string().datetime(),
  headers: z.record(z.string(), z.string()),
  method: z.literal("PUT"),
  sizeBytes: z.number().int().positive(),
  track: z.enum(["microphone", "system"]),
  url: z.string().url(),
});

export const smallMeetingUploadResponseSchema = z.object({
  meetingId: z.string(),
  recoveryCopyDeleteAfter: z.string().datetime().nullable(),
  state: z.enum(["uploading", "workspace-verified"]),
  uploads: z.array(meetingUploadInstructionBaseSchema.extend({ contentType: z.string() })),
});

export const multipartMeetingUploadResponseSchema = z.object({
  meetingId: z.string(),
  recoveryCopyDeleteAfter: z.string().datetime().nullable(),
  state: z.enum(["uploading", "workspace-verified"]),
  uploads: z.array(
    meetingUploadInstructionBaseSchema.extend({
      offsetBytes: z.number().int().nonnegative(),
      partNumber: z.number().int().positive(),
    }),
  ),
});

export const completeMeetingResponseSchema = z.object({
  meetingId: z.string(),
  recoveryCopyDeleteAfter: z.string().datetime(),
  state: z.literal("workspace-verified"),
});

export const meetingQuestionExchangeSchema = z.object({
  answer: meetingAnswerPayloadSchema.nullable(),
  answeredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  error: z.string().nullable(),
  id: z.string(),
  question: z.string(),
  requestId: z.string().uuid(),
  sequence: z.number().int().positive(),
  status: z.enum(["pending", "processing", "ready", "failed"]),
});
export const meetingQuestionThreadSummarySchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string(),
  title: z.string(),
  updatedAt: z.string().datetime(),
});
export const meetingQuestionThreadsResponseSchema = z.object({
  records: z.array(meetingQuestionThreadSummarySchema),
});
export const meetingQuestionThreadSchema = meetingQuestionThreadSummarySchema.extend({
  exchanges: z.array(meetingQuestionExchangeSchema),
  meetingId: z.string(),
});
