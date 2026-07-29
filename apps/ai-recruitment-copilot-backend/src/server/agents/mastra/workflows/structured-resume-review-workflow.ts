import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { WorkflowStreamEvent } from "@mastra/core/stream";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import {
  evaluateStructuredResume,
  structuredResumeWorkflowInputSchema,
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

function passthroughStep(id: keyof typeof STEP_LABELS) {
  return createStep({
    execute: ({ inputData }) => Promise.resolve(inputData),
    id,
    inputSchema: structuredResumeWorkflowInputSchema,
    outputSchema: structuredResumeWorkflowInputSchema,
  });
}

export function createStructuredResumeReviewWorkflow(deps: {
  evaluate: typeof evaluateStructuredResume;
}) {
  const validateInput = passthroughStep("validate-structured-input");
  const judgeHardGates = passthroughStep("judge-hard-gates");
  const judgeDimensionEvidence = passthroughStep("judge-dimension-evidence");
  const judgeAdjustments = passthroughStep("judge-adjustments");
  const computeScore = passthroughStep("compute-structured-score");
  const generateNarrative = passthroughStep("generate-structured-narrative");
  const assemble = createStep({
    execute: ({ inputData }) => deps.evaluate(inputData),
    id: "assemble-structured-evaluation",
    inputSchema: structuredResumeWorkflowInputSchema,
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
  evaluate: evaluateStructuredResume,
});

export async function runStructuredResumeReviewWorkflow(input: StructuredResumeWorkflowInput) {
  const run = await structuredResumeReviewWorkflow.createRun();
  const result = await run.start({ inputData: input });
  if (result.status === "success") {
    return structuredResumeEvaluationV1Schema.parse(result.result);
  }
  if (result.status === "failed") {
    throw result.error;
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
    throw result.error;
  }
  throw new Error(`Structured resume workflow ended with status ${result.status}.`);
}
