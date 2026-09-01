import {
  interviewQuestionTemplateDifficultySchema,
  interviewQuestionTemplateScopeSchema,
  interviewQuestionTemplateSchema,
} from "@arc/db-schema/interview-question-templates";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { z } from "zod";

export { interviewQuestionTemplateSchema };
export const questionTemplateWorkspacePathSchema = z.object({ slug: z.string().trim().min(1) });
export const questionTemplatePathSchema = questionTemplateWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});
export const questionTemplateVersionPathSchema = questionTemplatePathSchema.extend({
  versionId: z.string().trim().min(1),
});
export const questionTemplateListQuerySchema = z.object({
  archived: z.enum(["active", "archived", "all"]).default("active"),
  jobDescriptionId: z.string().trim().max(2000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  scope: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(["createdAt", "title", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("questions"),
});
export const questionTemplateAiGenerateInputSchema = z
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
export const questionTemplateAiGenerateResponseSchema = z.object({
  questions: z.array(
    z.object({
      content: z.string(),
      difficulty: interviewQuestionTemplateDifficultySchema,
      evaluationFocus: z.string(),
      followUpDirections: z.string(),
      id: z.string(),
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
});
export const questionTemplateRefreshResponseSchema = z.object({
  refreshedCount: z.number().int().nonnegative(),
  scannedCount: z.number().int().nonnegative(),
  success: z.literal(true),
});
const jobSchema = z.object({ id: z.string(), name: z.string() });
const baseSchema = z.object({
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  jobDescriptionIds: z.array(z.string()),
  jobDescriptions: z.array(jobSchema),
  scope: interviewQuestionTemplateScopeSchema,
  title: z.string(),
  updatedAt: z.iso.datetime(),
});
const questionSchema = z.object({
  content: z.string(),
  createdAt: z.iso.datetime(),
  difficulty: interviewQuestionTemplateDifficultySchema,
  evaluationFocus: z.string().nullable(),
  followUpDirections: z.string().nullable(),
  id: z.string(),
  sortOrder: z.number().int().nonnegative(),
  templateId: z.string(),
  updatedAt: z.iso.datetime(),
});
export const questionTemplateRecordSchema = baseSchema.extend({
  questions: z.array(questionSchema),
});
export const questionTemplateListRecordSchema = baseSchema.extend({
  bindingCount: z.number().int().nonnegative(),
  questionCount: z.number().int().nonnegative(),
});
export const questionTemplateListResponseSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  records: z.array(questionTemplateListRecordSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const questionTemplateAllResponseSchema = z.object({
  records: z.array(questionTemplateListRecordSchema),
});
export const questionTemplateMutationResponseSchema = z.object({ success: z.literal(true) });
export const questionTemplateVersionSchema = z.object({
  contentHash: z.string(),
  createdAt: z.iso.datetime(),
  id: z.string(),
  snapshot: z.object({
    description: z.string().nullable(),
    jobDescriptionIds: z.array(z.string()),
    questions: z.array(
      z.object({
        content: z.string(),
        difficulty: interviewQuestionTemplateDifficultySchema,
        evaluationFocus: z.string().nullable().optional(),
        followUpDirections: z.string().nullable().optional(),
        id: z.string(),
        sortOrder: z.number().int().nonnegative(),
      }),
    ),
    scope: interviewQuestionTemplateScopeSchema,
    templateId: z.string(),
    title: z.string(),
  }),
  templateId: z.string(),
  version: z.number().int().positive(),
});
