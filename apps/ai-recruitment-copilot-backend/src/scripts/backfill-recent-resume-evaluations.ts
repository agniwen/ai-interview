import "dotenv/config";

import { createHash } from "node:crypto";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import { computeResumeEvaluationInputHash } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-evaluation-input-hash";
import { deriveStructuredResumeSummaries } from "@arc/shared/structured-resume-scoring";
import { getMastraModelIdentifier, mastraModels } from "../server/agents/mastra/models";
import type { GeneratedResumeAssessment } from "../server/routes/studio/routes/resumes/utils/review-lifecycle";

export const TARGET_WORKSPACE_ID = "org_default";
export const TARGET_WORKSPACE_NAME = "极光/幻游";
export const DEFAULT_LIMIT = 500;
export const BATCH_SIZE = 12;
export const TARGET_TIME_ZONE = "Asia/Shanghai";
const TARGET_MODEL_ID = getMastraModelIdentifier(mastraModels.structuredModel);

const CAMPAIGN_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export interface BackfillRecentResumeOptions {
  apply: boolean;
  asOf?: string;
  campaign: string;
  concurrency: number;
  date?: string;
  jobId?: string;
  limit: number;
  resumeId?: string;
}

export interface RecentResumeRow {
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
  resumeParseStatus: string;
  resumeContentHash: string | null;
  resumeProfile: ResumeProfile | null;
  resumeReviewQueuedAt: Date | null;
  resumeReviewRunId: string | null;
  resumeReviewStatus: string;
  resumeText: string | null;
  structuredConfig: unknown;
  structuredResumeEvaluation: unknown;
}

export type ResumeTargetClassification =
  | { reason: "already_completed_campaign"; status: "skip" }
  | { reason: "busy"; status: "skip" }
  | { reason: "job_not_current"; status: "skip" }
  | { reason: "resume_not_ready"; status: "skip" }
  | { reason: "unbound"; status: "skip" }
  | { status: "eligible" };
type ResumeSkipReason = Extract<ResumeTargetClassification, { status: "skip" }>["reason"];

function defaultCampaign(): string {
  return `recent-resume-rescore-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
}

export function buildChinaDateWindow(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("--date 必须是 YYYY-MM-DD 格式的有效日期。");
  }
  const from = new Date(`${date}T00:00:00+08:00`);
  const normalized = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TARGET_TIME_ZONE,
    year: "numeric",
  }).format(from);
  if (Number.isNaN(from.getTime()) || normalized !== date) {
    throw new Error("--date 必须是 YYYY-MM-DD 格式的有效日期。");
  }
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

function applyArgument(options: BackfillRecentResumeOptions, argument: string): void {
  if (argument === "--apply") {
    options.apply = true;
    return;
  }
  const [key, value] = argument.split("=", 2);
  if (key === "--campaign" && value) {
    options.campaign = value;
  } else if (key === "--concurrency" && value) {
    options.concurrency = Number.parseInt(value, 10);
  } else if (key === "--as-of" && value) {
    options.asOf = value;
  } else if (key === "--date" && value) {
    options.date = value;
  } else if (key === "--job-id" && value) {
    options.jobId = value;
  } else if (key === "--resume-id" && value) {
    options.resumeId = value;
  } else if (key === "--limit" && value) {
    options.limit = Number.parseInt(value, 10);
  } else {
    throw new Error(`未知参数：${argument}`);
  }
}

export function parseBackfillRecentResumeOptions(argv: string[]): BackfillRecentResumeOptions {
  const options: BackfillRecentResumeOptions = {
    apply: false,
    campaign: defaultCampaign(),
    concurrency: BATCH_SIZE,
    limit: DEFAULT_LIMIT,
  };
  for (const argument of argv) {
    applyArgument(options, argument);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > DEFAULT_LIMIT) {
    throw new Error(`--limit 必须是 1 到 ${DEFAULT_LIMIT} 之间的整数。`);
  }
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 24
  ) {
    throw new Error("--concurrency 必须是 1 到 24 之间的整数。");
  }
  if (!CAMPAIGN_PATTERN.test(options.campaign)) {
    throw new Error("--campaign 只能包含 3 到 64 位小写字母、数字、下划线或连字符。");
  }
  if (options.asOf !== undefined && Number.isNaN(Date.parse(options.asOf))) {
    throw new Error("--as-of 必须是有效的 ISO 时间。");
  }
  if (options.date !== undefined) {
    buildChinaDateWindow(options.date);
  }
  if (options.asOf && options.date) {
    throw new Error("--as-of 和 --date 不能同时使用。");
  }
  return options;
}

function completedByCampaign(row: RecentResumeRow, campaign: string): boolean {
  if (!row.resumeProfile) {
    return false;
  }
  const parsed = structuredResumeEvaluationV1Schema.safeParse(row.structuredResumeEvaluation);
  return (
    parsed.success &&
    parsed.data.runId.startsWith(`${campaign}:`) &&
    parsed.data.blueprintHash === row.evaluationBlueprintHash &&
    parsed.data.engine.modelId === TARGET_MODEL_ID &&
    parsed.data.inputHash ===
      computeResumeEvaluationInputHash({
        resumeContentHash: row.resumeContentHash,
        resumeProfile: row.resumeProfile,
        resumeText: row.resumeText,
      })
  );
}

export function classifyRecentResumeTarget(
  row: RecentResumeRow,
  campaign: string,
): ResumeTargetClassification {
  if (!row.jobDescriptionId) {
    return { reason: "unbound", status: "skip" };
  }
  if (row.resumeParseStatus !== "ready" || !row.resumeProfile) {
    return { reason: "resume_not_ready", status: "skip" };
  }
  if (row.resumeReviewStatus === "queued" || row.resumeReviewStatus === "processing") {
    return { reason: "busy", status: "skip" };
  }
  if (
    row.evaluationMode !== "structured" ||
    row.lifecycleStatus !== "published" ||
    !row.evaluationBlueprintHash ||
    !jobEvaluationBlueprintSchema.safeParse(row.evaluationBlueprint).success ||
    !jobDescriptionStructuredConfigSchema.safeParse(row.structuredConfig).success ||
    !row.deductionRuleSetVersion
  ) {
    return { reason: "job_not_current", status: "skip" };
  }
  if (completedByCampaign(row, campaign)) {
    return { reason: "already_completed_campaign", status: "skip" };
  }
  return { status: "eligible" };
}

export function chunkResumeTargets<T>(targets: T[], batchSize = BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize 必须是正整数。");
  }
  const batches: T[][] = [];
  for (let offset = 0; offset < targets.length; offset += batchSize) {
    batches.push(targets.slice(offset, offset + batchSize));
  }
  return batches;
}

function targetFingerprint(rows: RecentResumeRow[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => ({
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          jobDescriptionId: row.jobDescriptionId,
        })),
      ),
    )
    .digest("hex");
}

export async function loadRecentRows(
  limit: number,
  asOf?: string,
  date?: string,
  jobId?: string,
  resumeId?: string,
): Promise<RecentResumeRow[]> {
  const [{ db }, { jobDescription, studioInterview }, { and, desc, eq, gte, lt, lte }] =
    await Promise.all([
      import("../lib/server/db"),
      import("@arc/db-schema/schema"),
      import("drizzle-orm"),
    ]);
  const dateWindow = date ? buildChinaDateWindow(date) : null;
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
      resumeReviewQueuedAt: studioInterview.resumeReviewQueuedAt,
      resumeReviewRunId: studioInterview.resumeReviewRunId,
      resumeReviewStatus: studioInterview.resumeReviewStatus,
      resumeText: studioInterview.resumeText,
      structuredConfig: jobDescription.structuredConfig,
      structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
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
        asOf ? lte(studioInterview.createdAt, new Date(asOf)) : undefined,
        dateWindow ? gte(studioInterview.createdAt, dateWindow.from) : undefined,
        dateWindow ? lt(studioInterview.createdAt, dateWindow.to) : undefined,
        jobId ? eq(studioInterview.jobDescriptionId, jobId) : undefined,
        resumeId ? eq(studioInterview.id, resumeId) : undefined,
      ),
    )
    .orderBy(desc(studioInterview.createdAt), desc(studioInterview.id))
    .limit(limit);
}

async function assertTargetWorkspace(): Promise<void> {
  const [{ db }, { organization }, { eq }] = await Promise.all([
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
}

async function claimTarget(row: RecentResumeRow, campaign: string) {
  const [{ db }, { jobDescription, studioInterview }, { and, eq }] = await Promise.all([
    import("../lib/server/db"),
    import("@arc/db-schema/schema"),
    import("drizzle-orm"),
  ]);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        jobDescriptionId: studioInterview.jobDescriptionId,
        resumeContentHash: studioInterview.resumeContentHash,
        resumeParseStatus: studioInterview.resumeParseStatus,
        resumeProfile: studioInterview.resumeProfile,
        resumeReviewStatus: studioInterview.resumeReviewStatus,
        resumeText: studioInterview.resumeText,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, row.id),
          eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !current?.resumeProfile ||
      current.resumeParseStatus !== "ready" ||
      !current.jobDescriptionId ||
      current.jobDescriptionId !== row.jobDescriptionId ||
      current.resumeReviewStatus === "queued" ||
      current.resumeReviewStatus === "processing"
    ) {
      return null;
    }
    const { jobDescriptionId } = current;
    const [job] = await tx
      .select({
        evaluationBlueprintHash: jobDescription.evaluationBlueprintHash,
        evaluationMode: jobDescription.evaluationMode,
        lifecycleStatus: jobDescription.lifecycleStatus,
      })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, jobDescriptionId),
          eq(jobDescription.organizationId, TARGET_WORKSPACE_ID),
        ),
      )
      .limit(1)
      .for("share");
    if (
      job?.evaluationMode !== "structured" ||
      job.lifecycleStatus !== "published" ||
      !job.evaluationBlueprintHash ||
      job.evaluationBlueprintHash !== row.evaluationBlueprintHash
    ) {
      return null;
    }
    const now = new Date();
    const runId = `${campaign}:${crypto.randomUUID()}`;
    await tx
      .update(studioInterview)
      .set({
        resumeEvaluationAttemptMode: "structured",
        resumeReviewError: null,
        resumeReviewQueuedAt: now,
        resumeReviewRunId: runId,
        resumeReviewStatus: "processing",
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.id, row.id),
          eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
          eq(studioInterview.jobDescriptionId, jobDescriptionId),
        ),
      );
    return {
      evaluationAsOf: now.toISOString().slice(0, 10),
      expectedBlueprintHash: job.evaluationBlueprintHash,
      jobDescriptionId,
      resumeContentHash: current.resumeContentHash,
      resumeInputHash: computeResumeEvaluationInputHash({
        resumeContentHash: current.resumeContentHash,
        resumeProfile: current.resumeProfile,
        resumeText: current.resumeText,
      }),
      resumeProfile: current.resumeProfile,
      resumeText: current.resumeText,
      runId,
    };
  });
}

async function commitAssessment(
  row: RecentResumeRow,
  claim: NonNullable<Awaited<ReturnType<typeof claimTarget>>>,
  assessment: GeneratedResumeAssessment,
): Promise<boolean> {
  if (assessment.mode !== "structured") {
    throw new Error("评估结果不是结构化新版本。");
  }
  const [{ db }, { jobDescription, studioInterview }, { and, eq }] = await Promise.all([
    import("../lib/server/db"),
    import("@arc/db-schema/schema"),
    import("drizzle-orm"),
  ]);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        jobDescriptionId: studioInterview.jobDescriptionId,
        resumeContentHash: studioInterview.resumeContentHash,
        resumeProfile: studioInterview.resumeProfile,
        resumeReviewRunId: studioInterview.resumeReviewRunId,
        resumeText: studioInterview.resumeText,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, row.id),
          eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !current?.resumeProfile ||
      current.jobDescriptionId !== claim.jobDescriptionId ||
      current.resumeReviewRunId !== claim.runId ||
      computeResumeEvaluationInputHash({
        resumeContentHash: current.resumeContentHash,
        resumeProfile: current.resumeProfile,
        resumeText: current.resumeText,
      }) !== claim.resumeInputHash
    ) {
      return false;
    }
    const evaluation = structuredResumeEvaluationV1Schema.parse(assessment.evaluation);
    const [job] = await tx
      .select({
        evaluationBlueprintHash: jobDescription.evaluationBlueprintHash,
        evaluationMode: jobDescription.evaluationMode,
        lifecycleStatus: jobDescription.lifecycleStatus,
      })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, claim.jobDescriptionId),
          eq(jobDescription.organizationId, TARGET_WORKSPACE_ID),
        ),
      )
      .limit(1)
      .for("share");
    if (
      job?.evaluationMode !== "structured" ||
      job.lifecycleStatus !== "published" ||
      job.evaluationBlueprintHash !== claim.expectedBlueprintHash ||
      evaluation.blueprintHash !== claim.expectedBlueprintHash ||
      evaluation.inputHash !== claim.resumeInputHash ||
      evaluation.jobId !== claim.jobDescriptionId ||
      evaluation.runId !== claim.runId
    ) {
      return false;
    }
    const summaries = deriveStructuredResumeSummaries(evaluation);
    const [updated] = await tx
      .update(studioInterview)
      .set({
        notes: null,
        resumeEvaluationArtifactMode: "structured",
        resumeEvaluationAttemptMode: "structured",
        resumeReview: null,
        resumeReviewError: null,
        resumeReviewGeneratedAt: new Date(),
        resumeReviewRunId: null,
        resumeReviewStatus: "ready",
        resumeScreeningError: null,
        resumeScreeningEvaluatedAt: null,
        resumeScreeningResult: null,
        resumeScreeningStatus: "idle",
        structuredCompositeScore: summaries.compositeScore,
        structuredGateSortRank: summaries.gateSortRank,
        structuredGateStatus: summaries.gateStatus,
        structuredResumeEvaluation: evaluation,
        structuredScoreGrade: summaries.grade,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioInterview.id, row.id),
          eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
          eq(studioInterview.jobDescriptionId, claim.jobDescriptionId),
          eq(studioInterview.resumeReviewRunId, claim.runId),
        ),
      )
      .returning({ id: studioInterview.id });
    return Boolean(updated);
  });
}

async function markFailed(
  row: RecentResumeRow,
  runId: string,
  errorMessage: string,
): Promise<void> {
  const [{ db }, { studioInterview }, { and, eq }] = await Promise.all([
    import("../lib/server/db"),
    import("@arc/db-schema/schema"),
    import("drizzle-orm"),
  ]);
  await db
    .update(studioInterview)
    .set({
      resumeReviewError: errorMessage.slice(0, 1000),
      resumeReviewStatus: "failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioInterview.id, row.id),
        eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
        eq(studioInterview.resumeReviewRunId, runId),
      ),
    );
}

async function processTarget(row: RecentResumeRow, campaign: string) {
  const startedAt = Date.now();
  const claim = await claimTarget(row, campaign);
  if (!claim) {
    return {
      reason: "claim_rejected" as const,
      status: "skipped" as const,
      totalDurationMs: Date.now() - startedAt,
    };
  }
  try {
    const [{ generateResumeAssessment }, { default: pRetry }] = await Promise.all([
      import("../server/routes/studio/routes/resumes/utils/review-generation"),
      import("p-retry"),
    ]);
    const aiStartedAt = Date.now();
    const assessment = await pRetry(
      () =>
        generateResumeAssessment({
          evaluationAsOf: claim.evaluationAsOf,
          jobDescriptionId: claim.jobDescriptionId,
          organizationId: TARGET_WORKSPACE_ID,
          resumeContentHash: claim.resumeContentHash,
          resumeInputHash: claim.resumeInputHash,
          resumeProfile: claim.resumeProfile,
          resumeText: claim.resumeText,
          runId: claim.runId,
        }),
      { minTimeout: 5000, retries: 1 },
    );
    const aiDurationMs = Date.now() - aiStartedAt;
    const commitStartedAt = Date.now();
    const committed = await commitAssessment(row, claim, assessment);
    const commitDurationMs = Date.now() - commitStartedAt;
    return committed
      ? {
          aiDurationMs,
          commitDurationMs,
          runId: claim.runId,
          status: "ready" as const,
          totalDurationMs: Date.now() - startedAt,
        }
      : {
          aiDurationMs,
          commitDurationMs,
          reason: "superseded" as const,
          status: "skipped" as const,
          totalDurationMs: Date.now() - startedAt,
        };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markFailed(row, claim.runId, errorMessage);
    return {
      error: errorMessage.slice(0, 1000),
      status: "failed" as const,
      totalDurationMs: Date.now() - startedAt,
    };
  }
}

function summarizeRows(rows: RecentResumeRow[], campaign: string) {
  const classified = rows.map((row) => ({
    classification: classifyRecentResumeTarget(row, campaign),
    row,
  }));
  const count = (reason: ResumeSkipReason) =>
    classified.filter(
      ({ classification }) => classification.status === "skip" && classification.reason === reason,
    ).length;
  return {
    alreadyCompletedCampaign: count("already_completed_campaign"),
    busy: count("busy"),
    eligible: classified.filter(({ classification }) => classification.status === "eligible"),
    jobNotCurrent: count("job_not_current"),
    resumeNotReady: count("resume_not_ready"),
    unbound: count("unbound"),
  };
}

function summarizeDurations(durations: number[]) {
  if (durations.length === 0) {
    return { average: 0, max: 0, min: 0, total: 0 };
  }
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return {
    average: Math.round(total / durations.length),
    max: Math.max(...durations),
    min: Math.min(...durations),
    total,
  };
}

async function run(options: BackfillRecentResumeOptions): Promise<void> {
  await assertTargetWorkspace();
  const rows = await loadRecentRows(
    options.limit,
    options.asOf,
    options.date,
    options.jobId,
    options.resumeId,
  );
  const summary = summarizeRows(rows, options.campaign);
  const unsupportedJobs = new Map<string, { count: number; id: string; name: string }>();
  for (const { classification, row } of rows.map((current) => ({
    classification: classifyRecentResumeTarget(current, options.campaign),
    row: current,
  }))) {
    if (classification.status !== "skip" || classification.reason !== "job_not_current") {
      continue;
    }
    const id = row.jobDescriptionId ?? "missing";
    const existing = unsupportedJobs.get(id) ?? {
      count: 0,
      id,
      name: row.jobDescriptionName ?? "岗位不存在",
    };
    existing.count += 1;
    unsupportedJobs.set(id, existing);
  }
  console.log(
    JSON.stringify({
      asOf: options.asOf ?? null,
      campaign: options.campaign,
      concurrency: options.concurrency,
      date: options.date ?? null,
      eligible: summary.eligible.length,
      event: "preflight",
      fingerprint: targetFingerprint(rows),
      jobId: options.jobId ?? null,
      limit: options.limit,
      mode: options.apply ? "apply" : "dry-run",
      resumeId: options.resumeId ?? null,
      selected: rows.length,
      skipped: {
        alreadyCompletedCampaign: summary.alreadyCompletedCampaign,
        busy: summary.busy,
        jobNotCurrent: summary.jobNotCurrent,
        resumeNotReady: summary.resumeNotReady,
        unbound: summary.unbound,
      },
      timeZone: options.date ? TARGET_TIME_ZONE : null,
      unsupportedJobs: [...unsupportedJobs.values()].toSorted(
        (left, right) => right.count - left.count,
      ),
      workspace: `${TARGET_WORKSPACE_ID}/${TARGET_WORKSPACE_NAME}`,
    }),
  );
  if (!options.apply) {
    return;
  }
  const failures: { error: string; id: string; name: string }[] = [];
  let completed = 0;
  let finished = 0;
  let runtimeSkipped = 0;
  const completedDurations: { aiDurationMs: number; totalDurationMs: number }[] = [];
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(options.concurrency);
  const progressWindows = Math.ceil(summary.eligible.length / options.concurrency);
  const wallStartedAt = Date.now();
  await Promise.all(
    summary.eligible.map(({ row }) =>
      limit(async () => {
        const result = await processTarget(row, options.campaign);
        finished += 1;
        if (result.status === "ready") {
          completed += 1;
          completedDurations.push({
            aiDurationMs: result.aiDurationMs,
            totalDurationMs: result.totalDurationMs,
          });
        } else if (result.status === "failed") {
          failures.push({ error: result.error, id: row.id, name: row.candidateName });
        } else {
          runtimeSkipped += 1;
        }
        console.log(
          JSON.stringify({
            candidate: row.candidateName,
            completed,
            event: result.status,
            finished,
            id: row.id,
            progressWindow: Math.ceil(finished / options.concurrency),
            progressWindows,
            result,
          }),
        );
        if (finished % options.concurrency === 0 || finished === summary.eligible.length) {
          console.log(
            JSON.stringify({
              completed,
              event: "progress",
              failed: failures.length,
              finished,
              progressWindow: Math.ceil(finished / options.concurrency),
              progressWindows,
              runtimeSkipped,
            }),
          );
        }
      }),
    ),
  );
  console.log(
    JSON.stringify({
      aiDurationMs: summarizeDurations(completedDurations.map(({ aiDurationMs }) => aiDurationMs)),
      campaign: options.campaign,
      completed,
      event: "summary",
      failed: failures.length,
      failures,
      runtimeSkipped,
      targetCount: summary.eligible.length,
      totalDurationMs: summarizeDurations(
        completedDurations.map(({ totalDurationMs }) => totalDurationMs),
      ),
      wallClockDurationMs: Date.now() - wallStartedAt,
    }),
  );
  if (failures.length > 0 || runtimeSkipped > 0) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  try {
    await run(parseBackfillRecentResumeOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    const { closeDatabase } = await import("../lib/server/db");
    await closeDatabase();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
