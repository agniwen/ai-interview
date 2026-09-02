import "../standalone/preload";

import { createHash } from "node:crypto";
import {
  createDefaultJobDescriptionStructuredConfig,
  jobDescriptionStructuredConfigSchema,
  parseStoredJobDescriptionStructuredConfig,
} from "@app/db-schema/job-description-structured-config";
import type { JobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";
import { jobEvaluationBlueprintSchema } from "@app/db-schema/job-description-evaluation";
import type { JsonValue } from "@app/db-schema/json";
import { z } from "zod";

export const TARGET_WORKSPACE_ID = "org_default";
export const TARGET_WORKSPACE_NAME = "极光/幻游";
export const DEFAULT_CONCURRENCY = 10;

const HARD_GATE_KEYS = [
  "education",
  "languageAbility",
  "other",
  "requiredCertificates",
  "requiredSkills",
  "workExperience",
  "workLocation",
] as const;

const quoteSchema = z.string().trim().min(1).max(500);
export const jobEvaluationConfigAnalysisSchema = z
  .object({
    exclusionConditions: z.array(quoteSchema).max(20),
    hardGates: z.object({
      education: z.array(quoteSchema).max(20),
      languageAbility: z.array(quoteSchema).max(20),
      other: z.array(quoteSchema).max(20),
      requiredCertificates: z.array(quoteSchema).max(20),
      requiredSkills: z.array(quoteSchema).max(20),
      workExperience: z.array(quoteSchema).max(20),
      workLocation: z.array(quoteSchema).max(20),
    }),
    priorityConditions: z.array(quoteSchema).max(20),
  })
  .strict();

export type JobEvaluationConfigAnalysis = z.infer<typeof jobEvaluationConfigAnalysisSchema>;

interface BackfillJobRow {
  createdBy: string | null;
  evaluationBlueprint: JsonValue | null;
  evaluationBlueprintHash: string | null;
  evaluationMode: "legacy" | "qualitative" | "structured";
  id: string;
  lifecycleStatus: "draft" | "published";
  name: string;
  prompt: string;
  structuredConfig: JsonValue;
}

export interface BackfillOptions {
  apply: boolean;
  concurrency: number;
  jobId?: string;
  limit?: number;
  refresh: boolean;
}

function normalizeSourceText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replaceAll(/\s+/g, "");
}

function uniqueQuotes(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeSourceText(value);
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

export function validateAnalysisQuotes(
  analysis: JobEvaluationConfigAnalysis,
  jobDescription: string,
): void {
  const normalizedDescription = normalizeSourceText(jobDescription);
  const entries = [
    ...analysis.priorityConditions,
    ...analysis.exclusionConditions,
    ...HARD_GATE_KEYS.flatMap((key) => analysis.hardGates[key]),
  ];
  for (const quote of entries) {
    if (!normalizedDescription.includes(normalizeSourceText(quote))) {
      throw new Error(`AI 返回了无法在 JD 中定位的条件：${quote}`);
    }
  }
}

function conditionId(kind: "exclusion" | "priority", condition: string): string {
  const digest = createHash("sha256")
    .update(`${kind}:${normalizeSourceText(condition)}`)
    .digest("hex")
    .slice(0, 16);
  return `${kind}-${digest}`;
}

export function mergeAnalyzedConfig(
  base: JobDescriptionStructuredConfig,
  analysis: JobEvaluationConfigAnalysis,
): JobDescriptionStructuredConfig {
  const priorityConditions = uniqueQuotes(analysis.priorityConditions);
  const exclusionConditions = uniqueQuotes(analysis.exclusionConditions).filter(
    (condition) =>
      !priorityConditions.some(
        (priority) => normalizeSourceText(priority) === normalizeSourceText(condition),
      ),
  );
  return jobDescriptionStructuredConfigSchema.parse({
    ...base,
    exclusionConditions: exclusionConditions.map((condition) => ({
      condition,
      id: conditionId("exclusion", condition),
      points: 5,
    })),
    hardGates: Object.fromEntries(
      HARD_GATE_KEYS.map((key) => [key, uniqueQuotes(analysis.hardGates[key]).join("\n")]),
    ),
    priorityConditions: priorityConditions.map((condition) => ({
      condition,
      id: conditionId("priority", condition),
      points: 5,
    })),
  });
}

export function needsJobEvaluationBackfill(job: BackfillJobRow): boolean {
  if (job.lifecycleStatus !== "published") {
    return false;
  }
  if (job.evaluationMode === "legacy") {
    return true;
  }
  return !jobEvaluationBlueprintSchema.safeParse(job.evaluationBlueprint).success;
}

export function shouldReuseAnalyzedDraft(version: number): boolean {
  return version > 1;
}

export function parseBackfillOptions(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    apply: false,
    concurrency: DEFAULT_CONCURRENCY,
    refresh: false,
  };
  for (const argument of argv) {
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--refresh") {
      options.refresh = true;
      continue;
    }
    const [key, value] = argument.split("=", 2);
    if (key === "--concurrency" && value) {
      options.concurrency = Number.parseInt(value, 10);
    } else if (key === "--job-id" && value) {
      options.jobId = value;
    } else if (key === "--limit" && value) {
      options.limit = Number.parseInt(value, 10);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 10
  ) {
    throw new Error("--concurrency 必须是 1 到 10 之间的整数。");
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit 必须是正整数。");
  }
  if (options.refresh && !options.jobId) {
    throw new Error("--refresh 必须同时指定 --job-id，避免批量覆盖已发布岗位。");
  }
  return options;
}

export function buildAnalysisPrompt(jobDescription: string): string {
  return `你正在把旧版招聘岗位升级为可审计的结构化评分配置。请只依据下方 JD 提取条件。

规则：
1. 每一项必须逐字引用 JD 中可连续定位的原文，不得改写、概括或补充常识。
2. hardGates 只放 JD 明确表达为不可妥协、客观、可由简历直接核验且不满足就不能进入下一阶段的必备门槛；按学历、语言、其他、证书、技能、工作经验、工作地点分类。
3. 职责描述、软性能力、工作风格、抗压、协作、架构能力、项目推进、稳定交付、持续改进等不得进入 hardGates；不得因为它出现在“任职要求”章节就默认视为硬性门槛。
4. priorityConditions 只放 JD 明确表达的优先、加分、最好具备但非必需条件。
5. exclusionConditions 只放 JD 明确表达的不接受、淘汰或减分条件；不要自行添加跳槽、空窗等通用惩罚。
6. 保留 JD 原文中的“且 / 并 / 同时 / 或 / 任一”关系，不得把 OR 条件拆成多个必须同时满足的门槛。原文没有连接词时，由模型根据语义判断是全部必须，还是同类能力掌握任意一种即可；若属于任意一种即可，必须保留为同一个连续原文条件。
7. 同一原文不能重复出现在多个列表；没有依据的类别返回空数组。
8. 不要输出 ID、分值或解释，分值由服务端统一设为 5 分。

JD 原文：
<<<JD
${jobDescription}
JD`;
}

async function analyzeJobDescription(jobDescription: string): Promise<JobEvaluationConfigAnalysis> {
  const { generateStructuredWithMastraAgent, jobEvaluationBlueprintAgent } =
    await import("@app/ai-runtime/simple-generators");
  return generateStructuredWithMastraAgent({
    agent: jobEvaluationBlueprintAgent,
    fallbackToTextGeneration: true,
    maxOutputTokens: 5000,
    prompt: buildAnalysisPrompt(jobDescription),
    retryOnInvalid: true,
    retryOnTransient: true,
    schema: jobEvaluationConfigAnalysisSchema,
    temperature: 0,
    timeoutMs: 120_000,
    validate: (value) => validateAnalysisQuotes(value, jobDescription),
  });
}

function parseBaseConfig(value: JsonValue): JobDescriptionStructuredConfig {
  try {
    return parseStoredJobDescriptionStructuredConfig(value);
  } catch {
    return createDefaultJobDescriptionStructuredConfig();
  }
}

async function workspaceFingerprint(organizationId: string): Promise<string> {
  const [{ db }, { jobDescription }, { asc, ne }] = await Promise.all([
    import("../lib/server/db"),
    import("@app/db-schema/schema"),
    import("drizzle-orm"),
  ]);
  const rows = await db
    .select({
      blueprintHash: jobDescription.evaluationBlueprintHash,
      evaluationMode: jobDescription.evaluationMode,
      id: jobDescription.id,
      updatedAt: jobDescription.updatedAt,
    })
    .from(jobDescription)
    .where(ne(jobDescription.organizationId, organizationId))
    .orderBy(asc(jobDescription.id));
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function upgradeLegacyJob(job: BackfillJobRow, actorId: string) {
  const { jobEvaluationUpgradeApplication } =
    await import("../server/routes/studio/routes/job-descriptions/routes/upgrade/application/default-job-evaluation-upgrade");
  const key = {
    actorId: job.createdBy ?? actorId,
    jobDescriptionId: job.id,
    organizationId: TARGET_WORKSPACE_ID,
  };
  let draft = await jobEvaluationUpgradeApplication.createDraft(key);
  const structuredConfig = shouldReuseAnalyzedDraft(draft.version)
    ? draft.structuredConfig
    : mergeAnalyzedConfig(
        parseBaseConfig(job.structuredConfig),
        await analyzeJobDescription(job.prompt),
      );
  draft = await jobEvaluationUpgradeApplication.updateDraft({
    ...key,
    expectedVersion: draft.version,
    prompt: job.prompt,
    structuredConfig,
  });
  draft = await jobEvaluationUpgradeApplication.generatePreview({
    ...key,
    expectedVersion: draft.version,
  });
  if (!draft.blueprintPreviewHash) {
    throw new Error("升级预览没有生成蓝图哈希。");
  }
  return jobEvaluationUpgradeApplication.publish({
    ...key,
    confirmedBlueprintHash: draft.blueprintPreviewHash,
    expectedVersion: draft.version,
  });
}

async function repairStructuredJob(job: BackfillJobRow, actorId: string, refresh: boolean) {
  const [
    { db },
    { jobDescription, jobDescriptionEvaluationUpgradeAudit, studioInterview },
    { and, eq, inArray, sql },
    { compileDefaultJobEvaluationDraft },
    { computeJobEvaluationPayloadHash },
    { JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION },
    { STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION },
  ] = await Promise.all([
    import("../lib/server/db"),
    import("@app/db-schema/schema"),
    import("drizzle-orm"),
    import("../server/routes/studio/routes/job-descriptions/application/default-job-evaluation-lifecycle"),
    import("../lib/server/job-evaluation-hash"),
    import("@app/db-schema/job-description-evaluation"),
    import("@app/shared/structured-resume-scoring"),
  ]);
  const analysis = await analyzeJobDescription(job.prompt);
  const structuredConfig = mergeAnalyzedConfig(parseBaseConfig(job.structuredConfig), analysis);
  const blueprint = await compileDefaultJobEvaluationDraft({
    description: null,
    id: job.id,
    prompt: job.prompt,
    structuredConfig,
  });
  const blueprintHash = computeJobEvaluationPayloadHash(blueprint);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobDescription)
      .where(
        and(eq(jobDescription.id, job.id), eq(jobDescription.organizationId, TARGET_WORKSPACE_ID)),
      )
      .limit(1)
      .for("update");
    if (
      !current ||
      current.evaluationMode !== "structured" ||
      current.lifecycleStatus !== "published"
    ) {
      throw new Error("岗位状态已变化，拒绝覆盖。");
    }
    if (!refresh && jobEvaluationBlueprintSchema.safeParse(current.evaluationBlueprint).success) {
      return { invalidatedLegacyAttemptCount: 0, status: "already_current" as const };
    }
    const now = new Date();
    await tx.insert(jobDescriptionEvaluationUpgradeAudit).values({
      blueprint,
      blueprintHash,
      blueprintSchemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
      createdAt: now,
      deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
      draftVersion: 0,
      id: crypto.randomUUID(),
      jobDescriptionId: current.id,
      legacySnapshot: {
        backfillKind: refresh ? "structured_blueprint_refresh" : "structured_blueprint_rebuild",
        evaluationBlueprint: current.evaluationBlueprint,
        evaluationBlueprintHash: current.evaluationBlueprintHash,
        structuredConfig: current.structuredConfig,
      },
      organizationId: TARGET_WORKSPACE_ID,
      prompt: current.prompt,
      structuredConfig,
      upgradedBy: current.createdBy ?? actorId,
    });
    await tx
      .update(jobDescription)
      .set({
        deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
        evaluationBlueprint: blueprint,
        evaluationBlueprintHash: blueprintHash,
        evaluationBlueprintPreview: null,
        evaluationBlueprintPreviewGeneratedAt: null,
        evaluationBlueprintPreviewHash: null,
        evaluationBlueprintPreviewInputHash: null,
        evaluationBlueprintSchemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
        evaluationUpgradedAt: now,
        evaluationUpgradedBy: current.createdBy ?? actorId,
        structuredConfig,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobDescription.id, current.id),
          eq(jobDescription.organizationId, TARGET_WORKSPACE_ID),
        ),
      );
    const invalidated = await tx
      .update(studioInterview)
      .set({
        resumeEvaluationAttemptMode: null,
        resumeReviewError: null,
        resumeReviewQueuedAt: null,
        resumeReviewRunId: null,
        resumeReviewStatus: sql`case when ${studioInterview.resumeEvaluationArtifactMode} is not null then 'ready' else 'idle' end`,
        resumeScreeningError: null,
        resumeScreeningStatus: sql`case when ${studioInterview.resumeEvaluationArtifactMode} is not null then 'ready' else 'idle' end`,
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
          eq(studioInterview.jobDescriptionId, current.id),
          inArray(studioInterview.resumeReviewStatus, ["queued", "processing"]),
        ),
      )
      .returning({ id: studioInterview.id });
    return {
      invalidatedLegacyAttemptCount: invalidated.length,
      status: "published" as const,
    };
  });
}

function memberRolePriority(role: string): number {
  if (role === "owner") {
    return 0;
  }
  if (role === "admin") {
    return 1;
  }
  return 2;
}

async function loadScope() {
  const [{ db }, { jobDescription, member, organization }, { asc, eq }] = await Promise.all([
    import("../lib/server/db"),
    import("@app/db-schema/schema"),
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
  const memberships = await db
    .select({ role: member.role, userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, TARGET_WORKSPACE_ID));
  const fallbackActor = memberships.toSorted(
    (left, right) => memberRolePriority(left.role) - memberRolePriority(right.role),
  )[0]?.userId;
  if (!fallbackActor) {
    throw new Error("目标工作区没有可用于审计记录的成员。");
  }
  const jobs = await db
    .select({
      createdBy: jobDescription.createdBy,
      evaluationBlueprint: jobDescription.evaluationBlueprint,
      evaluationBlueprintHash: jobDescription.evaluationBlueprintHash,
      evaluationMode: jobDescription.evaluationMode,
      id: jobDescription.id,
      lifecycleStatus: jobDescription.lifecycleStatus,
      name: jobDescription.name,
      prompt: jobDescription.prompt,
      structuredConfig: jobDescription.structuredConfig,
    })
    .from(jobDescription)
    .where(eq(jobDescription.organizationId, TARGET_WORKSPACE_ID))
    .orderBy(asc(jobDescription.createdAt));
  return { fallbackActor, jobs };
}

async function loadJobById(id: string): Promise<BackfillJobRow> {
  const [{ db }, { jobDescription }, { and, eq }] = await Promise.all([
    import("../lib/server/db"),
    import("@app/db-schema/schema"),
    import("drizzle-orm"),
  ]);
  const [job] = await db
    .select({
      createdBy: jobDescription.createdBy,
      evaluationBlueprint: jobDescription.evaluationBlueprint,
      evaluationBlueprintHash: jobDescription.evaluationBlueprintHash,
      evaluationMode: jobDescription.evaluationMode,
      id: jobDescription.id,
      lifecycleStatus: jobDescription.lifecycleStatus,
      name: jobDescription.name,
      prompt: jobDescription.prompt,
      structuredConfig: jobDescription.structuredConfig,
    })
    .from(jobDescription)
    .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, TARGET_WORKSPACE_ID)))
    .limit(1);
  if (!job) {
    throw new Error("目标工作区内找不到岗位。");
  }
  return job;
}

async function run(options: BackfillOptions): Promise<void> {
  const [{ default: pLimit }, { default: pRetry }] = await Promise.all([
    import("p-limit"),
    import("p-retry"),
  ]);
  const beforeOtherWorkspaces = await workspaceFingerprint(TARGET_WORKSPACE_ID);
  const { fallbackActor, jobs } = await loadScope();
  let targets = options.refresh ? jobs : jobs.filter(needsJobEvaluationBackfill);
  if (options.jobId) {
    targets = targets.filter((job) => job.id === options.jobId);
  }
  if (options.limit !== undefined) {
    targets = targets.slice(0, options.limit);
  }
  const summary = {
    currentStructured: jobs.filter(
      (job) =>
        job.evaluationMode === "structured" &&
        jobEvaluationBlueprintSchema.safeParse(job.evaluationBlueprint).success,
    ).length,
    legacyTargets: targets.filter((job) => job.evaluationMode === "legacy").length,
    mode: options.apply ? "apply" : "dry-run",
    structuredRepairTargets: targets.filter((job) => job.evaluationMode === "structured").length,
    targetCount: targets.length,
    totalJobs: jobs.length,
    workspace: `${TARGET_WORKSPACE_ID}/${TARGET_WORKSPACE_NAME}`,
  };
  console.log(JSON.stringify({ event: "preflight", ...summary }));
  if (!options.apply) {
    for (const job of targets) {
      console.log(
        JSON.stringify({ event: "target", id: job.id, mode: job.evaluationMode, name: job.name }),
      );
    }
    return;
  }
  const limit = pLimit(options.concurrency);
  const failures: { error: string; id: string; name: string }[] = [];
  let completed = 0;
  let invalidatedAttempts = 0;
  await Promise.all(
    targets.map((job) =>
      limit(async () => {
        try {
          const result = await pRetry(
            async () => {
              const current = await loadJobById(job.id);
              if (!options.refresh && !needsJobEvaluationBackfill(current)) {
                return { invalidatedLegacyAttemptCount: 0, status: "already_current" as const };
              }
              return current.evaluationMode === "legacy"
                ? upgradeLegacyJob(current, fallbackActor)
                : repairStructuredJob(current, fallbackActor, options.refresh);
            },
            { retries: 2 },
          );
          invalidatedAttempts += result.invalidatedLegacyAttemptCount;
          completed += 1;
          console.log(
            JSON.stringify({
              completed,
              event: "published",
              id: job.id,
              name: job.name,
              total: targets.length,
            }),
          );
        } catch (error) {
          failures.push({
            error: error instanceof Error ? error.message : String(error),
            id: job.id,
            name: job.name,
          });
          console.error(JSON.stringify({ event: "failed", ...failures.at(-1) }));
        }
      }),
    ),
  );
  const afterOtherWorkspaces = await workspaceFingerprint(TARGET_WORKSPACE_ID);
  if (beforeOtherWorkspaces !== afterOtherWorkspaces) {
    throw new Error("非目标工作区岗位指纹发生变化，已停止并标记失败。");
  }
  console.log(
    JSON.stringify({
      completed,
      event: "summary",
      failures,
      invalidatedAttempts,
      targetCount: targets.length,
    }),
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  try {
    await run(parseBackfillOptions(process.argv.slice(2)));
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
