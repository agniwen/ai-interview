import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { StructuredResumeGenerator } from "../server/agents/structured-resume-evaluation";
import type { StructuredResumeWorkflowLogContext } from "../server/agents/mastra/workflows/structured-resume-review-workflow";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DEFAULT_MODEL = "deepseek-v4-flash-0731";
const TARGET_CANDIDATE_NAME = "金文辉";
const TARGET_WORKSPACE_ID = "org_default";
const TARGET_WORKSPACE_NAME = "极光/幻游";
const modelCallInputSchema = z.object({ prompt: z.string() }).passthrough();

export interface DiagnosticOptions {
  candidateName: string;
  resumeId?: string;
}

interface DiagnosticTarget {
  candidateName: string;
  createdAt: Date;
  deductionRuleSetVersion: number | null;
  evaluationBlueprint: unknown;
  evaluationBlueprintHash: string | null;
  evaluationMode: "legacy" | "structured" | null;
  id: string;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  lifecycleStatus: "draft" | "published" | null;
  resumeContentHash: string | null;
  resumeParseStatus: string;
  resumeProfile: ResumeProfile | null;
  resumeText: string | null;
  structuredConfig: unknown;
}

interface TimedRecord {
  completedAt?: string;
  durationMs?: number;
  error?: SerializedError;
  input: DiagnosticPayload;
  output?: unknown;
  stage: string;
  startedAt: string;
}

type DiagnosticPayload = object | string | number | boolean | null;

interface SerializedError {
  message: string;
  name: string;
  stack?: string;
}

interface ArgumentValue {
  consumed: number;
  value?: string;
}

interface WorkflowLogRecord {
  context: StructuredResumeWorkflowLogContext;
  level: "error" | "info";
  message: string;
}

interface DiagnosticReport {
  candidate: { candidateName: string; createdAt: string; resumeId: string };
  completedAt?: string;
  error?: SerializedError;
  job: { id: string; name: string | null };
  mode: "diagnostic-dry-run";
  modelCalls?: TimedRecord[];
  modelPromptContainsFullResumeText?: boolean;
  models: { actualFastModel: string; actualStructuredModel: string; requested: string };
  result?: object;
  runId: string;
  stages?: TimedRecord[];
  startedAt: string;
  targetMatchCount: number;
  totalDurationMs?: number;
  workflowInput: object;
  workflowLogs?: WorkflowLogRecord[];
  workspace: { id: string; name: string };
}

function argumentValue(argv: string[], index: number): ArgumentValue {
  const [argument] = argv.slice(index, index + 1);
  if (!argument) {
    return { consumed: 0 };
  }
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex !== -1) {
    return { consumed: 0, value: argument.slice(equalsIndex + 1) };
  }
  return { consumed: 1, value: argv[index + 1] };
}

export function parseDiagnosticOptions(argv: string[]): DiagnosticOptions {
  const options: DiagnosticOptions = { candidateName: TARGET_CANDIDATE_NAME };
  for (let index = 0; index < argv.length; index += 1) {
    const [argument] = argv.slice(index, index + 1);
    if (!argument) {
      break;
    }
    const [key] = argument.split("=", 1);
    if (key !== "--resume-id") {
      throw new Error(`未知参数：${argument}`);
    }
    const { consumed, value } = argumentValue(argv, index);
    if (!value?.trim()) {
      throw new Error(`${key} 缺少参数值。`);
    }
    index += consumed;
    options.resumeId = value.trim();
  }
  return options;
}

function isEligible(row: DiagnosticTarget): boolean {
  return Boolean(
    row.jobDescriptionId &&
    row.resumeParseStatus === "ready" &&
    row.resumeProfile &&
    row.evaluationMode === "structured" &&
    row.lifecycleStatus === "published" &&
    row.evaluationBlueprintHash &&
    row.deductionRuleSetVersion &&
    jobEvaluationBlueprintSchema.safeParse(row.evaluationBlueprint).success &&
    jobDescriptionStructuredConfigSchema.safeParse(row.structuredConfig).success,
  );
}

export function selectDiagnosticTarget(rows: DiagnosticTarget[]): DiagnosticTarget {
  const target = rows.find(isEligible);
  if (target) {
    return target;
  }
  const statuses = rows.map((row) => ({
    evaluationMode: row.evaluationMode,
    id: row.id,
    lifecycleStatus: row.lifecycleStatus,
    resumeParseStatus: row.resumeParseStatus,
  }));
  throw new Error(`没有找到可评分的简历：${JSON.stringify(statuses)}`);
}

function serializeError(error: Error): SerializedError {
  return { message: error.message, name: error.name, stack: error.stack };
}

function snapshot<T>(value: T): T {
  return structuredClone(value);
}

function defaultOutputPath(candidateName: string): string {
  const safeName = candidateName.replaceAll(/[^\p{L}\p{N}._-]+/gu, "-");
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return resolve(REPO_ROOT, ".eval/structured-resume-diagnostics", `${safeName}-${timestamp}.json`);
}

async function loadTargets(options: DiagnosticOptions): Promise<DiagnosticTarget[]> {
  const [{ db }, { jobDescription, organization, studioInterview }, { and, desc, eq }] =
    await Promise.all([
      import("../lib/server/db"),
      import("@arc/db-schema/schema"),
      import("drizzle-orm"),
    ]);
  const [workspace] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, TARGET_WORKSPACE_ID))
    .limit(1);
  if (!workspace || workspace.name !== TARGET_WORKSPACE_NAME) {
    throw new Error(`目标工作区校验失败：预期 ${TARGET_WORKSPACE_ID}/${TARGET_WORKSPACE_NAME}。`);
  }
  return db
    .select({
      candidateName: studioInterview.candidateName,
      createdAt: studioInterview.createdAt,
      deductionRuleSetVersion: jobDescription.deductionRuleSetVersion,
      evaluationBlueprint: jobDescription.evaluationBlueprint,
      evaluationBlueprintHash: jobDescription.evaluationBlueprintHash,
      evaluationMode: jobDescription.evaluationMode,
      id: studioInterview.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      lifecycleStatus: jobDescription.lifecycleStatus,
      resumeContentHash: studioInterview.resumeContentHash,
      resumeParseStatus: studioInterview.resumeParseStatus,
      resumeProfile: studioInterview.resumeProfile,
      resumeText: studioInterview.resumeText,
      structuredConfig: jobDescription.structuredConfig,
    })
    .from(studioInterview)
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .where(
      and(
        eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
        eq(studioInterview.candidateName, options.candidateName),
        options.resumeId ? eq(studioInterview.id, options.resumeId) : undefined,
      ),
    )
    .orderBy(desc(studioInterview.createdAt), desc(studioInterview.id))
    .limit(20);
}

function createModelRecorder(
  stage: string,
  modelId: string,
  records: TimedRecord[],
  generate: StructuredResumeGenerator,
): StructuredResumeGenerator {
  return async (input) => {
    const record: TimedRecord = {
      input: snapshot({
        allowEmptyDefaults: input.allowEmptyDefaults,
        fallbackToTextGeneration: input.fallbackToTextGeneration,
        maxOutputTokens: input.maxOutputTokens,
        modelId,
        observabilityLabel: input.observabilityLabel,
        prompt: input.prompt,
        retryOnInvalid: input.retryOnInvalid,
        retryOnTransient: input.retryOnTransient,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
      }),
      stage,
      startedAt: new Date().toISOString(),
    };
    records.push(record);
    const startedAt = performance.now();
    try {
      const output = await generate(input);
      record.output = snapshot(output);
      return output;
    } catch (error) {
      record.error = serializeError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      record.completedAt = new Date().toISOString();
      record.durationMs = Math.round(performance.now() - startedAt);
    }
  };
}

async function recordAsyncStage<
  TInput extends DiagnosticPayload,
  TOutput extends DiagnosticPayload,
>(
  stage: string,
  input: TInput,
  records: TimedRecord[],
  execute: () => Promise<TOutput>,
): Promise<TOutput> {
  const record: TimedRecord = {
    input: snapshot(input),
    stage,
    startedAt: new Date().toISOString(),
  };
  records.push(record);
  const startedAt = performance.now();
  try {
    const output = await execute();
    record.output = snapshot(output);
    return output;
  } catch (error) {
    record.error = serializeError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    record.completedAt = new Date().toISOString();
    record.durationMs = Math.round(performance.now() - startedAt);
  }
}

function recordSyncStage<TInput extends DiagnosticPayload, TOutput extends DiagnosticPayload>(
  stage: string,
  input: TInput,
  records: TimedRecord[],
  execute: () => TOutput,
): TOutput {
  const record: TimedRecord = {
    input: snapshot(input),
    stage,
    startedAt: new Date().toISOString(),
  };
  records.push(record);
  const startedAt = performance.now();
  try {
    const output = execute();
    record.output = snapshot(output);
    return output;
  } catch (error) {
    record.error = serializeError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    record.completedAt = new Date().toISOString();
    record.durationMs = Math.round(performance.now() - startedAt);
  }
}

async function runDiagnostic(options: DiagnosticOptions): Promise<string> {
  loadEnv({ path: resolve(REPO_ROOT, "apps/ai-recruitment-copilot/.env"), quiet: true });
  process.env.MASTRA_STRUCTURED_MODEL = DEFAULT_MODEL;
  process.env.MASTRA_FAST_MODEL = DEFAULT_MODEL;

  const rows = await loadTargets(options);
  const target = selectDiagnosticTarget(rows);
  const blueprint = jobEvaluationBlueprintSchema.parse(target.evaluationBlueprint);
  const publishedConfig = jobDescriptionStructuredConfigSchema.parse(target.structuredConfig);
  if (
    !(
      target.jobDescriptionId &&
      target.evaluationBlueprintHash &&
      target.deductionRuleSetVersion &&
      target.resumeProfile
    )
  ) {
    throw new Error("所选简历缺少已发布岗位评分快照。");
  }
  const { resumeProfile } = target;

  const [evaluation, workflowModule, generatorModule, modelModule, hashModule] = await Promise.all([
    import("../server/agents/structured-resume-evaluation"),
    import("../server/agents/mastra/workflows/structured-resume-review-workflow"),
    import("../server/agents/mastra/agents/simple-generators"),
    import("../server/agents/mastra/models"),
    import("../lib/server/resume-evaluation-input-hash"),
  ]);
  const actualStructuredModel = modelModule.getMastraModelIdentifier(
    modelModule.mastraModels.structuredModel,
  );
  const actualFastModel = modelModule.getMastraModelIdentifier(modelModule.mastraModels.fastModel);
  const runId = `diagnostic:${randomUUID()}`;
  const workflowInput = {
    engine: {
      modelId: actualStructuredModel,
      promptVersion: evaluation.STRUCTURED_RESUME_PROMPT_VERSION,
      version: evaluation.STRUCTURED_RESUME_ENGINE_VERSION,
    },
    jobSnapshot: {
      blueprint,
      blueprintHash: target.evaluationBlueprintHash,
      deductionRuleSetVersion: target.deductionRuleSetVersion,
      evaluationMode: "structured" as const,
      jobId: target.jobDescriptionId,
      publishedConfig,
    },
    resumeInput: {
      evaluationAsOf: new Date().toISOString().slice(0, 10),
      resumeInputHash: hashModule.computeResumeEvaluationInputHash({
        resumeContentHash: target.resumeContentHash,
        resumeProfile,
        resumeText: target.resumeText,
      }),
      resumeProfile,
      resumeText: target.resumeText,
      runId,
    },
  };
  const modelCalls: TimedRecord[] = [];
  const stages: TimedRecord[] = [];
  recordSyncStage("validate-structured-input", workflowInput, stages, () => {
    evaluation.validateStructuredResumeInput(workflowInput);
    return { validated: true };
  });
  const workflowLogs: WorkflowLogRecord[] = [];
  const baseGenerate = generatorModule.generateStructuredWithMastraAgent;
  const workflow = workflowModule.createStructuredResumeReviewWorkflow({
    assemble: (input) =>
      recordSyncStage("assemble-structured-evaluation", input, stages, () =>
        evaluation.assembleStructuredResumeEvaluation(input),
      ),
    compute: (input) =>
      recordSyncStage("compute-structured-score", input, stages, () =>
        evaluation.computeStructuredResumeCalculation(input),
      ),
    generateNarrative: (input) =>
      recordAsyncStage("generate-structured-narrative", input, stages, () =>
        evaluation.generateStructuredNarrative(
          input,
          createModelRecorder(
            "generate-structured-narrative",
            actualFastModel,
            modelCalls,
            baseGenerate,
          ),
        ),
      ),
    judgeAdjustments: (input, gateOutput, promptContext) =>
      recordAsyncStage(
        "judge-adjustments",
        { gateOutput, promptContext, workflowInput: input },
        stages,
        () =>
          evaluation.judgeStructuredAdjustments(
            input,
            gateOutput,
            createModelRecorder(
              "judge-adjustments",
              actualStructuredModel,
              modelCalls,
              baseGenerate,
            ),
            promptContext,
          ),
      ),
    judgeDimensionEvidence: (input, promptContext) =>
      recordAsyncStage(
        "judge-dimension-evidence",
        { promptContext, workflowInput: input },
        stages,
        () =>
          evaluation.judgeStructuredDimensionEvidence(
            input,
            createModelRecorder(
              "judge-dimension-evidence",
              actualStructuredModel,
              modelCalls,
              baseGenerate,
            ),
            promptContext,
          ),
      ),
    judgeHardGates: (input, promptContext) =>
      recordAsyncStage("judge-hard-gates", { promptContext, workflowInput: input }, stages, () =>
        evaluation.judgeStructuredHardGates(
          input,
          createModelRecorder("judge-hard-gates", actualStructuredModel, modelCalls, baseGenerate),
          promptContext,
        ),
      ),
    logger: {
      error: (message, context) => {
        workflowLogs.push(snapshot({ context, level: "error", message }));
        console.error(message, context.step, context.durationMs ?? "");
      },
      info: (message, context) => {
        workflowLogs.push(snapshot({ context, level: "info", message }));
        console.log(message, context.step, context.durationMs ?? "");
      },
    },
    validate: evaluation.validateStructuredResumeInput,
  });

  const outputPath = defaultOutputPath(options.candidateName);
  const startedAt = performance.now();
  const report: DiagnosticReport = {
    candidate: {
      candidateName: target.candidateName,
      createdAt: target.createdAt.toISOString(),
      resumeId: target.id,
    },
    job: { id: target.jobDescriptionId, name: target.jobDescriptionName },
    mode: "diagnostic-dry-run",
    models: {
      actualFastModel,
      actualStructuredModel,
      requested: DEFAULT_MODEL,
    },
    runId,
    startedAt: new Date().toISOString(),
    targetMatchCount: rows.length,
    workflowInput: snapshot(workflowInput),
    workspace: { id: TARGET_WORKSPACE_ID, name: TARGET_WORKSPACE_NAME },
  };
  console.log(
    `开始诊断：${target.candidateName} / ${target.jobDescriptionName} / ${actualStructuredModel}`,
  );
  try {
    const result = await workflowModule.runStructuredResumeReviewWorkflow(workflowInput, workflow);
    report.result = snapshot(result);
  } catch (error) {
    report.error = serializeError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    report.totalDurationMs = Math.round(performance.now() - startedAt);
    report.modelCalls = modelCalls;
    report.stages = stages;
    report.workflowLogs = workflowLogs;
    report.modelPromptContainsFullResumeText = Boolean(
      target.resumeText &&
      modelCalls.some((record) => {
        const parsed = modelCallInputSchema.safeParse(record.input);
        return parsed.success && parsed.data.prompt.includes(target.resumeText ?? "");
      }),
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    console.log(`诊断报告：${outputPath}`);
  }
  return outputPath;
}

async function main(): Promise<void> {
  await runDiagnostic(parseDiagnosticOptions(process.argv.slice(2)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error : new Error(String(error)));
    process.exitCode = 1;
  }
}
