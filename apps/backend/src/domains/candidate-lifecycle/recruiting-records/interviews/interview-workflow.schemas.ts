import {
  candidateExpectationsMetaSchema,
  candidateOutcomeSchema,
  closedMetaSchema,
  humanInterviewMeetingInputSchema,
  humanInterviewMeetingScheduleUpdateSchema,
  humanInterviewRoundInputSchema,
  humanInterviewRoundOutcomeSchema,
  nullableInstantDateTimeInputSchema,
  offerDraftInputSchema,
  offerResponseInputSchema,
  pipelineStageSchema,
  scheduleEntryStatusSchema,
  studioInterviewScheduleEntrySchema,
  studioInterviewQuestionClientSchema,
} from "@arc/db-schema/studio-interviews";
import { z } from "zod";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";

export const interviewIdPathSchema = z.object({
  id: z.string().trim().min(1),
  workspaceSlug: z.string().trim().min(1),
});
export const interviewChildPathSchema = interviewIdPathSchema.extend({
  conversationId: z.string().trim().min(1),
});
export const submissionPathSchema = interviewIdPathSchema.extend({
  submissionId: z.string().trim().min(1),
});
export const humanRoundPathSchema = interviewIdPathSchema.extend({
  roundId: z.string().trim().min(1),
});
export const offerDraftPathSchema = interviewIdPathSchema.extend({
  draftId: z.string().trim().min(1),
});
export const meetingPathSchema = z.object({
  meetingId: z.string().trim().min(1),
  workspaceSlug: z.string().trim().min(1),
});
export const recordPathSchema = z.object({
  interviewRecordId: z.string().trim().min(1),
  workspaceSlug: z.string().trim().min(1),
});
export const roundEmailPathSchema = z.object({
  roundId: z.string().trim().min(1),
  workspaceSlug: z.string().trim().min(1),
});

export const interviewListQuerySchema = z.object({
  creatorIds: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  sortBy: z.enum(["scheduledAt", "createdAt", "candidateName", "roundLabel"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.string().optional(),
  textFilters: listTextFiltersSchema("interviews"),
});
function jsonField<T extends z.ZodTypeAny>(schema: T) {
  return z.string().transform((value, context) => {
    try {
      return schema.parse(JSON.parse(value));
    } catch {
      context.addIssue({ code: "custom", message: "JSON 字段格式无效。" });
      return z.NEVER;
    }
  });
}
export const interviewCreateMultipartSchema = z.object({
  candidateEmail: z.string().default(""),
  candidateName: z.string().trim().min(1).max(120),
  candidatePhone: z.string().default(""),
  jobDescriptionId: z.string().trim().min(1),
  manualInterviewQuestions: jsonField(z.array(studioInterviewQuestionClientSchema)).optional(),
  notes: z.string().max(2000).default(""),
  resumePayload: jsonField(
    z.object({
      fileName: z.string().optional(),
      interviewQuestions: z.array(studioInterviewQuestionClientSchema).optional(),
      resumeProfile: z.any().optional(),
      resumeText: z.string().optional(),
    }),
  ).optional(),
  scheduleEntries: jsonField(z.array(studioInterviewScheduleEntrySchema).min(1)),
  targetRole: z.string().max(120).default(""),
});
export const resolveInterviewQuerySchema = z.object({ id: z.string().trim().min(1) });
export const meetingListQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  status: z.string().optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export const roundEmailSummaryQuerySchema = z.object({ roundIds: z.string().optional() });

export const interviewRoundPatchSchema = z.object({
  allowTextInput: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  scheduledAt: nullableInstantDateTimeInputSchema,
  scheduledEndAt: nullableInstantDateTimeInputSchema,
  status: scheduleEntryStatusSchema.optional(),
});
export const bindingsInputSchema = z.object({
  enabledTemplateIds: z.array(z.string().trim().min(1)),
});
export const recipientInputSchema = z.object({
  userIds: z
    .array(z.string().trim().min(1))
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "通知人员不能重复。"),
});
export const bulkInterviewDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1),
});
export const completeHumanRoundSchema = z.object({
  feedback: z.string().trim().min(1).max(5000),
  outcome: humanInterviewRoundOutcomeSchema,
  score: z.number().int().min(0).max(100).nullable().optional(),
});
export const cancelHumanRoundSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});
export const humanMeetingTokenInputSchema = z.object({
  interviewerId: z.string().trim().min(1).optional(),
});
export const createOfferDraftSchema = offerDraftInputSchema.extend({
  sendImmediately: z.boolean().optional(),
});
export const transitionInputSchema = z
  .object({
    closedMeta: closedMetaSchema.omit({ previousStage: true }).partial().optional(),
    closedReason: z.string().trim().max(500).nullable().optional(),
    interviewQuestions: z.array(studioInterviewQuestionClientSchema).max(50).optional(),
    outcome: candidateOutcomeSchema.optional(),
    pipelineStage: pipelineStageSchema,
    reactivationReason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.pipelineStage === "closed"
        ? !value.outcome || value.outcome === "in_pipeline"
        : value.outcome && value.outcome !== "in_pipeline"
    ) {
      context.addIssue({ code: "custom", message: "候选人阶段与结论不一致。", path: ["outcome"] });
    }
    if (value.pipelineStage !== "closed" && (value.closedMeta || value.closedReason)) {
      context.addIssue({
        code: "custom",
        message: "结束信息仅在结束阶段允许。",
        path: ["closedMeta"],
      });
    }
    if (value.pipelineStage !== "human_interview" && value.interviewQuestions) {
      context.addIssue({
        code: "custom",
        message: "面试题仅在真人复面阶段允许。",
        path: ["interviewQuestions"],
      });
    }
  });

export {
  candidateExpectationsMetaSchema,
  humanInterviewMeetingInputSchema,
  humanInterviewMeetingScheduleUpdateSchema,
  humanInterviewRoundInputSchema,
  offerDraftInputSchema,
  offerResponseInputSchema,
};

const dateString = z.string();
const nullableDateString = dateString.nullable();
const nullableString = z.string().nullable();

export const interviewListRecordSchema = z.looseObject({
  candidateId: z.string(),
  candidateName: z.string(),
  createdAt: dateString,
  id: z.string(),
  interviewRecordId: z.string(),
  roundLabel: z.string(),
  status: z.string(),
  updatedAt: dateString,
});
export const interviewDetailResponseSchema = z.looseObject({
  candidate: z.looseObject({
    candidateName: z.string(),
    id: z.string(),
  }),
  candidateId: z.string(),
  createdAt: dateString,
  id: z.string(),
  interviewRecordId: z.string(),
  roundLabel: z.string(),
  status: z.string(),
  updatedAt: dateString,
});
export const interviewResolveResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(["candidate", "round"]),
});
export const interviewEvaluationDocumentResponseSchema = z.object({
  conversationId: z.string(),
  feishuDocumentUrl: z.string().url(),
});
export const interviewAgentInstructionsResponseSchema = z.object({
  variants: z.array(
    z.object({
      closingPrompt: z.string(),
      instructions: z.string(),
      interviewerName: nullableString,
      openingPrompt: z.string(),
    }),
  ),
});
export const interviewReportSchema = z.looseObject({
  conversationId: z.string(),
  createdAt: dateString,
  status: z.string(),
  summaryStatus: z.string(),
  updatedAt: dateString,
});
export const interviewReportsSchema = z.array(interviewReportSchema);
const candidateFormSnapshotQuestionSchema = z.looseObject({
  displayMode: z.enum(["radio", "checkbox", "select", "input", "textarea"]),
  helperText: nullableString,
  id: z.string(),
  label: z.string(),
  options: z.array(z.looseObject({ label: z.string(), value: z.string() })),
  required: z.boolean(),
  sortOrder: z.number(),
  type: z.enum(["single", "multi", "text"]),
});
const candidateFormSnapshotSchema = z.looseObject({
  description: nullableString,
  jobDescriptionIds: z.array(z.string()),
  questions: z.array(candidateFormSnapshotQuestionSchema),
  scope: z.enum(["global", "job_description"]),
  templateId: z.string(),
  title: z.string(),
});
export const formSubmissionSchema = z.looseObject({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  id: z.string(),
  interviewRecordId: z.string(),
  snapshot: candidateFormSnapshotSchema,
  submittedAt: dateString,
  templateId: z.string(),
  version: z.number(),
  versionId: z.string(),
});
export const formSubmissionsResponseSchema = z.object({
  submissions: z.array(formSubmissionSchema),
});
const contextSnapshotSchema = z.looseObject({
  id: z.string(),
  payload: z.looseObject({
    interviewRecordId: z.string(),
    scheduleEntryId: z.string(),
    schemaVersion: z.number().int(),
  }),
  reason: z.enum(["create", "manual_refresh", "reset"]),
  status: z.literal("active"),
  version: z.number().int().positive(),
});
export const contextSnapshotResponseSchema = z.object({ snapshot: contextSnapshotSchema });
export const formSubmissionDeleteResponseSchema = contextSnapshotResponseSchema.extend({
  success: z.literal(true),
});
export const questionTemplateBindingSchema = z.looseObject({
  createdAt: dateString,
  disabledByUser: z.boolean(),
  id: z.string(),
  interviewRecordId: z.string(),
  scope: z.string(),
  sortOrder: z.number().int(),
  templateId: z.string(),
  title: z.string(),
  version: z.number().int(),
  versionId: z.string(),
});
export const questionTemplateBindingsSchema = z.array(questionTemplateBindingSchema);
export const successSchema = z.object({ success: z.literal(true) });
export const paginatedInterviewsSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  records: z.array(interviewListRecordSchema),
  total: z.number(),
  totalPages: z.number(),
});
const notificationRecipientSchema = z.object({
  email: z.string(),
  feishuBound: z.boolean(),
  feishuProviderIds: z.array(z.string()),
  image: nullableString,
  name: z.string(),
  userId: z.string(),
});
export const recipientsResponseSchema = z.object({
  fallbackToInitiator: z.boolean(),
  records: z.array(notificationRecipientSchema),
});
export const recordingLinkSchema = z.object({
  expiresInSeconds: z.number().int().positive(),
  url: z.string().url(),
});
export const roundDeleteResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
  success: z.literal(true),
});
export const meetingTokenResponseSchema = z.object({
  expiresAt: z.string().optional(),
  token: z.string(),
  url: z.string().optional(),
});
export const offerRecordSchema = z.looseObject({
  id: z.string(),
  interviewRecordId: z.string(),
  status: z.string(),
  version: z.number().int(),
});
export const humanRoundRecordSchema = z.looseObject({
  createdAt: dateString,
  id: z.string(),
  interviewRecordId: z.string(),
  status: z.string(),
  updatedAt: dateString,
});
const humanMeetingInterviewerSchema = z.object({
  image: nullableString,
  name: z.string(),
  role: z.string(),
  userId: z.string(),
});
const humanMeetingRoundSchema = z.object({
  candidateEmail: nullableString,
  candidateName: z.string(),
  interviewRecordId: z.string(),
  label: z.string(),
  roundId: z.string(),
  status: z.string(),
});
export const humanMeetingResponseSchema = z.looseObject({
  createdAt: dateString,
  id: z.string(),
  interviewers: z.array(humanMeetingInterviewerSchema),
  organizationId: z.string(),
  rounds: z.array(humanMeetingRoundSchema),
  scheduleVersion: z.number().int().positive(),
  scheduledAt: nullableDateString,
  status: z.string(),
  title: z.string(),
  updatedAt: dateString,
});
export const humanMeetingsResponseSchema = z.array(humanMeetingResponseSchema);
export const humanMeetingLinksResponseSchema = z.object({
  candidates: z.array(
    z.object({
      inviteToken: z.string(),
      roundId: z.string(),
      url: z.string().url(),
    }),
  ),
  meetingId: z.string(),
});
export const roundEmailSendResponseSchema = z.object({
  messageId: z.string(),
  roundId: z.string(),
  sentAt: dateString,
  to: z.string(),
});
export const roundEmailSummaryResponseSchema = z.object({
  records: z.array(
    z.object({
      failed: z.number(),
      lastSentAt: nullableDateString,
      roundId: z.string(),
      sent: z.number(),
    }),
  ),
});
export const candidateExpectationsResponseSchema = z.object({
  candidateExpectationsMeta: candidateExpectationsMetaSchema.partial(),
});
export const candidateExpectationsPatchSchema = candidateExpectationsMetaSchema.partial();
