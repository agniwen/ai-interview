import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { WorkflowStreamEvent } from "@mastra/core/stream";
import { z } from "zod";
import {
  structuredResumeEvidenceSchema,
  structuredResumeEvaluationV1Schema,
  structuredResumeRuleStatusSchema,
} from "@arc/db-schema/structured-resume-evaluation";
import { structuredResumeRuleIdSchema } from "@arc/db-schema/job-description-structured-config";
import {
  assembleStructuredResumeEvaluation,
  computeStructuredResumeCalculation,
  generateStructuredNarrative,
  judgeStructuredAdjustments,
  judgeStructuredDimensionEvidence,
  judgeStructuredHardGates,
  structuredAdjustmentAgentOutputSchema,
  structuredDimensionAgentOutputSchema,
  structuredGateAgentOutputSchema,
  structuredNarrativeAgentOutputSchema,
  structuredResumeWorkflowInputSchema,
  validateStructuredResumeInput,
} from "@arc/ai-recruitment-copilot-backend/server/agents/structured-resume-evaluation";
import type { StructuredResumeWorkflowInput } from "@arc/ai-recruitment-copilot-backend/server/agents/structured-resume-evaluation";
import { emitMastraWorkflowStreamEvents } from "../adapters/ai-run-stream";
import type { AiRunEvent } from "@arc/shared/ai-run-events";

const STEP_LABELS = {
  "assemble-structured-evaluation": "组装评估结果",
  "compute-structured-score": "计算综合得分",
  "generate-structured-narrative": "生成评估说明",
  "judge-adjustments": "判断优先与排除条件",
  "judge-dimension-evidence": "提取六维证据",
  "judge-hard-gates": "核对硬性门槛",
  "validate-structured-input": "校验岗位评估快照",
} as const;

const gateOutputSchema = structuredResumeWorkflowInputSchema.extend({
  gateOutput: structuredGateAgentOutputSchema,
});
const dimensionOutputSchema = gateOutputSchema.extend({
  dimensionOutput: structuredDimensionAgentOutputSchema,
});
const adjustmentOutputSchema = dimensionOutputSchema.extend({
  adjustmentOutput: structuredAdjustmentAgentOutputSchema,
});
const structuredRuleJudgmentSchema = z
  .object({
    evidence: z.array(structuredResumeEvidenceSchema),
    reason: z.string().trim().min(1),
    ruleId: structuredResumeRuleIdSchema,
    status: structuredResumeRuleStatusSchema,
    units: z.number().int().positive().optional(),
  })
  .strict();
const appliedDeductionSchema = structuredRuleJudgmentSchema
  .extend({ appliedPoints: z.number().int() })
  .strict();
const structuredDimensionCalculationSchema = z
  .object({
    appliedDeductions: z.array(appliedDeductionSchema),
    deductionTotal: z.number().int().nonnegative(),
    insufficientEvidenceRuleIds: z.array(structuredResumeRuleIdSchema),
    rawScore: z.number().int().min(0).max(100),
    weight: z.number().int().min(0).max(100),
    weightedContributionHundredths: z.number().int().min(0).max(10_000),
  })
  .strict();
const structuredCalculationDimensionsSchema = z
  .object({
    educationBackground: structuredDimensionCalculationSchema,
    experienceRelevance: structuredDimensionCalculationSchema,
    potential: structuredDimensionCalculationSchema,
    projectMatch: structuredDimensionCalculationSchema,
    skillMatch: structuredDimensionCalculationSchema,
    stability: structuredDimensionCalculationSchema,
  })
  .strict();
const structuredCalculationSchema = z
  .object({
    adjustedHundredths:
      structuredResumeEvaluationV1Schema.shape.calculations.shape.adjustedHundredths,
    adjustments: structuredResumeEvaluationV1Schema.shape.adjustments.shape.matches,
    clampedHundredths:
      structuredResumeEvaluationV1Schema.shape.calculations.shape.clampedHundredths,
    compositeScore: structuredResumeEvaluationV1Schema.shape.calculations.shape.compositeScore,
    dimensions: structuredCalculationDimensionsSchema,
    exclusionPointTotal:
      structuredResumeEvaluationV1Schema.shape.adjustments.shape.exclusionPointTotal,
    gates: structuredResumeEvaluationV1Schema.shape.gates,
    grade: structuredResumeEvaluationV1Schema.shape.grade,
    priorityPointTotal:
      structuredResumeEvaluationV1Schema.shape.adjustments.shape.priorityPointTotal,
    weightedBaseHundredths:
      structuredResumeEvaluationV1Schema.shape.calculations.shape.weightedBaseHundredths,
  })
  .strict();
const dimensionRuleJudgmentsSchema = z
  .object({
    educationBackground: z.array(structuredRuleJudgmentSchema),
    experienceRelevance: z.array(structuredRuleJudgmentSchema),
    potential: z.array(structuredRuleJudgmentSchema),
    projectMatch: z.array(structuredRuleJudgmentSchema),
    skillMatch: z.array(structuredRuleJudgmentSchema),
    stability: z.array(structuredRuleJudgmentSchema),
  })
  .strict();
const structuredCalculationResultSchema = z
  .object({
    calculation: structuredCalculationSchema,
    dimensionRuleJudgments: dimensionRuleJudgmentsSchema,
    normalizedDimensionOutput: structuredDimensionAgentOutputSchema,
    skillAssessments: structuredResumeEvaluationV1Schema.shape.skillAssessments,
  })
  .strict();
const calculationOutputSchema = adjustmentOutputSchema.extend({
  calculationResult: structuredCalculationResultSchema,
});
const narrativeOutputSchema = calculationOutputSchema.extend({
  narrative: structuredNarrativeAgentOutputSchema,
});

function workflowInputFrom(input: StructuredResumeWorkflowInput): StructuredResumeWorkflowInput {
  return {
    engine: input.engine,
    jobSnapshot: input.jobSnapshot,
    resumeInput: input.resumeInput,
  };
}

export function createStructuredResumeReviewWorkflow(deps: {
  assemble: typeof assembleStructuredResumeEvaluation;
  compute: typeof computeStructuredResumeCalculation;
  generateNarrative: typeof generateStructuredNarrative;
  judgeAdjustments: typeof judgeStructuredAdjustments;
  judgeDimensionEvidence: typeof judgeStructuredDimensionEvidence;
  judgeHardGates: typeof judgeStructuredHardGates;
  validate: typeof validateStructuredResumeInput;
}) {
  const validateInput = createStep({
    execute: ({ inputData }) => Promise.resolve(deps.validate(inputData)),
    id: "validate-structured-input",
    inputSchema: structuredResumeWorkflowInputSchema,
    outputSchema: structuredResumeWorkflowInputSchema,
  });
  const judgeHardGates = createStep({
    execute: async ({ inputData }) => ({
      ...inputData,
      gateOutput: await deps.judgeHardGates(workflowInputFrom(inputData)),
    }),
    id: "judge-hard-gates",
    inputSchema: structuredResumeWorkflowInputSchema,
    outputSchema: gateOutputSchema,
  });
  const judgeDimensionEvidence = createStep({
    execute: async ({ inputData }) => ({
      ...inputData,
      dimensionOutput: await deps.judgeDimensionEvidence(workflowInputFrom(inputData)),
    }),
    id: "judge-dimension-evidence",
    inputSchema: gateOutputSchema,
    outputSchema: dimensionOutputSchema,
  });
  const judgeAdjustments = createStep({
    execute: async ({ inputData }) => ({
      ...inputData,
      adjustmentOutput: await deps.judgeAdjustments(
        workflowInputFrom(inputData),
        inputData.gateOutput,
      ),
    }),
    id: "judge-adjustments",
    inputSchema: dimensionOutputSchema,
    outputSchema: adjustmentOutputSchema,
  });
  const computeScore = createStep({
    execute: ({ inputData }) =>
      Promise.resolve({
        ...inputData,
        calculationResult: deps.compute({
          adjustmentOutput: inputData.adjustmentOutput,
          dimensionOutput: inputData.dimensionOutput,
          gateOutput: inputData.gateOutput,
          workflowInput: workflowInputFrom(inputData),
        }),
      }),
    id: "compute-structured-score",
    inputSchema: adjustmentOutputSchema,
    outputSchema: calculationOutputSchema,
  });
  const generateNarrative = createStep({
    execute: async ({ inputData }) => ({
      ...inputData,
      narrative: await deps.generateNarrative({
        calculationResult: inputData.calculationResult,
        workflowInput: workflowInputFrom(inputData),
      }),
    }),
    id: "generate-structured-narrative",
    inputSchema: calculationOutputSchema,
    outputSchema: narrativeOutputSchema,
  });
  const assemble = createStep({
    execute: ({ inputData }) =>
      Promise.resolve(
        deps.assemble({
          calculationResult: inputData.calculationResult,
          narrative: inputData.narrative,
          workflowInput: workflowInputFrom(inputData),
        }),
      ),
    id: "assemble-structured-evaluation",
    inputSchema: narrativeOutputSchema,
    outputSchema: structuredResumeEvaluationV1Schema,
  });

  return (
    createWorkflow({
      description: "Evaluate one resume against an immutable structured job blueprint.",
      id: "structured-resume-review-workflow",
      inputSchema: structuredResumeWorkflowInputSchema,
      outputSchema: structuredResumeEvaluationV1Schema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflow composition API.
      .then(validateInput)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflow composition API.
      .then(judgeHardGates)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflow composition API.
      .then(judgeDimensionEvidence)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflow composition API.
      .then(judgeAdjustments)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflow composition API.
      .then(computeScore)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflow composition API.
      .then(generateNarrative)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflow composition API.
      .then(assemble)
      .commit()
  );
}

export const structuredResumeReviewWorkflow = createStructuredResumeReviewWorkflow({
  assemble: assembleStructuredResumeEvaluation,
  compute: computeStructuredResumeCalculation,
  generateNarrative: generateStructuredNarrative,
  judgeAdjustments: judgeStructuredAdjustments,
  judgeDimensionEvidence: judgeStructuredDimensionEvidence,
  judgeHardGates: judgeStructuredHardGates,
  validate: validateStructuredResumeInput,
});

const workflowErrorSchema = z.union([
  z.instanceof(Error),
  z.object({ message: z.string(), name: z.string().optional() }),
]);

function toWorkflowError(value: z.output<typeof workflowErrorSchema>): Error {
  if (value instanceof Error) {
    return value;
  }
  const error = new Error(value.message);
  if (value.name) {
    error.name = value.name;
  }
  return error;
}

export async function runStructuredResumeReviewWorkflow(
  input: StructuredResumeWorkflowInput,
  workflow = structuredResumeReviewWorkflow,
) {
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  if (result.status === "success") {
    return structuredResumeEvaluationV1Schema.parse(result.result);
  }
  if (result.status === "failed") {
    throw toWorkflowError(workflowErrorSchema.parse(result.error));
  }
  throw new Error(`Structured resume workflow ended with status ${result.status}.`);
}

export async function streamStructuredResumeReviewWorkflow(
  input: StructuredResumeWorkflowInput,
  options: { onWorkflowEvent: (event: AiRunEvent) => void },
) {
  const run = await structuredResumeReviewWorkflow.createRun();
  const output = await run.stream({ inputData: input });
  await emitMastraWorkflowStreamEvents(
    // SAFETY: Mastra's run.stream() contract exposes fullStream as an async iterable of workflow events.
    output.fullStream as AsyncIterable<WorkflowStreamEvent>,
    options.onWorkflowEvent,
    {
      stepLabels: STEP_LABELS,
      title: "生成结构化简历评估",
      workflowId: "structured-resume-review-workflow",
    },
  );
  const result = await output.result;
  if (result.status === "success") {
    return structuredResumeEvaluationV1Schema.parse(result.result);
  }
  if (result.status === "failed") {
    throw toWorkflowError(workflowErrorSchema.parse(result.error));
  }
  throw new Error(`Structured resume workflow ended with status ${result.status}.`);
}
