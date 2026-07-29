import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { STRUCTURED_RESUME_DIMENSIONS } from "@arc/shared/structured-resume-scoring";
import {
  structuredResumeGateStatusSchema,
  structuredResumeGradeSchema,
  structuredResumeRuleStatusSchema,
} from "@arc/db-schema/structured-resume-evaluation";
import type { StructuredResumeEvalCase, StructuredResumeEvalManifest } from "./types";
import { STRUCTURED_RULE_STATUS_CLASSES } from "./types";

const outputSchema = z
  .object({
    artifactSchemaValid: z.boolean(),
    compositeScore: z.number().int().min(0).max(100),
    deterministicInvariantsValid: z.boolean(),
    evidenceCitationIntegrity: z.boolean(),
    gateStatus: structuredResumeGateStatusSchema,
    grade: structuredResumeGradeSchema,
    ruleJudgments: z.record(z.string().trim().min(1), structuredResumeRuleStatusSchema),
  })
  .strict();

const evalCaseSchema = z
  .object({
    baseline: outputSchema,
    caseVersion: z.string().trim().min(1),
    coverage: z
      .object({
        dimensions: z.array(z.enum(STRUCTURED_RESUME_DIMENSIONS)),
        gateBoundary: z.boolean(),
        missingEvidence: z.boolean(),
        ruleStatuses: z.array(structuredResumeRuleStatusSchema),
      })
      .strict(),
    gold: outputSchema.pick({
      compositeScore: true,
      gateStatus: true,
      grade: true,
      ruleJudgments: true,
    }),
    id: z.string().trim().min(1),
    source: z
      .object({
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        kind: z.enum(["sanitized", "synthetic"]),
        sourceAnchor: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

const thresholdsSchema = z
  .object({
    artifactSchemaValidity: z.literal(1),
    compositeScoreMae: z.number().nonnegative(),
    compositeScoreMaxError: z.number().nonnegative(),
    compositeScoreP95Error: z.number().nonnegative(),
    deterministicInvariants: z.literal(1),
    evidenceCitationIntegrity: z.literal(1),
    gradeAgreement: z.number().min(0).max(1),
    hardGateAgreement: z.number().min(0).max(1),
    perRuleMacroF1: z.number().min(0).max(1),
  })
  .strict();

const manifestSchema = z
  .object({
    approval: z
      .object({
        approvedAt: z.string().datetime().nullable(),
        approver: z.string().trim().min(1).nullable(),
        status: z.enum(["approved", "pending"]),
      })
      .strict(),
    baselineVersion: z.string().trim().min(1),
    casesFile: z.string().trim().min(1),
    corpusVersion: z.string().trim().min(1),
    engineVersion: z.string().trim().min(1),
    goldLabelVersion: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
    promptVersion: z.string().trim().min(1),
    schemaVersion: z.literal(1),
    thresholds: thresholdsSchema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const completeApproval =
      manifest.approval.status === "approved" &&
      manifest.approval.approvedAt !== null &&
      manifest.approval.approver !== null;
    const emptyApproval =
      manifest.approval.status === "pending" &&
      manifest.approval.approvedAt === null &&
      manifest.approval.approver === null;
    if (!(completeApproval || emptyApproval)) {
      ctx.addIssue({
        code: "custom",
        message: "approval fields must be complete for approved or empty for pending",
        path: ["approval"],
      });
    }
  });

const directPiiPatterns = [
  /\b1[3-9]\d{9}\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
] as const;

function validateCorpusCoverage(cases: StructuredResumeEvalCase[]) {
  if (cases.length < 100) {
    throw new Error(`STRUCTURED_EVAL_CORPUS_TOO_SMALL:${cases.length}`);
  }
  const ids = new Set<string>();
  const dimensions = new Set<string>();
  const statuses = new Set<string>();
  let hasGateBoundary = false;
  let hasMissingEvidence = false;
  for (const item of cases) {
    if (ids.has(item.id)) {
      throw new Error(`STRUCTURED_EVAL_DUPLICATE_CASE:${item.id}`);
    }
    ids.add(item.id);
    for (const value of item.coverage.dimensions) {
      dimensions.add(value);
    }
    for (const value of item.coverage.ruleStatuses) {
      statuses.add(value);
    }
    hasGateBoundary ||= item.coverage.gateBoundary;
    hasMissingEvidence ||= item.coverage.missingEvidence;
    if (!item.source.sourceAnchor.includes(item.source.contentHash)) {
      throw new Error(`STRUCTURED_EVAL_MUTABLE_SOURCE_ANCHOR:${item.id}`);
    }
  }
  for (const dimension of STRUCTURED_RESUME_DIMENSIONS) {
    if (!dimensions.has(dimension)) {
      throw new Error(`STRUCTURED_EVAL_MISSING_DIMENSION:${dimension}`);
    }
  }
  for (const status of STRUCTURED_RULE_STATUS_CLASSES) {
    if (!statuses.has(status)) {
      throw new Error(`STRUCTURED_EVAL_MISSING_RULE_STATUS:${status}`);
    }
  }
  if (!hasGateBoundary) {
    throw new Error("STRUCTURED_EVAL_MISSING_GATE_BOUNDARY");
  }
  if (!hasMissingEvidence) {
    throw new Error("STRUCTURED_EVAL_MISSING_EVIDENCE_CASE");
  }
}

async function loadCases(casesPath: string): Promise<unknown> {
  if (casesPath.endsWith(".json")) {
    return JSON.parse(await readFile(casesPath, "utf-8"));
  }
  const importedCases = (await import(pathToFileURL(casesPath).href)) as {
    cases?: unknown;
  };
  return importedCases.cases;
}

export async function loadStructuredResumeEvalCorpus(manifestPath: string) {
  const rawManifest = await readFile(manifestPath, "utf-8");
  for (const pattern of directPiiPatterns) {
    if (pattern.test(rawManifest)) {
      throw new Error("STRUCTURED_EVAL_DIRECT_PII_IN_MANIFEST");
    }
  }
  const manifest = manifestSchema.parse(JSON.parse(rawManifest)) as StructuredResumeEvalManifest;
  const casesPath = resolve(dirname(manifestPath), manifest.casesFile);
  const rawCases = await loadCases(casesPath);
  const serializedCases = JSON.stringify(rawCases);
  for (const pattern of directPiiPatterns) {
    if (pattern.test(serializedCases)) {
      throw new Error("STRUCTURED_EVAL_DIRECT_PII_IN_CASES");
    }
  }
  const cases = z.array(evalCaseSchema).parse(rawCases);
  validateCorpusCoverage(cases);
  return {
    cases,
    corpusHash: createHash("sha256").update(rawManifest).update(serializedCases).digest("hex"),
    manifest,
  };
}

export {
  evalCaseSchema as structuredResumeEvalCaseSchema,
  manifestSchema as structuredResumeEvalManifestSchema,
  validateCorpusCoverage,
};
