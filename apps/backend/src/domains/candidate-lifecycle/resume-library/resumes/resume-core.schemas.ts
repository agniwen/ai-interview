import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { z } from "zod";
import {
  resumeEvaluationStatusSubmitSchema,
  resumeEvaluationUpdateSchema,
  resumeIdentityUpdateSchema,
  resumeLibraryEditFormSchema,
  resumeLibraryFormSchema,
} from "@arc/shared/studio-resumes";
import {
  structuredResumeGateStatusSchema,
  structuredResumeGradeSchema,
} from "@arc/db-schema/structured-resume-evaluation";
import { aiInterviewLinkValiditySchema } from "@arc/shared/interview/ai-interview-invitation";
import {
  candidateOutcomeSchema,
  pipelineStageSchema,
  studioInterviewQuestionClientSchema,
} from "@arc/db-schema/studio-interviews";

export const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  resumeProfile: resumeProfileSchema.nullable().optional(),
});
export const dedupResponseSchema = z.object({
  matches: z.array(z.looseObject({ id: z.string() })),
});
export const skillSuggestionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  prefix: z.string().trim().max(80).optional(),
});
export const skillSuggestionsResponseSchema = z.object({
  records: z.array(z.object({ count: z.number().int().nonnegative(), skill: z.string() })),
});
export const resumeReviewFilePathSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
});
export const interviewQuestionsUpdateSchema = z.object({
  interviewQuestions: z.array(studioInterviewQuestionClientSchema).max(50),
});
export const interviewQuestionsResponseSchema = z.object({
  interviewQuestions: z.array(z.looseObject({ question: z.string() })),
});
export const resumeMetricsQuerySchema = z.object({
  scope: z.enum(["team", "personal"]).default("team"),
});
export const resumeMetricsResponseSchema = z.object({
  byPipeline: z.array(
    z.object({
      count: z.number().int(),
      outcome: candidateOutcomeSchema,
      stage: pipelineStageSchema,
    }),
  ),
  conversion: z.object({ withInterview: z.number().int(), withoutInterview: z.number().int() }),
  dailyAdded: z.array(
    z.object({
      byUser: z.array(
        z.object({
          count: z.number().int(),
          userId: z.string(),
          userImage: z.string().nullable(),
          userName: z.string(),
        }),
      ),
      count: z.number().int(),
      day: z.string(),
    }),
  ),
});
export const queuedResponseSchema = z.object({ status: z.literal("queued") });

export const resumeListQuerySchema = z.object({
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  creatorIds: z.string().optional(),
  jdIds: z.string().optional(),
  knownTotal: z.coerce.number().int().min(0).max(10_000_000).optional(),
  outcomes: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  pipelineStages: z.string().optional(),
  recommendationLevels: z.string().optional(),
  search: z.string().trim().max(200).optional(),
  skills: z.string().optional(),
  sortBy: z.enum(["candidateName", "createdAt", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  structuredMaxScore: z.coerce.number().int().min(0).max(100).optional(),
  structuredMinScore: z.coerce.number().int().min(0).max(100).optional(),
  textFilters: z.string().optional(),
});
export const resumeDetailSchema = z.looseObject({
  candidateName: z.string(),
  createdAt: z.iso.datetime(),
  id: z.string(),
  resumeParseStatus: z.string(),
  updatedAt: z.iso.datetime(),
});
export const resumeListSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  records: z.array(resumeDetailSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const resumeDuplicateMatchesSchema = z.object({ matches: z.array(z.json()) });
export const resumeTimelineSchema = z.looseObject({ events: z.array(z.json()), summary: z.json() });
export const resumeRoundsSchema = z.array(
  z.looseObject({ id: z.string(), roundLabel: z.string().optional() }),
);
export const resumeEvaluationSubmitSchema = resumeEvaluationStatusSubmitSchema;
export const resumeEvaluationPatchSchema = resumeEvaluationUpdateSchema;
export const resumeCreateSchema = resumeLibraryFormSchema;
export const resumeEditSchema = resumeLibraryEditFormSchema;
export const resumeIdentitySchema = resumeIdentityUpdateSchema;
export const resumeLaunchSchema = z.object({
  candidateInviteValidity: aiInterviewLinkValiditySchema.default("permanent"),
  structuredEvaluationConfirmation: z
    .object({
      gateStatus: structuredResumeGateStatusSchema,
      grade: structuredResumeGradeSchema,
      runId: z.string().trim().min(1),
    })
    .strict()
    .nullable()
    .optional(),
});
export const resumeGatePathSchema = resumeReviewFilePathSchema.extend({
  requirementId: z.string().trim().min(1),
});
export const resumeGateCorrectionSchema = z
  .object({
    correctedStatus: structuredResumeGateStatusSchema.nullable(),
    expectedRunId: z.string().trim().min(1),
  })
  .strict();
export const resumeGateCorrectionResponseSchema = z.looseObject({
  evaluation: z.json(),
  status: z.literal("updated"),
  summaries: z.json(),
});
export const resumeHistorySchema = z.object({
  failures: z.array(z.json()),
  records: z.array(z.json()),
});
export const resumeMeetingsSchema = z.object({ records: z.array(z.json()) });
export const resumeBulkDeleteSchema = z.object({ ids: z.array(z.string().trim().min(1)).min(1) });
export const resumeDeleteSchema = z.object({ success: z.literal(true) });
export const resumeBulkDeleteResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
  success: z.literal(true),
});
