import { MINIMAX_VOICE_IDS } from "@arc/db-schema/minimax-voices";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { resumeScreeningPolicySchema } from "@arc/shared/resume-screening";
import { z } from "zod";
import {
  jobEvaluationBlueprintSchema,
  jobEvaluationRuleDraftSchema,
} from "@arc/db-schema/job-description-evaluation";
import {
  jobDescriptionDeductionRulesSchema,
  jobDescriptionStructuredConfigSchema,
} from "@arc/db-schema/job-description-structured-config";

export const jobDescriptionWorkspacePathSchema = z.object({
  workspaceSlug: z.string().trim().min(1),
});
export const jobDescriptionPathSchema = jobDescriptionWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});

const assignmentSchema = z.object({
  allowCrossDepartmentInterviewers: z.boolean(),
  departmentId: z.string().trim().min(1, "请选择所属部门"),
  interviewerIds: z.array(z.string().trim().min(1)).min(1, "请至少选择一位面试官").max(20),
});

export const jobDescriptionSaveSchema = assignmentSchema
  .extend({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{7}$/, "岗位编码格式无效")
      .optional(),
    name: z.string().trim().min(1, "请输入岗位名称").max(120),
    prompt: z.string().trim().min(1, "请输入岗位 JD").max(10_000),
  })
  .strict();

export const jobDescriptionOperationalSchema = assignmentSchema.strict();
export const jobDescriptionAiGenerateInputSchema = z
  .object({
    departmentName: z.string().trim().max(120).optional(),
    jobName: z.string().trim().max(120).optional(),
    prompt: z.string().trim().min(1).max(10_000),
  })
  .strict();
export const jobDescriptionAiGenerateResponseSchema = z.object({
  jobDescription: z.string(),
  suggestedName: z.string(),
  supplementedItems: z.array(
    z.object({
      detail: z.string(),
      section: z.enum([
        "job_responsibilities",
        "core_skills",
        "supporting_skills",
        "experience",
        "projects",
        "education",
        "other_requirements",
      ]),
    }),
  ),
});
export const jobDescriptionScreeningPolicyInputSchema = z
  .object({
    description: z.string().trim().max(10_000).nullable().optional(),
    name: z.string().trim().max(120).nullable().optional(),
    prompt: z.string().trim().min(1).max(10_000),
  })
  .strict();
export const jobDescriptionScreeningPolicyResponseSchema = z.object({
  policy: resumeScreeningPolicySchema,
});
export const jobDescriptionRecommendationsInputSchema = z
  .object({
    excludeAlreadyLinked: z.boolean().default(true),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
const recommendationHighlightDetailSchema = z.object({
  period: z.string().nullable(),
  role: z.string().nullable(),
  summary: z.string().nullable(),
});
export const jobDescriptionRecommendationsResponseSchema = z.object({
  candidates: z.array(
    z.object({
      candidateEmail: z.string().nullable(),
      candidateName: z.string(),
      candidatePhone: z.string().nullable(),
      createdAt: z.iso.datetime(),
      currentJobDescriptionId: z.string().nullable(),
      currentJobDescriptionName: z.string().nullable(),
      id: z.string(),
      masteredSkills: z.array(z.string()),
      notes: z.string().nullable(),
      profileHighlights: z.object({
        educationItems: z.array(z.json()),
        educationLines: z.array(z.string()),
        latestCompany: z.string().nullable(),
        latestCompanyDetail: recommendationHighlightDetailSchema.nullable(),
        latestProject: z.string().nullable(),
        latestProjectDetail: recommendationHighlightDetailSchema.nullable(),
        personalStrengths: z.array(z.string()),
        schools: z.array(z.string()),
      }),
      reasons: z.array(z.string()),
      resumeFileName: z.string().nullable(),
      resumeParseStatus: z.enum(["failed", "processing", "queued", "ready", "unparsed"]),
      score: z.number(),
      similarity: z.object({
        resumeOverview: z.number().optional(),
        skillRole: z.number().optional(),
        workProject: z.number().optional(),
      }),
      targetRole: z.string().nullable(),
      workYears: z.number().nullable(),
    }),
  ),
  diagnostics: z.object({ vectorHitCount: z.number().int().nonnegative() }),
  jobDescription: z.object({ id: z.string(), name: z.string() }),
  status: z.enum(["disabled", "ready"]),
});
export const jobDescriptionListQuerySchema = z.object({
  departmentId: z.string().trim().max(2000).optional(),
  interviewerId: z.string().trim().max(2000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(["createdAt", "name", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("jobs"),
});

const interviewerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  voice: z.enum(MINIMAX_VOICE_IDS),
});

export const jobDescriptionRecordSchema = z.object({
  allowCrossDepartmentInterviewers: z.boolean(),
  code: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  deductionRuleSetVersion: z.number().int().nullable(),
  departmentId: z.string(),
  departmentName: z.string().nullable().optional(),
  description: z.string().nullable(),
  evaluationBlueprint: z.json().nullable(),
  evaluationBlueprintHash: z.string().nullable(),
  evaluationBlueprintPreview: z.json().nullable(),
  evaluationBlueprintPreviewGeneratedAt: z.iso.datetime().nullable(),
  evaluationBlueprintPreviewHash: z.string().nullable(),
  evaluationBlueprintPreviewInputHash: z.string().nullable(),
  evaluationBlueprintSchemaVersion: z.number().int().nullable(),
  evaluationMode: z.enum(["legacy", "structured", "qualitative"]),
  evaluationUpgradedAt: z.iso.datetime().nullable(),
  evaluationUpgradedBy: z.string().nullable(),
  hasEvaluationUpgradeDraft: z.boolean(),
  id: z.string(),
  interviewerIds: z.array(z.string()),
  interviewers: z.array(interviewerSummarySchema).optional(),
  lifecycleStatus: z.enum(["draft", "published"]),
  name: z.string(),
  presetQuestions: z.array(z.string()),
  prompt: z.string(),
  publishedAt: z.iso.datetime().nullable(),
  resumeCount: z.number().int().nonnegative().optional(),
  resumeScreeningPolicy: z.json(),
  resumeScreeningPolicyHash: z.string().nullable(),
  resumeScreeningPolicyVersion: z.number().int(),
  structuredConfig: z.json(),
  updatedAt: z.iso.datetime(),
});

export const jobDescriptionListResponseSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  records: z.array(jobDescriptionRecordSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const jobDescriptionAllResponseSchema = z.object({
  records: z.array(jobDescriptionRecordSchema),
});
export const generatedJobCodeSchema = z.object({ code: z.string().length(7) });
export const referralLinkSchema = z.object({ url: z.url() });
export const jobDescriptionDeleteSchema = z.object({ success: z.literal(true) });
export const jobEvaluationPreviewSchema = z.object({
  blueprint: jobEvaluationBlueprintSchema,
  blueprintHash: z.string(),
  generatedAt: z.iso.datetime(),
  inputHash: z.string(),
});
export const saveEvaluationRuleDraftSchema = z
  .object({
    deductionRules: jobDescriptionDeductionRulesSchema,
    expectedBlueprintHash: z.string().trim().min(1),
    ruleDraft: jobEvaluationRuleDraftSchema,
  })
  .strict();
export const publishStructuredJobSchema = z
  .object({ confirmedBlueprintHash: z.string().trim().min(1) })
  .strict();
export const upgradeVersionSchema = z.coerce.number().int().positive();
export const updateUpgradeDraftSchema = z
  .object({
    expectedVersion: upgradeVersionSchema,
    prompt: z.string().trim().min(1).max(10_000),
    structuredConfig: jobDescriptionStructuredConfigSchema,
  })
  .strict();
export const upgradePreviewSchema = z.object({ expectedVersion: upgradeVersionSchema }).strict();
export const upgradeRuleDraftSchema = saveEvaluationRuleDraftSchema
  .extend({ expectedVersion: upgradeVersionSchema })
  .strict();
export const discardUpgradeDraftSchema = z
  .object({ expectedVersion: upgradeVersionSchema })
  .strict();
export const publishUpgradeDraftSchema = z
  .object({
    confirmedBlueprintHash: z.string().trim().min(1),
    expectedVersion: upgradeVersionSchema,
    explicitConfirmation: z.literal(true),
  })
  .strict();
export const upgradeDraftSchema = z.looseObject({
  blueprintPreview: jobEvaluationBlueprintSchema.nullable(),
  blueprintPreviewGeneratedAt: z.iso.datetime().nullable(),
  blueprintPreviewHash: z.string().nullable(),
  blueprintPreviewInputHash: z.string().nullable(),
  createdAt: z.iso.datetime(),
  id: z.string(),
  jobDescriptionId: z.string(),
  organizationId: z.string(),
  prompt: z.string(),
  structuredConfig: jobDescriptionStructuredConfigSchema,
  updatedAt: z.iso.datetime(),
  version: z.number().int().positive(),
});
export const publishUpgradeResponseSchema = z.object({
  invalidatedLegacyAttemptCount: z.number().int().nonnegative(),
  jobDescription: jobDescriptionRecordSchema,
});
