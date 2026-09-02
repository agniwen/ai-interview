import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { loadStandaloneEnv } from "../standalone/env";

const DEFAULT_TARGET_COUNT = 10;
const MAX_DATE_TARGET_COUNT = 500;
const TARGET_CONCURRENCY = 10;
const TARGET_MODEL = "deepseek-v4-flash-0731";
const WORKSPACE_ID = "org_default";
const WORKSPACE_NAME = "极光/幻游";

interface Options {
  apply: boolean;
  date: string | null;
  excludeResumeIds: string[];
  expectedFingerprint: string | null;
  outputPath: string | null;
  retryFailedEvaluations: boolean;
}

interface FingerprintTarget {
  createdAt: Date;
  id: string;
  jobDescriptionId: string | null;
}

interface LogContext {
  phase: "evaluation" | "parse";
  resumeId: string;
}

interface RuntimeLog {
  arguments: string[];
  level: "error" | "info" | "log" | "warn";
  phase: LogContext["phase"] | null;
  resumeId: string | null;
  timestamp: string;
}

interface ExecutionReport {
  concurrency: number;
  evaluation: object | null;
  fatalError: string | null;
  final: (object | null)[];
  fingerprint: string | null;
  finishedAt: string | null;
  mode: "apply" | "dry-run" | "retry-failed-evaluations";
  model: string;
  parse: object | null;
  preflightErrors: object[];
  preflightWarnings: object[];
  runtimeLogs: RuntimeLog[];
  startedAt: string;
  summary: { failed: number; succeeded: number; totalWallClockDurationMs: number } | null;
  targets: object[];
  workspace: { id: string; name: string };
}

const logContext = new AsyncLocalStorage<LogContext>();

export function parseRerunLatestWorkspaceResumesOptions(argv: string[]): Options {
  const options: Options = {
    apply: false,
    date: null,
    excludeResumeIds: [],
    expectedFingerprint: null,
    outputPath: null,
    retryFailedEvaluations: false,
  };
  for (const argument of argv) {
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--retry-failed-evaluations") {
      options.retryFailedEvaluations = true;
      continue;
    }
    const [key, value] = argument.split("=", 2);
    if (key === "--date" && value) {
      options.date = value;
    } else if (key === "--exclude-resume-id" && value) {
      options.excludeResumeIds.push(value);
    } else if (key === "--expected-fingerprint" && value) {
      options.expectedFingerprint = value;
    } else if (key === "--output" && value) {
      options.outputPath = value;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (options.expectedFingerprint !== null && !/^[a-f0-9]{64}$/.test(options.expectedFingerprint)) {
    throw new Error("--expected-fingerprint 必须是 64 位小写十六进制 SHA-256。 ");
  }
  if (options.apply && !options.expectedFingerprint) {
    throw new Error("--apply 必须同时提供 --expected-fingerprint。请先执行 dry-run。 ");
  }
  if (options.retryFailedEvaluations && !options.apply) {
    throw new Error("--retry-failed-evaluations 必须与 --apply 一起使用。 ");
  }
  if (options.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error("--date 必须是 YYYY-MM-DD。 ");
  }
  return options;
}

export function shouldRetryEvaluation(snapshot: {
  resumeReviewError: string | null;
  resumeReviewStatus: string | null;
  structuredResumeEvaluation: unknown;
}): boolean {
  return (
    snapshot.resumeReviewStatus === "failed" ||
    snapshot.resumeReviewError !== null ||
    snapshot.structuredResumeEvaluation === null
  );
}

export function isSuccessfulRerunOutcome(
  parseStatus: string,
  snapshot: {
    resumeParseStatus: string | null;
    resumeReviewStatus: string | null;
    structuredResumeEvaluation: unknown;
  } | null,
): boolean {
  return (
    parseStatus === "ready" &&
    snapshot?.resumeParseStatus === "ready" &&
    snapshot.resumeReviewStatus === "ready" &&
    snapshot.structuredResumeEvaluation !== null
  );
}

export function buildRerunExecutionPlan(
  retryFailedEvaluations: boolean,
  snapshots: ({
    resumeReviewError: string | null;
    resumeReviewStatus: string | null;
    structuredResumeEvaluation: unknown;
  } | null)[],
) {
  return snapshots.map((snapshot) => ({
    evaluate: !retryFailedEvaluations || (snapshot !== null && shouldRetryEvaluation(snapshot)),
    reparse: !retryFailedEvaluations,
  }));
}

export function buildTargetFingerprint(targets: FingerprintTarget[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        targets.map((target) => ({
          createdAt: target.createdAt.toISOString(),
          id: target.id,
          jobDescriptionId: target.jobDescriptionId,
        })),
      ),
    )
    .digest("hex");
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- console accepts arbitrary values at this capture boundary.
function serializeLogValue(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({ message: value.message, name: value.name, stack: value.stack });
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function captureConsole(runtimeLogs: RuntimeLog[]): () => void {
  const original = {
    error: console.error.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
  };
  for (const level of ["error", "info", "log", "warn"] as const) {
    console[level] = (...args: unknown[]) => {
      const context = logContext.getStore();
      runtimeLogs.push({
        arguments: args.map(serializeLogValue),
        level,
        phase: context?.phase ?? null,
        resumeId: context?.resumeId ?? null,
        timestamp: new Date().toISOString(),
      });
      original[level](...args);
    };
  }
  return () => {
    console.error = original.error;
    console.info = original.info;
    console.log = original.log;
    console.warn = original.warn;
  };
}

function defaultOutputPath(startedAt: Date): string {
  return path.resolve(
    import.meta.dirname,
    "../../.eval/latest-resume-reruns",
    `${startedAt.toISOString().replaceAll(":", "-")}.json`,
  );
}

function getReportMode(options: Options): ExecutionReport["mode"] {
  if (options.retryFailedEvaluations) {
    return "retry-failed-evaluations";
  }
  return options.apply ? "apply" : "dry-run";
}

async function loadRecordSnapshots(ids: string[]) {
  const [{ db }, { studioInterview }, { inArray }] = await Promise.all([
    import("../lib/server/db"),
    import("@app/db-schema/schema"),
    import("drizzle-orm"),
  ]);
  const rows = await db
    .select({
      candidateName: studioInterview.candidateName,
      createdAt: studioInterview.createdAt,
      createdBy: studioInterview.createdBy,
      id: studioInterview.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      resumeContentHash: studioInterview.resumeContentHash,
      resumeFileName: studioInterview.resumeFileName,
      resumeParseError: studioInterview.resumeParseError,
      resumeParseStatus: studioInterview.resumeParseStatus,
      resumeParsedAt: studioInterview.resumeParsedAt,
      resumeProfile: studioInterview.resumeProfile,
      resumeReviewError: studioInterview.resumeReviewError,
      resumeReviewGeneratedAt: studioInterview.resumeReviewGeneratedAt,
      resumeReviewStatus: studioInterview.resumeReviewStatus,
      resumeStorageKey: studioInterview.resumeStorageKey,
      resumeText: studioInterview.resumeText,
      structuredCompositeScore: studioInterview.structuredCompositeScore,
      structuredGateStatus: studioInterview.structuredGateStatus,
      structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
      structuredScoreGrade: studioInterview.structuredScoreGrade,
    })
    .from(studioInterview)
    .where(inArray(studioInterview.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id) ?? null);
}

async function loadRowsByIds<T>(
  ids: string[],
  loadRecentRows: (
    limit: number,
    asOf?: string,
    date?: string,
    jobId?: string,
    resumeId?: string,
  ) => Promise<T[]>,
) {
  const rows = await Promise.all(
    ids.map((id) => loadRecentRows(1, undefined, undefined, undefined, id)),
  );
  return rows.map(([row], index) => {
    if (!row) {
      throw new Error(`重载目标失败：${ids[index]}`);
    }
    return row;
  });
}

// oxlint-disable-next-line complexity -- one-shot orchestration keeps preflight, execution, and report finalization in one auditable flow.
async function run(options: Options): Promise<void> {
  loadStandaloneEnv();
  process.env.ALIBABA_FAST_MODEL = TARGET_MODEL;
  process.env.ALIBABA_STRUCTURED_MODEL = TARGET_MODEL;
  process.env.MASTRA_FAST_MODEL = TARGET_MODEL;
  process.env.MASTRA_STRUCTURED_MODEL = TARGET_MODEL;
  process.env.RESUME_PARSE_LOG_STEPS = "1";

  const startedAt = new Date();
  const runtimeLogs: RuntimeLog[] = [];
  const restoreConsole = captureConsole(runtimeLogs);
  const report: ExecutionReport = {
    concurrency: TARGET_CONCURRENCY,
    evaluation: null,
    fatalError: null,
    final: [],
    fingerprint: null,
    finishedAt: null,
    mode: getReportMode(options),
    model: TARGET_MODEL,
    parse: null,
    preflightErrors: [],
    preflightWarnings: [],
    runtimeLogs: [],
    startedAt: startedAt.toISOString(),
    summary: null,
    targets: [],
    workspace: { id: WORKSPACE_ID, name: WORKSPACE_NAME },
  };
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : defaultOutputPath(startedAt);

  try {
    const [
      { closeDatabase, db },
      { jobEvaluationBlueprintSchema },
      { jobDescriptionStructuredConfigSchema },
      { member, organization },
      { asc, eq },
      backfill,
    ] = await Promise.all([
      import("../lib/server/db"),
      import("@app/db-schema/job-description-evaluation"),
      import("@app/db-schema/job-description-structured-config"),
      import("@app/db-schema/schema"),
      import("drizzle-orm"),
      import("./backfill-recent-resume-evaluations"),
    ]);
    const [workspace, fallbackMember] = await Promise.all([
      db
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(eq(organization.id, WORKSPACE_ID))
        .limit(1),
      db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, WORKSPACE_ID))
        .orderBy(asc(member.createdAt))
        .limit(1),
    ]);
    if (workspace[0]?.name !== WORKSPACE_NAME) {
      throw new Error(`目标工作区校验失败：${WORKSPACE_ID}/${WORKSPACE_NAME}`);
    }
    if (!fallbackMember[0]) {
      throw new Error("目标工作区没有可用于重跑归因的成员。 ");
    }

    const loadedTargets = await backfill.loadRecentRows(
      options.date ? MAX_DATE_TARGET_COUNT : DEFAULT_TARGET_COUNT,
      undefined,
      options.date ?? undefined,
    );
    const excludedIds = new Set(options.excludeResumeIds);
    const targets = loadedTargets.filter((target) => !excludedIds.has(target.id));
    if (!options.date && targets.length !== DEFAULT_TARGET_COUNT) {
      throw new Error(`预期选中 ${DEFAULT_TARGET_COUNT} 条，实际 ${targets.length} 条。`);
    }
    if (targets.length === 0) {
      throw new Error("没有符合条件的目标记录。 ");
    }
    const fingerprint = buildTargetFingerprint(targets);
    const ids = targets.map((target) => target.id);
    const before = await loadRecordSnapshots(ids);
    const executionPlan = buildRerunExecutionPlan(options.retryFailedEvaluations, before);
    const preflightWarnings = targets.flatMap((target) =>
      target.jobDescriptionId
        ? []
        : [
            {
              id: target.id,
              name: target.candidateName,
              warning: "未绑定岗位；解析后将使用当前生产自动匹配流程绑定岗位再评分",
            },
          ],
    );
    const preflightErrors = targets.flatMap(
      // oxlint-disable-next-line complexity -- each guard reports a distinct actionable preflight failure.
      (target, index) => {
        const snapshot = before[index];
        const errors: string[] = [];
        if (
          target.jobDescriptionId &&
          (target.evaluationMode !== "structured" || target.lifecycleStatus !== "published")
        ) {
          errors.push("岗位不是已发布的结构化评分模式");
        }
        if (
          target.jobDescriptionId &&
          (!target.evaluationBlueprintHash ||
            !jobEvaluationBlueprintSchema.safeParse(target.evaluationBlueprint).success)
        ) {
          errors.push("岗位评分蓝图无效");
        }
        if (
          target.jobDescriptionId &&
          (!jobDescriptionStructuredConfigSchema.safeParse(target.structuredConfig).success ||
            !target.deductionRuleSetVersion)
        ) {
          errors.push("岗位结构化配置无效");
        }
        if (!(options.retryFailedEvaluations || snapshot?.resumeStorageKey)) {
          errors.push("缺少 PDF 存储路径");
        }
        if (
          !options.retryFailedEvaluations &&
          !snapshot?.resumeFileName?.toLowerCase().endsWith(".pdf")
        ) {
          errors.push("源文件不是 PDF");
        }
        if (
          !options.retryFailedEvaluations &&
          ["queued", "processing"].includes(snapshot?.resumeParseStatus ?? "")
        ) {
          errors.push("解析任务正在处理中");
        }
        if (["queued", "processing"].includes(snapshot?.resumeReviewStatus ?? "")) {
          errors.push("评分任务正在处理中");
        }
        return errors.map((error) => ({ error, id: target.id, name: target.candidateName }));
      },
    );
    report.fingerprint = fingerprint;
    report.preflightErrors = preflightErrors;
    report.preflightWarnings = preflightWarnings;
    report.targets = targets.map((target, index) => ({
      before: before[index],
      evaluationInput: target,
    }));
    console.log(
      JSON.stringify(
        {
          event: "preflight",
          fingerprint,
          preflightErrors,
          preflightWarnings,
          targets: targets.map(({ candidateName, createdAt, id, jobDescriptionName }) => ({
            candidateName,
            createdAt,
            id,
            jobDescriptionName,
          })),
        },
        null,
        2,
      ),
    );
    if (preflightErrors.length > 0) {
      throw new Error(`预检发现 ${preflightErrors.length} 个问题，未执行写入。`);
    }
    if (!options.apply) {
      return;
    }
    if (options.expectedFingerprint !== fingerprint) {
      throw new Error(`目标指纹已变化：期望 ${options.expectedFingerprint}，实际 ${fingerprint}`);
    }

    const parseStartedAt = Date.now();
    const parseResults = executionPlan.every((item) => !item.reparse)
      ? before.map((snapshot) =>
          snapshot?.resumeParseStatus === "ready"
            ? { durationMs: 0, reason: "existing_parse_reused", status: "ready" as const }
            : { durationMs: 0, reason: "parse_not_ready", status: "failed" as const },
        )
      : await (async () => {
          const [{ claimForceResumeReparse }, processorModule] = await Promise.all([
            import("../server/routes/studio/routes/resume-upload-batches/dao/retry"),
            import("../server/routes/studio/routes/resume-upload-batches/utils/processor"),
          ]);
          const processor = processorModule.createResumeUploadBatchProcessor({
            ...processorModule.defaultResumeUploadBatchProcessorDependencies,
            enqueueResumePoolReviewGenerationBestEffort: () => Promise.resolve(true),
            enqueueResumeReviewGenerationForRecordBestEffort: () =>
              Promise.resolve({ status: "already_current" }),
            enqueueResumeSemanticIndexJobBestEffort: () => Promise.resolve(true),
            resolveCandidateQuestionGenerationEnabled: () => false,
          });
          const limit = pLimit(TARGET_CONCURRENCY);
          return Promise.all(
            targets.map((target) =>
              limit(() =>
                logContext.run({ phase: "parse", resumeId: target.id }, async () => {
                  const itemStartedAt = Date.now();
                  try {
                    const claim = await claimForceResumeReparse({
                      organizationId: WORKSPACE_ID,
                      requestedBy: fallbackMember[0].userId,
                      resumeRecordId: target.id,
                    });
                    if (claim.status !== "claimed") {
                      throw new Error(`强制重解析 claim 失败：${claim.status}`);
                    }
                    const output = await processor.processBatchItem(claim.job.itemId, {
                      bypassCache: true,
                    });
                    if (output?.item?.status !== "succeeded") {
                      throw new Error(
                        `PDF 解析未成功：${output?.item?.errorMessage ?? output?.item?.status ?? "无结果"}`,
                      );
                    }
                    return {
                      durationMs: Date.now() - itemStartedAt,
                      output,
                      status: "ready" as const,
                    };
                  } catch (error) {
                    return {
                      durationMs: Date.now() - itemStartedAt,
                      error: error instanceof Error ? error.message : String(error),
                      status: "failed" as const,
                    };
                  }
                }),
              ),
            ),
          );
        })();
    report.parse = { results: parseResults, wallClockDurationMs: Date.now() - parseStartedAt };

    const refreshed = await loadRowsByIds(ids, backfill.loadRecentRows);
    const [reviewQueue, reviewWorker] = await Promise.all([
      import("../server/routes/studio/routes/resumes/utils/review-queue"),
      import("../server/routes/studio/routes/resumes/utils/review-worker"),
    ]);
    const evaluationStartedAt = Date.now();
    const evaluationLimit = pLimit(TARGET_CONCURRENCY);
    const evaluationResults = await Promise.all(
      refreshed.map((target, index) =>
        evaluationLimit(() =>
          logContext.run({ phase: "evaluation", resumeId: target.id }, async () => {
            if (parseResults[index].status !== "ready") {
              return { reason: "parse_failed", status: "skipped" as const };
            }
            if (options.retryFailedEvaluations && !executionPlan[index].evaluate) {
              return { reason: "evaluation_already_ready", status: "skipped" as const };
            }
            const itemStartedAt = Date.now();
            try {
              const evaluationJob = {
                autoMatchJobDescription: !target.jobDescriptionId,
                force: true,
                jobDescriptionId: target.jobDescriptionId,
                organizationId: WORKSPACE_ID,
                resumeRecordId: target.id,
                source: "resume_upload" as const,
              };
              const scheduling = await reviewQueue.scheduleResumeEvaluationForRecord(
                evaluationJob,
                {
                  ...reviewQueue.defaultResumeEvaluationSchedulingDependencies,
                  isQueueConfigured: () => false,
                },
              );
              if (scheduling.status !== "fallback_sync") {
                throw new Error(
                  `评分调度失败：${scheduling.status === "failed" ? scheduling.errorMessage : scheduling.status}`,
                );
              }
              const output = await reviewWorker.processResumeReviewGenerationJob({
                ...evaluationJob,
                runId: scheduling.runId,
              });
              return {
                durationMs: Date.now() - itemStartedAt,
                output,
                scheduling,
                status: "ready" as const,
              };
            } catch (error) {
              return {
                durationMs: Date.now() - itemStartedAt,
                error: error instanceof Error ? error.message : String(error),
                status: "failed" as const,
              };
            }
          }),
        ),
      ),
    );
    report.evaluation = {
      inputs: refreshed,
      results: evaluationResults,
      wallClockDurationMs: Date.now() - evaluationStartedAt,
    };
    const final = await loadRecordSnapshots(ids);
    report.final = final;
    const failed = ids.filter(
      (_, index) => !isSuccessfulRerunOutcome(parseResults[index].status, final[index]),
    ).length;
    report.summary = {
      failed,
      succeeded: targets.length - failed,
      totalWallClockDurationMs: Date.now() - startedAt.getTime(),
    };
    if (failed > 0) {
      process.exitCode = 1;
    }
    await closeDatabase();
  } catch (error) {
    report.fatalError = serializeLogValue(error);
    process.exitCode = 1;
    try {
      const { closeDatabase } = await import("../lib/server/db");
      await closeDatabase();
    } catch {
      // Database may not have initialized.
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    report.runtimeLogs = runtimeLogs;
    restoreConsole();
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ event: "report", outputPath, summary: report.summary }));
  }
}

async function main(): Promise<void> {
  await run(parseRerunLatestWorkspaceResumesOptions(process.argv.slice(2)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
