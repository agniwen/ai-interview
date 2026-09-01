import { resumePoolCreateSchema, resumePoolImportSchema } from "@arc/shared/resume-pool";
import { z } from "zod";

export const resumePoolWorkspacePathSchema = z.object({ slug: z.string().trim().min(1) });
export const resumePoolPathSchema = resumePoolWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});
export const resumePoolListQuerySchema = z.object({
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  importStatus: z.enum(["imported", "not_imported"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
  offset: z.coerce.number().int().min(0).default(0),
  scope: z.enum(["private", "public"]).default("private"),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(["candidateName", "createdAt", "updatedAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  sourceType: z.enum(["all", "non_referral", "referral"]).default("all"),
  textFilters: z.string().trim().max(10_000).optional(),
  uploaderId: z.string().trim().min(1).optional(),
  uploaderIds: z.string().trim().optional(),
});
export const resumePoolCreateInputSchema = resumePoolCreateSchema;
export const resumePoolImportInputSchema = resumePoolImportSchema.superRefine((value, context) => {
  if (value.jobDescriptionMode === "bind" && !value.jobDescriptionId) {
    context.addIssue({
      code: "custom",
      message: "绑定岗位时必须选择岗位。",
      path: ["jobDescriptionId"],
    });
  }
  if (value.jobDescriptionMode !== "bind" && value.initialRecruitmentStage !== "screening") {
    context.addIssue({
      code: "custom",
      message: "进入后续招聘阶段时必须关联岗位。",
      path: ["initialRecruitmentStage"],
    });
  }
});
export const resumePoolBindSchema = z.object({ jobDescriptionId: z.string().trim().min(1) });
export const resumePoolRecommendationsSchema = z.object({
  topN: z.number().int().min(1).max(50).default(10),
});

const date = z.iso.datetime().nullable();
export const resumePoolItemSchema = z.looseObject({
  candidateEmail: z.string().nullable(),
  candidateName: z.string(),
  candidatePhone: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  duplicateMatch: z.json().nullable(),
  id: z.string(),
  importedAt: date,
  importedRecords: z.array(
    z.looseObject({ importedAt: z.iso.datetime(), resumeRecordId: z.string() }),
  ),
  importedResumeRecordId: z.string().nullable(),
  jobBindingMode: z.enum(["automatic", "manual"]).nullable(),
  jobDescriptionId: z.string().nullable(),
  jobDescriptionName: z.string().nullable(),
  masteredSkills: z.array(z.string()),
  notes: z.string().nullable(),
  organizationId: z.string().nullable(),
  profileHighlights: z.json(),
  publishedAt: date,
  publishedBy: z.string().nullable(),
  qualitativeRecommendationLevel: z.string().nullable(),
  qualitativeResumeEvaluation: z.json().nullable().optional(),
  qualitativeResumeSummary: z.string().nullable(),
  resumeContentHash: z.string().nullable(),
  resumeEvaluationContractVersion: z.string().nullable(),
  resumeEvaluationGeneratedAt: date,
  resumeFileName: z.string().nullable(),
  resumeParseError: z.string().nullable(),
  resumeParseRetryable: z.boolean(),
  resumeParseStatus: z.enum(["unparsed", "processing", "ready", "failed"]),
  resumeParsedAt: date,
  resumeProfile: z.json().nullable().optional(),
  resumeProfileSnapshot: z.json(),
  resumeStorageKey: z.string().nullable(),
  scope: z.enum(["private", "public"]),
  skillsNormalized: z.array(z.string()),
  sourceChannel: z.enum(["mail_ingest", "referral"]).nullable(),
  sourceOrganizationId: z.string().nullable(),
  sourcePoolItemId: z.string().nullable(),
  sourceUserId: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  targetRole: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  uploaderEmail: z.string().nullable(),
  uploaderImage: z.string().nullable(),
  uploaderName: z.string().nullable(),
  uploaderOrganizationName: z.string().nullable(),
  workYears: z.number().nullable(),
});
export const resumePoolListSchema = z.object({
  records: z.array(resumePoolItemSchema),
  total: z.number().int().nonnegative(),
});
export const resumePoolUploadersSchema = z.object({
  records: z.array(
    z.object({ email: z.string(), id: z.string(), image: z.string().nullable(), name: z.string() }),
  ),
});
export const duplicateMatchesSchema = z.object({ matches: z.array(z.json()) });
export const successSchema = z.object({ success: z.literal(true) });
export const queuedSchema = z.object({ status: z.literal("queued") });
export const importResultSchema = z.discriminatedUnion("status", [
  z.object({ resumeRecordId: z.string(), status: z.literal("imported") }),
  z.object({ matches: z.array(z.json()), status: z.literal("duplicate_found") }),
]);
export const jobMatchSchema = z
  .looseObject({
    candidates: z.array(z.json()),
    createdAt: z.iso.datetime(),
    id: z.string(),
    selectedJobDescriptionId: z.string().nullable(),
    selectionMethod: z.string().nullable(),
    status: z.string(),
  })
  .nullable();
export const recommendationsResponseSchema = z.looseObject({
  recommendations: z.array(z.json()),
  resume: z.object({ id: z.string() }),
  status: z.enum(["already_matched", "disabled", "indexing", "ready"]),
});
