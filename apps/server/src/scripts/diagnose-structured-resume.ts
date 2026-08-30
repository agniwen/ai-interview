import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { z } from "zod";
import { loadServerEnv, loadWebEnv } from "../standalone/env";
import type { StructuredResumeGenerator } from "../server/agents/structured-resume-evaluation";
import type { MastraGeneratorLike } from "../server/agents/mastra/agents/simple-generators";
import type { StructuredResumeWorkflowLogContext } from "../server/agents/mastra/workflows/structured-resume-review-workflow";
import { auditStructuredArtifact } from "./diagnose-structured-resume-audit";
import type { ArtifactAudit } from "./diagnose-structured-resume-audit";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIAGNOSTIC_NON_OCR_MODEL = "deepseek-v4-flash-0731";
const DIAGNOSTIC_MODEL_ENV_NAMES = [
  "MASTRA_CHAT_MODEL",
  "MASTRA_FAST_MODEL",
  "MASTRA_LONG_CONTEXT_MODEL",
  "MASTRA_SCORER_MODEL",
  "MASTRA_STRUCTURED_MODEL",
] as const;
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
  evaluationMode: "legacy" | "qualitative" | "structured" | null;
  id: string;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  lifecycleStatus: "draft" | "published" | null;
  resumeContentHash: string | null;
  resumeFileName: string | null;
  resumeParseStatus: string;
  resumeProfile: ResumeProfile | null;
  resumeStorageKey: string | null;
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

interface ParseSummary {
  configuredProvider: string;
  contentHashMatchesStored: boolean;
  fileName: string;
  fileSizeBytes: number;
  freshProfileMatchesStored: boolean;
  freshTextMatchesStored: boolean;
  pageCount: number;
  progressEvents: unknown[];
  textChars: number;
  textSource: string;
}

interface DiagnosticReport {
  candidate: { candidateName: string; createdAt: string; resumeId: string };
  audit?: ArtifactAudit;
  completedAt?: string;
  error?: SerializedError;
  job: { id: string; name: string | null };
  mode: "diagnostic-dry-run";
  modelAttempts?: TimedRecord[];
  modelCalls?: TimedRecord[];
  modelPromptContainsFullResumeText?: boolean;
  models: {
    actualFastModel: string;
    actualStructuredModel: string;
    ocrModel: string;
    parseStructuredModel: string;
  };
  parse?: ParseSummary;
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

export function forceDiagnosticNonOcrModels(env: Record<string, string | undefined>): void {
  for (const name of DIAGNOSTIC_MODEL_ENV_NAMES) {
    env[name] = DIAGNOSTIC_NON_OCR_MODEL;
  }
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
      resumeFileName: studioInterview.resumeFileName,
      resumeParseStatus: studioInterview.resumeParseStatus,
      resumeProfile: studioInterview.resumeProfile,
      resumeStorageKey: studioInterview.resumeStorageKey,
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
  attemptRecords: TimedRecord[],
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
    let attempt = 0;
    const instrumentedAgent: MastraGeneratorLike = {
      generate: async (prompt, options) => {
        attempt += 1;
        const attemptRecord: TimedRecord = {
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
        attemptRecords.push(attemptRecord);
        const attemptStartedAt = performance.now();
        try {
          const result = await input.agent.generate(prompt, options);
          attemptRecord.output = snapshot({
            error: result.error ? serializeError(result.error) : undefined,
            object: result.object,
            text: result.text,
            usage: result.usage,
          });
          return result;
        } catch (error) {
          attemptRecord.error = serializeError(
            error instanceof Error ? error : new Error(String(error)),
          );
          throw error;
        } finally {
          attemptRecord.completedAt = new Date().toISOString();
          attemptRecord.durationMs = Math.round(performance.now() - attemptStartedAt);
        }
      },
    };
    try {
      const output = await generate({ ...input, agent: instrumentedAgent });
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
  loadWebEnv();
  loadServerEnv();
  forceDiagnosticNonOcrModels(process.env);

  const rows = await loadTargets(options);
  const target = selectDiagnosticTarget(rows);
  const blueprint = jobEvaluationBlueprintSchema.parse(target.evaluationBlueprint);
  const publishedConfig = jobDescriptionStructuredConfigSchema.parse(target.structuredConfig);
  if (
    !(
      target.jobDescriptionId &&
      target.evaluationBlueprintHash &&
      target.deductionRuleSetVersion &&
      target.resumeFileName &&
      target.resumeProfile &&
      target.resumeStorageKey
    )
  ) {
    throw new Error("所选简历缺少原始文件或已发布岗位评分快照。");
  }
  const { resumeFileName } = target;
  const { resumeStorageKey } = target;

  const [
    evaluation,
    workflowModule,
    generatorModule,
    modelModule,
    hashModule,
    parsePipeline,
    parseDependenciesModule,
    parseProviderModule,
    resumeAnalysisModule,
    resumeParserModule,
    s3Module,
    fileHashModule,
  ] = await Promise.all([
    import("../server/agents/structured-resume-evaluation"),
    import("../server/agents/mastra/workflows/structured-resume-review-workflow"),
    import("../server/agents/mastra/agents/simple-generators"),
    import("../server/agents/mastra/models"),
    import("../lib/server/resume-evaluation-input-hash"),
    import("../lib/server/resume-parse-pipeline"),
    import("../lib/server/resume-parse-pipeline-dependencies"),
    import("../lib/server/resume-parse-provider"),
    import("../server/agents/resume-analysis-agent"),
    import("../server/agents/resume-parser-agent"),
    import("../lib/server/s3"),
    import("@arc/shared/file-hash"),
  ]);
  const actualStructuredModel = modelModule.getMastraModelIdentifier(
    modelModule.mastraModels.structuredModel,
  );
  const actualFastModel = modelModule.getMastraModelIdentifier(modelModule.mastraModels.fastModel);
  const parseModel = modelModule.mastraModels.structuredModel;
  const parseStructuredModel = modelModule.getMastraModelIdentifier(parseModel);
  const { Agent } = await import("@mastra/core/agent");
  const diagnosticResumeStructuredAgent = new Agent({
    id: "resume-structured-agent",
    instructions: "你是简历解析助手，负责把简历原文抽取成严格的候选人结构化档案。",
    maxRetries: 1,
    model: modelModule.withThinkingDisabled(parseModel),
    name: "DiagnosticResumeStructuredAgent",
  });
  const runId = `diagnostic:${randomUUID()}`;
  const modelCalls: TimedRecord[] = [];
  const modelAttempts: TimedRecord[] = [];
  const stages: TimedRecord[] = [];
  const workflowLogs: WorkflowLogRecord[] = [];
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
      ocrModel: process.env.QWEN_OCR_MODEL?.trim() || "unconfigured",
      parseStructuredModel,
    },
    runId,
    startedAt: new Date().toISOString(),
    targetMatchCount: rows.length,
    workflowInput: { status: "pending-fresh-parse" },
    workspace: { id: TARGET_WORKSPACE_ID, name: TARGET_WORKSPACE_NAME },
  };
  console.log(
    `开始诊断：${target.candidateName} / ${target.jobDescriptionName} / parse=${parseStructuredModel} / score=${actualStructuredModel}`,
  );
  let freshResumeText: string | null = null;
  try {
    const downloadRecord: TimedRecord = {
      input: { storageKey: resumeStorageKey },
      stage: "download-resume-object",
      startedAt: new Date().toISOString(),
    };
    stages.push(downloadRecord);
    const downloadStartedAt = performance.now();
    let resumeBytes: Uint8Array;
    let mediaType = "application/octet-stream";
    try {
      const object = await s3Module.getObjectStream(resumeStorageKey);
      if (!object) {
        throw new Error("原始简历对象不存在。");
      }
      resumeBytes = new Uint8Array(await new Response(object.body).arrayBuffer());
      mediaType = object.contentType ?? mediaType;
      downloadRecord.output = {
        contentLength: object.contentLength ?? resumeBytes.byteLength,
        contentType: mediaType,
      };
    } catch (error) {
      downloadRecord.error = serializeError(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      downloadRecord.completedAt = new Date().toISOString();
      downloadRecord.durationMs = Math.round(performance.now() - downloadStartedAt);
    }

    const hashResult = await recordAsyncStage(
      "hash-resume",
      { fileName: resumeFileName, fileSizeBytes: resumeBytes.byteLength },
      stages,
      async () => ({ contentHash: await fileHashModule.sha256HexOfBytes(resumeBytes) }),
    );
    const parseProgressEvents: unknown[] = [];
    let ocrPage = 0;
    const baseGenerate = generatorModule.generateStructuredWithMastraAgent;
    const baseParseDependencies = parseDependenciesModule.defaultResumeParsePipelineDependencies;
    const parseDependencies = {
      ...baseParseDependencies,
      generateStructuredWithMastraAgent: createModelRecorder(
        "structure-resume-model",
        parseStructuredModel,
        modelCalls,
        modelAttempts,
        baseGenerate,
      ),
      qwenVlOcr: (imageBytes: Buffer, imageMediaType?: string) => {
        ocrPage += 1;
        return recordAsyncStage(
          `ocr-page-${ocrPage}`,
          {
            imageBytes: imageBytes.byteLength,
            mediaType: imageMediaType ?? "image/png",
            page: ocrPage,
          },
          stages,
          () => baseParseDependencies.qwenVlOcr(imageBytes, imageMediaType),
        );
      },
      resumeStructuredAgent: diagnosticResumeStructuredAgent,
    };
    const parsedDocument = await recordAsyncStage(
      "extract-resume-document",
      {
        configuredProvider: parseProviderModule.getResumeParseProvider(),
        fileName: resumeFileName,
        fileSizeBytes: resumeBytes.byteLength,
        mediaType,
      },
      stages,
      () =>
        parsePipeline.parseResumeDocument(
          {
            bytes: resumeBytes,
            fileName: resumeFileName,
            mediaType,
            onProgress: (event) => parseProgressEvents.push(snapshot(event)),
          },
          parseDependencies,
        ),
    );
    const parsedStructured =
      "structured" in parsedDocument
        ? recordSyncStage(
            "structure-resume-provider-output",
            { textSource: parsedDocument.textSource },
            stages,
            () => parsedDocument.structured,
          )
        : await recordAsyncStage("structure-resume", { text: parsedDocument.text }, stages, () =>
            parsePipeline.generateResumeStructured(
              parsedDocument.text,
              { fileName: resumeFileName },
              parseDependencies,
            ),
          );
    const freshResumeProfile = recordSyncStage(
      "normalize-resume-profile",
      parsedStructured,
      stages,
      () =>
        resumeAnalysisModule.normalizeResumeProfile(
          resumeParserModule.toResumeProfile(parsedStructured),
        ),
    );
    freshResumeText = parsedDocument.text;
    report.parse = {
      configuredProvider: parseProviderModule.getResumeParseProvider(),
      contentHashMatchesStored: hashResult.contentHash === target.resumeContentHash,
      fileName: resumeFileName,
      fileSizeBytes: resumeBytes.byteLength,
      freshProfileMatchesStored: isDeepStrictEqual(freshResumeProfile, target.resumeProfile),
      freshTextMatchesStored: freshResumeText === target.resumeText,
      pageCount: parsedDocument.pageCount,
      progressEvents: parseProgressEvents,
      textChars: freshResumeText.length,
      textSource: parsedDocument.textSource,
    };

    const resumeInputHash = hashModule.computeResumeEvaluationInputHash({
      resumeContentHash: hashResult.contentHash,
      resumeProfile: freshResumeProfile,
      resumeText: freshResumeText,
    });
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
        resumeInputHash,
        resumeProfile: freshResumeProfile,
        resumeText: freshResumeText,
        runId,
      },
    };
    report.workflowInput = snapshot(workflowInput);
    recordSyncStage("validate-structured-input", workflowInput, stages, () => {
      evaluation.validateStructuredResumeInput(workflowInput);
      return { validated: true };
    });
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
              modelAttempts,
              baseGenerate,
            ),
          ),
        ),
      judgeAdjustments: (input, gateOutput, promptContext, dimensionOutput) =>
        recordAsyncStage(
          "judge-adjustments",
          { dimensionOutput, gateOutput, promptContext, workflowInput: input },
          stages,
          () =>
            evaluation.judgeStructuredAdjustments(
              input,
              gateOutput,
              createModelRecorder(
                "judge-adjustments",
                actualStructuredModel,
                modelCalls,
                modelAttempts,
                baseGenerate,
              ),
              promptContext,
              dimensionOutput,
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
                modelAttempts,
                baseGenerate,
              ),
              promptContext,
            ),
        ),
      judgeHardGates: (input, promptContext) =>
        recordAsyncStage("judge-hard-gates", { promptContext, workflowInput: input }, stages, () =>
          evaluation.judgeStructuredHardGates(
            input,
            createModelRecorder(
              "judge-hard-gates",
              actualStructuredModel,
              modelCalls,
              modelAttempts,
              baseGenerate,
            ),
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
    const result = await workflowModule.runStructuredResumeReviewWorkflow(workflowInput, workflow);
    report.result = snapshot(result);
    report.audit = auditStructuredArtifact(result, {
      expectedBlueprintHash: target.evaluationBlueprintHash,
      expectedInputHash: resumeInputHash,
      resumeProfile: freshResumeProfile,
      resumeText: freshResumeText,
    });
  } catch (error) {
    report.error = serializeError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    report.completedAt = new Date().toISOString();
    report.totalDurationMs = Math.round(performance.now() - startedAt);
    report.modelAttempts = modelAttempts;
    report.modelCalls = modelCalls;
    report.stages = stages;
    report.workflowLogs = workflowLogs;
    report.modelPromptContainsFullResumeText = Boolean(
      freshResumeText &&
      modelCalls.some((record) => {
        if (record.stage === "structure-resume-model") {
          return false;
        }
        const parsed = modelCallInputSchema.safeParse(record.input);
        return parsed.success && parsed.data.prompt.includes(freshResumeText ?? "");
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
