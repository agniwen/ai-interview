import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { StructuredResumeGenerator } from "../server/agents/structured-resume-evaluation";
import type { MastraGeneratorLike } from "../server/agents/mastra/agents/simple-generators";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DEFAULT_INPUT = resolve(
  REPO_ROOT,
  ".eval/structured-resume-diagnostics/金文辉-2026-08-22T02-10-45-486Z-validated.json",
);
const EXPERIMENT_MODEL = "deepseek-v4-flash-0731";
const MODEL_ENV_NAMES = [
  "MASTRA_CHAT_MODEL",
  "MASTRA_FAST_MODEL",
  "MASTRA_LONG_CONTEXT_MODEL",
  "MASTRA_SCORER_MODEL",
  "MASTRA_STRUCTURED_MODEL",
] as const;
const SEMANTIC_RULE_IDS = [
  "education.below_tier",
  "education.major_unrelated",
  "experience.fragmented",
  "experience.industry_unrelated",
  "potential.illogical_switches",
  "potential.no_growth_two_years",
  "project.edge_participation",
  "project.no_relevant_project",
  "project.scale_low",
  "stability.frequent_unrelated_industries",
] as const;

interface AttemptRecord {
  completedAt?: string;
  durationMs?: number;
  error?: { message: string; name: string };
  input: unknown;
  output?: unknown;
  stage: string;
  startedAt: string;
}

interface SerializedError {
  message: string;
  name: string;
}

const sourceReportSchema = z.object({
  audit: z.unknown().optional(),
  candidate: z.object({ candidateName: z.string(), resumeId: z.string() }),
  job: z.object({ id: z.string(), name: z.string().nullable() }),
  result: z.unknown().optional(),
  workflowInput: z.unknown(),
});

interface ResultProjection {
  adjustments: [string, boolean][];
  dimensions: Record<string, [string, string, number | null][]>;
  gates: [string, string][];
  gateStatus: string;
  grade: string;
  score: number;
  skills: [string, string][];
}

function forceExperimentModels(env: NodeJS.ProcessEnv): void {
  for (const name of MODEL_ENV_NAMES) {
    env[name] = EXPERIMENT_MODEL;
  }
}

function serializeError(error: Error): SerializedError {
  return { message: error.message, name: error.name };
}

function snapshot<T>(value: T): T {
  return structuredClone(value);
}

function conditionClauses(condition: string): string[] {
  if (/(?:任一|任意|或者|或|等)/u.test(condition)) {
    return [condition.trim()];
  }
  const clauses = condition
    .split(/(?:、|，|,|；|;|并且|同时|且)/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  return clauses.length > 0 ? clauses : [condition.trim()];
}

export function buildUnifiedEvaluationPrompt(input: {
  compactResumeProfile: unknown;
  evaluationAsOf: string;
  jobSnapshot: {
    blueprint: {
      auxiliarySkills: unknown[];
      coreSkills: unknown[];
      dimensionExpectations: {
        experienceRelevance: unknown[];
        projectMatch: { expectation: string; sourceText: string }[];
      };
      educationExpectation: unknown;
      hardGateRequirements: unknown[];
      requiredRelevantExperiences?: unknown[];
    };
    publishedConfig: {
      deductionRules: unknown;
      exclusionConditions: { condition: string; id: string; points: number }[];
      priorityConditions: { condition: string; id: string; points: number }[];
      weights: unknown;
    };
  };
}): string {
  const { blueprint } = input.jobSnapshot;
  const { publishedConfig } = input.jobSnapshot;
  const conditions = [
    ...publishedConfig.priorityConditions.map((condition) => ({
      ...condition,
      clauses: conditionClauses(condition.condition),
      kind: "priority" as const,
    })),
    ...publishedConfig.exclusionConditions.map((condition) => ({
      ...condition,
      clauses: conditionClauses(condition.condition),
      kind: "exclusion" as const,
    })),
  ];
  const payload = {
    conditions,
    evaluationAsOf: input.evaluationAsOf,
    experienceRequirements: blueprint.requiredRelevantExperiences ?? [],
    hardGateRequirements: blueprint.hardGateRequirements,
    jobExpectations: {
      auxiliarySkills: blueprint.auxiliarySkills,
      coreSkills: blueprint.coreSkills,
      dimensionExpectations: blueprint.dimensionExpectations,
      educationExpectation: blueprint.educationExpectation,
    },
    projectRequirements: blueprint.dimensionExpectations.projectMatch.map((requirement, index) => ({
      expectation: requirement.expectation,
      requirementId: `project-expectation-${index}`,
      sourceText: requirement.sourceText,
    })),
    publishedScoringConfig: {
      deductionRules: publishedConfig.deductionRules,
      weights: publishedConfig.weights,
    },
    requiredSemanticRuleIds: SEMANTIC_RULE_IDS,
    resumeProfile: input.compactResumeProfile,
  };
  return [
    "你是统一结构化简历评估 Agent。一次完成 Gate、Dimension、Adjustment 和定性 Narrative；不得计算分数、时长、等级或最终推荐结论。",
    "所有 evidence.quote 只能逐字复制 resumeProfile 中单个字符串叶子值的连续片段，source 固定为 resume_profile。",
    "gateOutput.judgments 必须逐项覆盖 hardGateRequirements。复合门槛必须逐个子句核验；存在部分证据时不得声称完全未提及。",
    "dimensionOutput.employmentEpisodes 必须逐项覆盖 scoringFacts.employmentEpisodes，id 使用 work-{sourceIndex}；只判断岗位相关性，不重新计算日期。",
    "dimensionOutput.experienceRequirements 必须逐项覆盖 experienceRequirements；matched 时 episodeIds 非空。",
    "dimensionOutput.projects 必须逐项目、逐 projectRequirements 完整输出 requirementJudgments；技术治理事实不得因行业标签不同而忽略。",
    `dimensionOutput.ruleJudgments 必须完整且仅覆盖：${SEMANTIC_RULE_IDS.join("、")}。ruleId 和 status 必须是 JSON 字符串，禁止输出对象、中文标签、下划线别名或额外包装。`,
    '每条 ruleJudgment 严格仿照此字段形状：{"evidence":[],"missingInputs":[],"reason":"岗位未设置学历层级","ruleId":"education.below_tier","status":"not_applicable"}。status 只能是 insufficient_evidence、matched、not_applicable、not_matched 之一。',
    "dimensionOutput.skillFacts 必须逐项覆盖 coreSkills 和 auxiliarySkills；missing 时 evidence=[]，applied/shallow 时必须有证据。",
    "adjustmentOutput.judgments 必须逐项覆盖 conditions；clauseJudgments 按 clauses 的下标完整输出。AND 条件只有全部子句均有证据才能 matched=true。",
    "narrativeOutput 只做定性描述，不得出现分数、等级、Gate 数量或推荐结论；recommendation 和 summary 分别填写‘待代码计算’和‘等待确定性算分结果’。",
    "缺少候选信息才使用 insufficient_evidence，并返回非空 missingInputs；已能判断未命中时使用 not_matched。",
    JSON.stringify(payload),
  ].join("\n");
}

function createRecorder(
  stage: string,
  modelId: string,
  attempts: AttemptRecord[],
  generate: StructuredResumeGenerator,
): StructuredResumeGenerator {
  return (input) => {
    let attempt = 0;
    const instrumentedAgent: MastraGeneratorLike = {
      generate: async (prompt, options) => {
        attempt += 1;
        const record: AttemptRecord = {
          input: snapshot({
            maxOutputTokens: options?.modelSettings?.maxOutputTokens,
            modelId,
            prompt,
            structuredOutput: Boolean(options?.structuredOutput),
            temperature: options?.modelSettings?.temperature,
          }),
          stage: `${stage}:attempt-${attempt}`,
          startedAt: new Date().toISOString(),
        };
        attempts.push(record);
        const startedAt = performance.now();
        try {
          const result = await input.agent.generate(prompt, options);
          record.output = snapshot(result);
          return result;
        } catch (error) {
          const caughtError = error instanceof Error ? error : new Error(String(error));
          record.error = serializeError(caughtError);
          throw error;
        } finally {
          record.completedAt = new Date().toISOString();
          record.durationMs = Math.round(performance.now() - startedAt);
        }
      },
    };
    return generate({ ...input, agent: instrumentedAgent });
  };
}

function createSliceGenerator<T>(getValue: () => T): StructuredResumeGenerator {
  // SAFETY: The unified object has already passed the combined Zod schema. Each caller immediately
  // parses the returned slice with its original production schema before using it.
  return (() => Promise.resolve(getValue())) as StructuredResumeGenerator;
}

function resultProjection(result: {
  adjustments: { matches: { conditionId: string; matched: boolean }[] };
  calculations: { compositeScore: number };
  dimensions: Record<
    string,
    { ruleJudgments: { ruleId: string; status: string; units?: number }[] }
  >;
  gates: {
    effectiveStatus: string;
    judgments: { aiStatus: string; requirementId: string }[];
  };
  grade: string;
  skillAssessments: { normalizedSkill: string; status: string }[];
}): ResultProjection {
  return {
    adjustments: result.adjustments.matches.map((item) => [item.conditionId, item.matched]),
    dimensions: Object.fromEntries(
      Object.entries(result.dimensions).map(([dimension, value]) => [
        dimension,
        value.ruleJudgments.map((item) => [item.ruleId, item.status, item.units ?? null]),
      ]),
    ),
    gateStatus: result.gates.effectiveStatus,
    gates: result.gates.judgments.map((item) => [item.requirementId, item.aiStatus]),
    grade: result.grade,
    score: result.calculations.compositeScore,
    skills: result.skillAssessments.map((item) => [item.normalizedSkill, item.status]),
  };
}

function projectionDifferences(left: ResultProjection, right: ResultProjection): string[] {
  const leftRecord = z.record(z.string(), z.unknown()).parse(left);
  const rightRecord = z.record(z.string(), z.unknown()).parse(right);
  return [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].filter(
    (key) => JSON.stringify(leftRecord[key]) !== JSON.stringify(rightRecord[key]),
  );
}

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, "apps/ai-recruitment-copilot/.env"), quiet: true });
  loadEnv({ path: resolve(REPO_ROOT, "apps/ai-recruitment-copilot-backend/.env"), quiet: true });
  forceExperimentModels(process.env);

  const inputArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  const inputPath = inputArgument ? resolve(REPO_ROOT, inputArgument) : DEFAULT_INPUT;
  const source = sourceReportSchema.parse(JSON.parse(await readFile(inputPath, "utf-8")));
  const [
    evaluation,
    workflowModule,
    generatorModule,
    modelModule,
    auditModule,
    mastraAgentModule,
    artifactSchemaModule,
  ] = await Promise.all([
    import("../server/agents/structured-resume-evaluation"),
    import("../server/agents/mastra/workflows/structured-resume-review-workflow"),
    import("../server/agents/mastra/agents/simple-generators"),
    import("../server/agents/mastra/models"),
    import("./diagnose-structured-resume-audit"),
    import("@mastra/core/agent"),
    import("@arc/db-schema/structured-resume-evaluation"),
  ]);
  const workflowInput = evaluation.structuredResumeWorkflowInputSchema.parse(source.workflowInput);
  const promptContext = evaluation.createStructuredResumePromptContext(workflowInput);
  const unifiedPrompt = buildUnifiedEvaluationPrompt({
    compactResumeProfile: promptContext.compactResumeProfile,
    evaluationAsOf: workflowInput.resumeInput.evaluationAsOf,
    jobSnapshot: workflowInput.jobSnapshot,
  });
  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          candidate: source.candidate.candidateName,
          containsRawResumeTextField: /"resumeText"\s*:/u.test(unifiedPrompt),
          model: modelModule.getMastraModelIdentifier(modelModule.mastraModels.structuredModel),
          promptCharacters: unifiedPrompt.length,
          semanticRuleCount: SEMANTIC_RULE_IDS.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const modelId = modelModule.getMastraModelIdentifier(modelModule.mastraModels.structuredModel);
  const baseGenerate = generatorModule.generateStructuredWithMastraAgent;
  const unifiedOnly = process.argv.includes("--unified-only");
  const baselineAttempts: AttemptRecord[] = [];
  const baselineStartedAt = performance.now();
  const baselineWorkflow = workflowModule.createStructuredResumeReviewWorkflow({
    assemble: evaluation.assembleStructuredResumeEvaluation,
    compute: evaluation.computeStructuredResumeCalculation,
    generateNarrative: (input) =>
      evaluation.generateStructuredNarrative(
        input,
        createRecorder("baseline-narrative", modelId, baselineAttempts, baseGenerate),
      ),
    judgeAdjustments: (input, gateOutput, context, dimensionOutput) =>
      evaluation.judgeStructuredAdjustments(
        input,
        gateOutput,
        createRecorder("baseline-adjustment", modelId, baselineAttempts, baseGenerate),
        context,
        dimensionOutput,
      ),
    judgeDimensionEvidence: (input, context) =>
      evaluation.judgeStructuredDimensionEvidence(
        input,
        createRecorder("baseline-dimension", modelId, baselineAttempts, baseGenerate),
        context,
      ),
    judgeHardGates: (input, context) =>
      evaluation.judgeStructuredHardGates(
        input,
        createRecorder("baseline-gate", modelId, baselineAttempts, baseGenerate),
        context,
      ),
    validate: evaluation.validateStructuredResumeInput,
  });
  const auditInput = {
    expectedBlueprintHash: workflowInput.jobSnapshot.blueprintHash,
    expectedInputHash: workflowInput.resumeInput.resumeInputHash,
    resumeProfile: workflowInput.resumeInput.resumeProfile,
    resumeText: workflowInput.resumeInput.resumeText ?? "",
  };
  const baselineResult = unifiedOnly
    ? artifactSchemaModule.structuredResumeEvaluationV1Schema.parse(source.result)
    : await workflowModule.runStructuredResumeReviewWorkflow(workflowInput, baselineWorkflow);
  const baselineDurationMs = unifiedOnly ? null : Math.round(performance.now() - baselineStartedAt);
  const baselineAudit = auditModule.auditStructuredArtifact(baselineResult, auditInput);

  const unifiedSchema = z
    .object({
      adjustmentOutput: evaluation.structuredAdjustmentAgentOutputSchema,
      dimensionOutput: evaluation.structuredDimensionAgentOutputSchema,
      gateOutput: evaluation.structuredGateAgentOutputSchema,
      narrativeOutput: evaluation.structuredNarrativeAgentOutputSchema,
    })
    .strict();
  const unifiedAgent = new mastraAgentModule.Agent({
    id: `structured-resume-unified-experiment-${randomUUID()}`,
    instructions: "一次完成结构化简历评分所需的全部 AI 语义判断。",
    maxRetries: 0,
    model: modelModule.withThinkingDisabled(modelModule.mastraModels.structuredModel),
    name: "StructuredResumeUnifiedExperimentAgent",
  });
  const unifiedAttempts: AttemptRecord[] = [];
  const unifiedStartedAt = performance.now();
  let unifiedRaw: z.infer<typeof unifiedSchema> | undefined;
  let unifiedResult: typeof baselineResult | undefined;
  let unifiedAudit: ReturnType<typeof auditModule.auditStructuredArtifact> | undefined;
  let unifiedError: ReturnType<typeof serializeError> | undefined;
  try {
    unifiedRaw = await createRecorder(
      "unified",
      modelId,
      unifiedAttempts,
      baseGenerate,
    )({
      agent: unifiedAgent,
      allowEmptyDefaults: false,
      fallbackToTextGeneration: false,
      maxOutputTokens: 40_000,
      observabilityLabel: "structured-resume-unified-experiment",
      prompt: unifiedPrompt,
      retryOnInvalid: false,
      retryOnTransient: false,
      schema: unifiedSchema,
      temperature: 0,
      timeoutMs: 240_000,
    });
    const unifiedOutput = unifiedSchema.parse(unifiedRaw);
    const gateOutput = await evaluation.judgeStructuredHardGates(
      workflowInput,
      createSliceGenerator(() => unifiedOutput.gateOutput),
      promptContext,
    );
    const dimensionOutput = await evaluation.judgeStructuredDimensionEvidence(
      workflowInput,
      createSliceGenerator(() => unifiedOutput.dimensionOutput),
      promptContext,
    );
    let adjustmentSliceCalls = 0;
    const adjustmentOutput = await evaluation.judgeStructuredAdjustments(
      workflowInput,
      gateOutput,
      createSliceGenerator(() => {
        adjustmentSliceCalls += 1;
        if (adjustmentSliceCalls > 1) {
          throw new Error("UNIFIED_OUTPUT_REQUIRES_SECOND_AI_CALL");
        }
        return unifiedOutput.adjustmentOutput;
      }),
      promptContext,
      dimensionOutput,
    );
    const calculationResult = evaluation.computeStructuredResumeCalculation({
      adjustmentOutput,
      dimensionOutput,
      gateOutput,
      workflowInput,
    });
    unifiedResult = evaluation.assembleStructuredResumeEvaluation({
      calculationResult,
      narrative: unifiedOutput.narrativeOutput,
      workflowInput,
    });
    unifiedAudit = auditModule.auditStructuredArtifact(unifiedResult, auditInput);
  } catch (error) {
    const caughtError = error instanceof Error ? error : new Error(String(error));
    unifiedError = serializeError(caughtError);
  }
  const unifiedDurationMs = Math.round(performance.now() - unifiedStartedAt);
  const baselineProjection = resultProjection(baselineResult);
  const unifiedProjection = unifiedResult ? resultProjection(unifiedResult) : undefined;
  const report = {
    baseline: {
      attempts: baselineAttempts,
      audit: baselineAudit,
      durationMs: baselineDurationMs,
      modelCallCount: baselineAttempts.length,
      projection: baselineProjection,
      result: baselineResult,
    },
    candidate: source.candidate,
    comparison: {
      durationDifferenceMs:
        baselineDurationMs === null ? null : unifiedDurationMs - baselineDurationMs,
      durationRatio:
        baselineDurationMs !== null && baselineDurationMs > 0
          ? Number((unifiedDurationMs / baselineDurationMs).toFixed(3))
          : null,
      projectionDifferenceKeys: unifiedProjection
        ? projectionDifferences(baselineProjection, unifiedProjection)
        : ["unified_failed"],
    },
    completedAt: new Date().toISOString(),
    experiment: "same parsed resume, current multi-agent workflow versus one unified AI call",
    job: source.job,
    modelId,
    sourceReport: inputPath,
    unified: {
      attempts: unifiedAttempts,
      audit: unifiedAudit,
      durationMs: unifiedDurationMs,
      error: unifiedError,
      modelCallCount: unifiedAttempts.length,
      projection: unifiedProjection,
      prompt: unifiedPrompt,
      rawOutput: unifiedRaw,
      result: unifiedResult,
    },
  };
  const outputPath = resolve(
    REPO_ROOT,
    `.eval/structured-resume-diagnostics/金文辉-agent-topology-${new Date()
      .toISOString()
      .replaceAll(/[:.]/g, "-")}.json`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(outputPath);
  console.log(
    JSON.stringify(
      {
        baseline: {
          audit: baselineAudit.status,
          durationMs: baselineDurationMs,
          modelCalls: baselineAttempts.length,
          score: baselineResult.calculations.compositeScore,
        },
        comparison: report.comparison,
        unified: {
          audit: unifiedAudit?.status,
          durationMs: unifiedDurationMs,
          error: unifiedError,
          modelCalls: unifiedAttempts.length,
          score: unifiedResult?.calculations.compositeScore,
        },
      },
      null,
      2,
    ),
  );
}

void main();
