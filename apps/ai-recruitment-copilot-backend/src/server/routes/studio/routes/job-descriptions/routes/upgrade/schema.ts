import { z } from "zod";
import { jobEvaluationRuleDraftSchema } from "@arc/db-schema/job-description-evaluation";
import {
  jobDescriptionDeductionRulesSchema,
  jobDescriptionStructuredConfigSchema,
} from "@arc/db-schema/job-description-structured-config";

export const upgradeVersionSchema = z.coerce.number().int().positive();

export const updateUpgradeDraftSchema = z
  .object({
    expectedVersion: upgradeVersionSchema,
    prompt: z.string().trim().min(1, "请输入岗位内容").max(10_000),
    structuredConfig: jobDescriptionStructuredConfigSchema,
  })
  .strict();

export const upgradePreviewSchema = z.object({ expectedVersion: upgradeVersionSchema }).strict();

export const upgradeRuleDraftSchema = z
  .object({
    deductionRules: jobDescriptionDeductionRulesSchema,
    expectedBlueprintHash: z.string().trim().min(1),
    expectedVersion: upgradeVersionSchema,
    ruleDraft: jobEvaluationRuleDraftSchema,
  })
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
