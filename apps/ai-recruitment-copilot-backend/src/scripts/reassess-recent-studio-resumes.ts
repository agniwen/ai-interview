import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { StructuredResumeEvaluationV1 } from "@arc/db-schema/structured-resume-evaluation";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { auditStructuredArtifact } from "./diagnose-structured-resume-audit";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const TARGET_WORKSPACE_ID = "org_default";
const TARGET_WORKSPACE_NAME = "极光/幻游";
const DEFAULT_TARGET_LIMIT = 20;
const CONCURRENCY = 4;
const NON_OCR_MODEL = "deepseek-v4-flash-0731";
const MODEL_ENV_NAMES = [
  "MASTRA_CHAT_MODEL",
  "MASTRA_FAST_MODEL",
  "MASTRA_LONG_CONTEXT_MODEL",
  "MASTRA_SCORER_MODEL",
  "MASTRA_STRUCTURED_MODEL",
] as const;

interface WorkflowTiming {
  durationMs?: number;
  level: "error" | "info";
  message: string;
  runId: string;
  step: string;
}

interface TargetRecord {
  blueprintHash: string | null;
  candidateName: string;
  createdAt: Date;
  evaluationMode: "legacy" | "structured" | null;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  lifecycleStatus: "draft" | "published" | null;
  outcome: string;
  pipelineStage: string;
  resumeContentHash: string | null;
  resumeParseStatus: string;
  resumeProfile: ResumeProfile | null;
  resumeReviewGeneratedAt: Date | null;
  resumeReviewStatus: string;
  resumeText: string | null;
  ruleSetVersion: number | null;
  structuredCompositeScore: number | null;
  structuredGateStatus: string | null;
  structuredResumeEvaluation: StructuredResumeEvaluationV1 | null;
  structuredScoreGrade: string | null;
  id: string;
}

interface SerializedError {
  message: string;
  name: string;
  stack?: string;
}

const workflowLogArgumentsSchema = z
  .tuple([
    z.string(),
    z
      .object({
        durationMs: z.number().optional(),
        runId: z.string(),
        step: z.string(),
      })
      .passthrough(),
  ])
  .rest(z.unknown());
const reassessmentRecordStatusSchema = z.object({
  status: z.enum(["completed", "failed", "skipped"]),
});

function forceModels(): void {
  for (const name of MODEL_ENV_NAMES) {
    process.env[name] = NON_OCR_MODEL;
  }
}

function outputPath(selectedCount: number, targetLimit: number): string {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return resolve(
    REPO_ROOT,
    ".eval/structured-resume-diagnostics",
    `极光-幻游-招聘台最近${targetLimit}条-4-agent-${selectedCount === targetLimit ? "full" : `retry-${selectedCount}`}-${timestamp}.json`,
  );
}

function selectedLimit(): number {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  if (!argument) {
    return DEFAULT_TARGET_LIMIT;
  }
  const limit = Number(argument.slice("--limit=".length));
  if (!(Number.isInteger(limit) && limit > 0 && limit <= 100)) {
    throw new Error("--limit 必须是 1-100 的整数。");
  }
  return limit;
}

function selectedResumeIds(): Set<string> | null {
  const argument = process.argv.find((value) => value.startsWith("--resume-ids="));
  if (!argument) {
    return null;
  }
  return new Set(
    argument
      .slice("--resume-ids=".length)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function serializeError(error: Error): SerializedError {
  return { message: error.message, name: error.name, stack: error.stack };
}

function skipReason(record: TargetRecord): string | null {
  if (record.resumeParseStatus !== "ready" || !record.resumeProfile) {
    return "简历尚未解析完成";
  }
  if (!record.jobDescriptionId) {
    return "未绑定岗位，4-Agent 评分缺少岗位蓝图";
  }
  if (record.evaluationMode !== "structured") {
    return `岗位评分模式为 ${record.evaluationMode ?? "unknown"}，不是 structured`;
  }
  if (record.lifecycleStatus !== "published" || !record.blueprintHash || !record.ruleSetVersion) {
    return "岗位没有可用的已发布结构化评分蓝图";
  }
  if (record.pipelineStage === "closed" || record.outcome !== "in_pipeline") {
    return "候选人已结束";
  }
  return null;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  iteratee: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const queue = values.map((value, index) => ({ index, value }));
  const results: { index: number; value: R }[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const item = queue[cursor];
        cursor += 1;
        if (item) {
          results.push({
            index: item.index,
            value: await iteratee(item.value, item.index),
          });
        }
      }
    }),
  );
  return results.toSorted((left, right) => left.index - right.index).map((result) => result.value);
}

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, "apps/ai-recruitment-copilot/.env"), quiet: true });
  loadEnv({
    path: resolve(REPO_ROOT, "apps/ai-recruitment-copilot-backend/.env"),
    quiet: true,
  });
  forceModels();
  // This script executes the persisted lifecycle locally so one run owns timing and completion.
  // Queue workers are intentionally bypassed; the same scheduling and guarded writeback remain.
  process.env.REDIS_URL = "";
  const targetLimit = selectedLimit();

  const [
    { db },
    { jobDescription, organization, studioInterview },
    { and, desc, eq },
    { enqueueResumeReassessmentForRecord },
    { reassessResumeRecord },
    { computeResumeEvaluationInputHash },
    modelModule,
  ] = await Promise.all([
    import("../lib/server/db"),
    import("@arc/db-schema/schema"),
    import("drizzle-orm"),
    import("../server/routes/studio/routes/resumes/utils/review-queue"),
    import("../server/routes/studio/routes/resumes/utils/review-worker"),
    import("../lib/server/resume-evaluation-input-hash"),
    import("../server/agents/mastra/models"),
  ]);

  const [workspace] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, TARGET_WORKSPACE_ID))
    .limit(1);
  if (!workspace || workspace.name !== TARGET_WORKSPACE_NAME) {
    throw new Error("目标工作区校验失败。\n");
  }

  const selection = {
    blueprintHash: jobDescription.evaluationBlueprintHash,
    candidateName: studioInterview.candidateName,
    createdAt: studioInterview.createdAt,
    evaluationMode: jobDescription.evaluationMode,
    id: studioInterview.id,
    jobDescriptionId: studioInterview.jobDescriptionId,
    jobDescriptionName: jobDescription.name,
    lifecycleStatus: jobDescription.lifecycleStatus,
    outcome: studioInterview.outcome,
    pipelineStage: studioInterview.pipelineStage,
    resumeContentHash: studioInterview.resumeContentHash,
    resumeParseStatus: studioInterview.resumeParseStatus,
    resumeProfile: studioInterview.resumeProfile,
    resumeReviewGeneratedAt: studioInterview.resumeReviewGeneratedAt,
    resumeReviewStatus: studioInterview.resumeReviewStatus,
    resumeText: studioInterview.resumeText,
    ruleSetVersion: jobDescription.deductionRuleSetVersion,
    structuredCompositeScore: studioInterview.structuredCompositeScore,
    structuredGateStatus: studioInterview.structuredGateStatus,
    structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
    structuredScoreGrade: studioInterview.structuredScoreGrade,
  };
  // SAFETY: the explicit Drizzle selection above maps every selected column to TargetRecord;
  // nullable joined job fields are represented by the nullable fields in that contract.
  const recentTargets = (await db
    .select(selection)
    .from(studioInterview)
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(studioInterview.organizationId, jobDescription.organizationId),
      ),
    )
    .where(eq(studioInterview.organizationId, TARGET_WORKSPACE_ID))
    .orderBy(desc(studioInterview.createdAt), desc(studioInterview.id))
    .limit(targetLimit)) as TargetRecord[];
  if (recentTargets.length !== targetLimit) {
    throw new Error(`招聘台记录不足 ${targetLimit} 条，实际 ${recentTargets.length} 条。`);
  }
  const requestedIds = selectedResumeIds();
  const targets = requestedIds
    ? recentTargets.filter((target) => requestedIds.has(target.id))
    : recentTargets;
  if (requestedIds && targets.length !== requestedIds.size) {
    throw new Error(
      `指定重评记录不完全属于招聘台最近 ${targetLimit} 条：请求 ${requestedIds.size} 条，命中 ${targets.length} 条。`,
    );
  }

  const timings: WorkflowTiming[] = [];
  const originalInfo = console.info.bind(console);
  const originalError = console.error.bind(console);
  const capture = (level: "error" | "info", args: unknown[]) => {
    const parsedArguments = workflowLogArgumentsSchema.safeParse(args);
    if (parsedArguments.success) {
      const [message, context] = parsedArguments.data;
      if (!message.startsWith("[structured-resume-review]")) {
        return;
      }
      timings.push({
        durationMs: context.durationMs,
        level,
        message,
        runId: context.runId,
        step: context.step,
      });
    }
  };
  console.info = (...args: unknown[]) => {
    capture("info", args);
    originalInfo(...args);
  };
  console.error = (...args: unknown[]) => {
    capture("error", args);
    originalError(...args);
  };

  const batchStartedAt = new Date();
  const started = performance.now();
  let records: unknown[];
  try {
    records = await mapConcurrent(targets, CONCURRENCY, async (target, index) => {
      const reason = skipReason(target);
      const before = {
        gate: target.structuredGateStatus,
        generatedAt: target.resumeReviewGeneratedAt?.toISOString() ?? null,
        grade: target.structuredScoreGrade,
        score: target.structuredCompositeScore,
      };
      if (reason) {
        originalInfo(`[${index + 1}/${targets.length}] 跳过 ${target.candidateName}: ${reason}`);
        return {
          before,
          candidateName: target.candidateName,
          createdAt: target.createdAt.toISOString(),
          id: target.id,
          jobDescriptionId: target.jobDescriptionId,
          jobDescriptionName: target.jobDescriptionName,
          ordinal: index + 1,
          reason,
          status: "skipped",
        };
      }

      const recordStartedAt = new Date();
      const recordStarted = performance.now();
      originalInfo(
        `[${index + 1}/${targets.length}] 开始 ${target.candidateName} / ${target.jobDescriptionName}`,
      );
      try {
        const scheduleStarted = performance.now();
        const scheduling = await enqueueResumeReassessmentForRecord({
          organizationId: TARGET_WORKSPACE_ID,
          resumeRecordId: target.id,
        });
        const scheduleDurationMs = Math.round(performance.now() - scheduleStarted);
        if (scheduling !== "fallback_sync") {
          throw new Error(`本地执行预期 fallback_sync，实际 ${scheduling}`);
        }
        const evaluationStarted = performance.now();
        const lifecycle = await reassessResumeRecord({
          organizationId: TARGET_WORKSPACE_ID,
          resumeRecordId: target.id,
        });
        const evaluationDurationMs = Math.round(performance.now() - evaluationStarted);
        // SAFETY: this query reuses the same TargetRecord selection contract validated above.
        const [after] = (await db
          .select(selection)
          .from(studioInterview)
          .leftJoin(
            jobDescription,
            and(
              eq(studioInterview.jobDescriptionId, jobDescription.id),
              eq(studioInterview.organizationId, jobDescription.organizationId),
            ),
          )
          .where(
            and(
              eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
              eq(studioInterview.id, target.id),
            ),
          )
          .limit(1)) as TargetRecord[];
        if (!(after?.structuredResumeEvaluation && after.resumeProfile && after.resumeText)) {
          throw new Error("重评完成后没有读取到完整结构化评分产物。");
        }
        const inputHash = computeResumeEvaluationInputHash({
          resumeContentHash: after.resumeContentHash,
          resumeProfile: after.resumeProfile,
          resumeText: after.resumeText,
        });
        const audit = auditStructuredArtifact(after.structuredResumeEvaluation, {
          expectedBlueprintHash: after.blueprintHash ?? "",
          expectedInputHash: inputHash,
          resumeProfile: after.resumeProfile,
          resumeText: after.resumeText,
        });
        const { runId } = after.structuredResumeEvaluation;
        const stageDurationsMs = Object.fromEntries(
          timings
            .filter(
              (timing) =>
                timing.runId === runId &&
                timing.message.endsWith("step completed") &&
                timing.durationMs !== undefined,
            )
            .map((timing) => [timing.step, timing.durationMs]),
        );
        const totalDurationMs = Math.round(performance.now() - recordStarted);
        originalInfo(
          `[${index + 1}/${targets.length}] 完成 ${target.candidateName}: ${after.structuredCompositeScore} / ${after.structuredScoreGrade} / ${totalDurationMs}ms`,
        );
        return {
          after: {
            artifact: after.structuredResumeEvaluation,
            gate: after.structuredGateStatus,
            generatedAt: after.resumeReviewGeneratedAt?.toISOString() ?? null,
            grade: after.structuredScoreGrade,
            score: after.structuredCompositeScore,
          },
          audit,
          before,
          candidateName: target.candidateName,
          createdAt: target.createdAt.toISOString(),
          durationsMs: {
            evaluation: evaluationDurationMs,
            schedule: scheduleDurationMs,
            total: totalDurationMs,
          },
          id: target.id,
          jobDescriptionId: target.jobDescriptionId,
          jobDescriptionName: target.jobDescriptionName,
          lifecycle,
          ordinal: index + 1,
          runId,
          stageDurationsMs,
          startedAt: recordStartedAt.toISOString(),
          status: "completed",
        };
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        const totalDurationMs = Math.round(performance.now() - recordStarted);
        originalError(`[${index + 1}/${targets.length}] 失败 ${target.candidateName}`, failure);
        return {
          before,
          candidateName: target.candidateName,
          createdAt: target.createdAt.toISOString(),
          durationMs: totalDurationMs,
          error: serializeError(failure),
          id: target.id,
          jobDescriptionId: target.jobDescriptionId,
          jobDescriptionName: target.jobDescriptionName,
          ordinal: index + 1,
          startedAt: recordStartedAt.toISOString(),
          status: "failed",
        };
      }
    });
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }

  const completed = records.filter((record) => {
    const status = reassessmentRecordStatusSchema.safeParse(record);
    return status.success && status.data.status === "completed";
  });
  const failed = records.filter((record) => {
    const status = reassessmentRecordStatusSchema.safeParse(record);
    return status.success && status.data.status === "failed";
  });
  const skipped = records.filter((record) => {
    const status = reassessmentRecordStatusSchema.safeParse(record);
    return status.success && status.data.status === "skipped";
  });
  const report = {
    batch: {
      completedAt: new Date().toISOString(),
      concurrency: CONCURRENCY,
      durationMs: Math.round(performance.now() - started),
      requested: targets.length,
      scopeRequested: targetLimit,
      selectedOrder: "studio_interview.created_at DESC, studio_interview.id DESC",
      startedAt: batchStartedAt.toISOString(),
      totals: { completed: completed.length, failed: failed.length, skipped: skipped.length },
    },
    models: {
      fast: modelModule.getMastraModelIdentifier(modelModule.mastraModels.fastModel),
      structured: modelModule.getMastraModelIdentifier(modelModule.mastraModels.structuredModel),
    },
    records,
    topology: {
      agents: ["Hard Gate", "Dimension Evidence", "Adjustment", "Narrative"],
      description: "Hard Gate 与 Dimension 并行，随后 Adjustment、确定性算分、Narrative。",
    },
    workspace,
  };
  const path = outputPath(targets.length, targetLimit);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  originalInfo(`批量重评报告：${path}`);
  originalInfo(JSON.stringify(report.batch, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
