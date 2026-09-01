import {
  candidateFormDisplayModeSchema,
  candidateFormQuestionTypeSchema,
  candidateFormScopeSchema,
  candidateFormTemplateSchema,
} from "@arc/db-schema/candidate-forms";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { z } from "zod";

export { candidateFormTemplateSchema };

export const candidateFormWorkspacePathSchema = z.object({
  workspaceSlug: z.string().trim().min(1),
});
export const candidateFormPathSchema = candidateFormWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});
export const candidateFormVersionPathSchema = candidateFormPathSchema.extend({
  versionId: z.string().trim().min(1),
});
export const candidateFormSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export const candidateFormCandidateSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  templateId: z.string().trim().min(1).optional(),
});
export const candidateFormCandidateSearchResponseSchema = z.object({
  records: z.array(
    z.object({
      candidateName: z.string(),
      hasSubmission: z.boolean(),
      id: z.string(),
      jobDescriptionId: z.string().nullable(),
      jobDescriptionName: z.string().nullable(),
    }),
  ),
});
export const candidateFormAiGenerateInputSchema = z
  .object({
    interviewRecordId: z.string().trim().min(1).optional(),
    interviewRecordIds: z.array(z.string().trim().min(1)).max(10).optional(),
    jobDescriptionId: z.string().trim().min(1).optional(),
    jobDescriptionIds: z.array(z.string().trim().min(1)).max(50).optional(),
    prompt: z.string().trim().min(1, "请填写 AI 填写指令").max(2000),
    templateDescription: z.string().trim().max(1000).optional(),
    templateTitle: z.string().trim().max(120).optional(),
  })
  .strict();
export const candidateFormListQuerySchema = z.object({
  archived: z.enum(["active", "archived", "all"]).default("active"),
  jobDescriptionId: z.string().trim().max(2000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  scope: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(["createdAt", "title", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("forms"),
});

const jobDescriptionRefSchema = z.object({ id: z.string(), name: z.string() });
const questionSchema = z.object({
  createdAt: z.iso.datetime(),
  displayMode: candidateFormDisplayModeSchema,
  helperText: z.string().nullable(),
  id: z.string(),
  label: z.string(),
  options: z.array(z.object({ label: z.string(), value: z.string() })),
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  templateId: z.string(),
  type: candidateFormQuestionTypeSchema,
  updatedAt: z.iso.datetime(),
});
const generatedQuestionSchema = questionSchema.omit({
  createdAt: true,
  templateId: true,
  updatedAt: true,
});
export const candidateFormAiGenerateResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});
export const candidateFormRefreshResponseSchema = z.object({
  refreshedCount: z.number().int().nonnegative(),
  scannedCount: z.number().int().nonnegative(),
  success: z.literal(true),
});
const snapshotQuestionSchema = questionSchema.omit({
  createdAt: true,
  templateId: true,
  updatedAt: true,
});
const snapshotSchema = z.object({
  description: z.string().nullable(),
  jobDescriptionIds: z.array(z.string()),
  questions: z.array(snapshotQuestionSchema),
  scope: candidateFormScopeSchema,
  templateId: z.string(),
  title: z.string(),
});
const templateBaseSchema = z.object({
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  jobDescriptionIds: z.array(z.string()),
  jobDescriptions: z.array(jobDescriptionRefSchema),
  scope: candidateFormScopeSchema,
  title: z.string(),
  updatedAt: z.iso.datetime(),
});
export const candidateFormRecordSchema = templateBaseSchema.extend({
  questions: z.array(questionSchema),
});
export const candidateFormListRecordSchema = templateBaseSchema.extend({
  questionCount: z.number().int().nonnegative(),
  submissionCount: z.number().int().nonnegative(),
});
export const candidateFormListResponseSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  records: z.array(candidateFormListRecordSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const candidateFormAllResponseSchema = z.object({
  records: z.array(candidateFormListRecordSchema),
});
export const candidateFormMutationResponseSchema = z.object({ success: z.literal(true) });
export const candidateFormVersionSchema = z.object({
  contentHash: z.string(),
  createdAt: z.iso.datetime(),
  id: z.string(),
  snapshot: snapshotSchema,
  templateId: z.string(),
  version: z.number().int().positive(),
});
export const candidateFormSubmissionsResponseSchema = z.object({
  submissions: z.array(
    z.object({
      answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
      candidateName: z.string().nullable(),
      id: z.string(),
      interviewRecordId: z.string(),
      snapshot: snapshotSchema,
      submittedAt: z.iso.datetime(),
      templateId: z.string(),
      version: z.number().int().positive(),
      versionId: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
