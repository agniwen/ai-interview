import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { loadStandaloneEnv } from "../standalone/env";

const TARGET_WORKSPACE_ID = "org_default";
const TARGET_WORKSPACE_NAME = "极光/幻游";

type RecoveryMode = "direct-pool" | "preview-all" | "preview-pool" | "queue-all" | "queue-pool";

interface RecoveryOptions {
  date: string;
  mode: RecoveryMode;
}

interface DirectRecoveryJob {
  itemId: string;
  target: { id: string; kind: "pool" | "studio" };
}

interface DirectRecoveryFinalRow {
  candidateName: string;
  id: string;
  parseError: string | null;
  parsedAt: Date | null;
  parseStatus: string;
}

interface DirectRecoveryDependencies {
  loadFinalRows: (targetIds: string[]) => Promise<DirectRecoveryFinalRow[]>;
  now?: () => number;
  processBatchItem: (
    itemId: string,
    options: { bypassCache: boolean },
  ) => Promise<{ item?: { errorMessage?: string | null; status?: string } | null } | null>;
}

function chinaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(now);
}

export function parseRecoveryOptions(argv: string[], defaultDate = chinaToday()): RecoveryOptions {
  let apply = false;
  let date = defaultDate;
  let direct = false;
  let poolOnly = false;
  for (const argument of argv) {
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--direct") {
      direct = true;
    } else if (argument === "--pool-only") {
      poolOnly = true;
    } else if (argument.startsWith("--date=")) {
      date = argument.slice("--date=".length);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("--date 必须使用 YYYY-MM-DD 格式。");
  }
  if (direct && !apply) {
    throw new Error("--direct 必须与 --apply 一起使用。");
  }
  if (direct && !poolOnly) {
    throw new Error("--direct 当前必须与 --pool-only 一起使用。");
  }
  let mode: RecoveryMode;
  if (direct) {
    mode = "direct-pool";
  } else if (apply) {
    mode = poolOnly ? "queue-pool" : "queue-all";
  } else {
    mode = poolOnly ? "preview-pool" : "preview-all";
  }
  return { date, mode };
}

export async function runDirectRecoveryJobs(
  claimedJobs: DirectRecoveryJob[],
  dependencies: DirectRecoveryDependencies,
) {
  const now = dependencies.now ?? Date.now;
  const results = await Promise.all(
    claimedJobs.map(async ({ itemId, target }) => {
      const startedAt = now();
      try {
        const output = await dependencies.processBatchItem(itemId, { bypassCache: true });
        return {
          durationMs: now() - startedAt,
          error: output?.item?.errorMessage ?? null,
          id: target.id,
          itemId,
          kind: target.kind,
          status: output?.item?.status ?? "missing",
        };
      } catch (error) {
        return {
          durationMs: now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
          id: target.id,
          itemId,
          kind: target.kind,
          status: "failed",
        };
      }
    }),
  );
  const targetIds = claimedJobs.map(({ target }) => target.id);
  const finalRows = await dependencies.loadFinalRows(targetIds);
  const finalIds = new Set(finalRows.map((row) => row.id));
  const missingIds = targetIds.filter((id) => !finalIds.has(id));
  const failed = missingIds.length + finalRows.filter((row) => row.parseStatus !== "ready").length;
  return {
    finalRows,
    missingIds,
    results,
    summary: {
      failed,
      succeeded: finalRows.filter((row) => row.parseStatus === "ready").length,
      total: claimedJobs.length,
    },
  };
}

function chinaDateWindow(date: string) {
  const from = new Date(`${date}T00:00:00+08:00`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

async function main(options: RecoveryOptions) {
  loadStandaloneEnv();

  const [
    { closeDatabase, db },
    {
      member,
      organization,
      resumePoolItem,
      resumeUploadBatch,
      resumeUploadBatchItem,
      studioInterview,
    },
    { closeResumeParseQueue, enqueueResumeParseJobs },
    { closeResumeReviewGenerationQueue },
    { closeResumeSemanticIndexQueue },
    { rollbackFailedResumeParseRetry },
  ] = await Promise.all([
    import("@server/lib/server/db/index"),
    import("@app/db-schema/schema"),
    import("@app/resume-parse-queue/resume-parse"),
    import("@app/resume-parse-queue/resume-review-generation"),
    import("@app/resume-parse-queue/resume-semantic-index"),
    import("../server/routes/studio/routes/resume-upload-batches/dao/retry"),
  ]);

  const { from, to } = chinaDateWindow(options.date);
  const apply = options.mode === "direct-pool" || options.mode.startsWith("queue-");
  const direct = options.mode === "direct-pool";
  const poolOnly = options.mode.endsWith("-pool");

  try {
    const [workspace] = await db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(eq(organization.id, TARGET_WORKSPACE_ID))
      .limit(1);
    if (!workspace || workspace.name !== TARGET_WORKSPACE_NAME) {
      throw new Error("Target workspace assertion failed.");
    }

    const [fallbackMember] = await db
      .select({ userId: member.userId })
      .from(member)
      .where(eq(member.organizationId, TARGET_WORKSPACE_ID))
      .orderBy(asc(member.createdAt))
      .limit(1);
    if (!fallbackMember) {
      throw new Error("Target workspace has no member for recovery attribution.");
    }

    const [studioRows, poolRows] = await Promise.all([
      db
        .select({
          candidateName: studioInterview.candidateName,
          contentHash: studioInterview.resumeContentHash,
          createdAt: studioInterview.createdAt,
          createdBy: studioInterview.createdBy,
          fileName: studioInterview.resumeFileName,
          id: studioInterview.id,
          jobDescriptionId: studioInterview.jobDescriptionId,
          parseError: studioInterview.resumeParseError,
          storageKey: studioInterview.resumeStorageKey,
        })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
            gte(studioInterview.updatedAt, from),
            lt(studioInterview.updatedAt, to),
            eq(studioInterview.resumeParseStatus, "failed"),
          ),
        )
        .orderBy(asc(studioInterview.createdAt)),
      db
        .select({
          candidateName: resumePoolItem.candidateName,
          contentHash: resumePoolItem.resumeContentHash,
          createdAt: resumePoolItem.createdAt,
          createdBy: resumePoolItem.createdBy,
          fileName: resumePoolItem.resumeFileName,
          id: resumePoolItem.id,
          jobDescriptionId: resumePoolItem.jobDescriptionId,
          parseError: resumePoolItem.resumeParseError,
          scope: resumePoolItem.scope,
          storageKey: resumePoolItem.resumeStorageKey,
        })
        .from(resumePoolItem)
        .where(
          and(
            eq(resumePoolItem.organizationId, TARGET_WORKSPACE_ID),
            gte(resumePoolItem.updatedAt, from),
            lt(resumePoolItem.updatedAt, to),
            eq(resumePoolItem.resumeParseStatus, "failed"),
          ),
        )
        .orderBy(asc(resumePoolItem.createdAt)),
    ]);

    const targets = [
      ...(poolOnly
        ? []
        : studioRows.map((row) => ({ ...row, kind: "studio" as const, scope: null }))),
      ...poolRows.map((row) => ({ ...row, kind: "pool" as const })),
    ];

    console.log(
      JSON.stringify(
        {
          apply,
          date: options.date,
          direct,
          mode: options.mode,
          pool: poolRows.length,
          studio: studioRows.length,
          targetIds: targets.map((target) => target.id),
          targets: targets.map((target) => ({
            candidateName: target.candidateName,
            createdAt: target.createdAt,
            fileName: target.fileName,
            id: target.id,
            kind: target.kind,
            parseError: target.parseError,
            storageAvailable: Boolean(target.storageKey),
          })),
          total: targets.length,
          workspace: `${TARGET_WORKSPACE_ID}/${TARGET_WORKSPACE_NAME}`,
        },
        null,
        2,
      ),
    );

    if (!apply) {
      return;
    }

    const claimedJobs: {
      itemId: string;
      target: (typeof targets)[number];
    }[] = [];
    for (const target of targets) {
      const claim = await db.transaction(async (tx) => {
        const targetRows =
          target.kind === "studio"
            ? await tx
                .select({ status: studioInterview.resumeParseStatus })
                .from(studioInterview)
                .where(
                  and(
                    eq(studioInterview.id, target.id),
                    eq(studioInterview.organizationId, TARGET_WORKSPACE_ID),
                  ),
                )
                .limit(1)
                .for("update")
            : await tx
                .select({ status: resumePoolItem.resumeParseStatus })
                .from(resumePoolItem)
                .where(
                  and(
                    eq(resumePoolItem.id, target.id),
                    eq(resumePoolItem.organizationId, TARGET_WORKSPACE_ID),
                  ),
                )
                .limit(1)
                .for("update");

        if (targetRows[0]?.status !== "failed" || !target.storageKey) {
          return null;
        }

        const now = new Date();
        const batchId = crypto.randomUUID();
        const itemId = crypto.randomUUID();
        const userId = target.createdBy ?? fallbackMember.userId;
        await tx.insert(resumeUploadBatch).values({
          createdAt: now,
          createdBy: userId,
          dedupPolicy: "create",
          id: batchId,
          jdMode: target.jobDescriptionId ? "bind" : "none",
          jobDescriptionId: target.jobDescriptionId,
          organizationId: TARGET_WORKSPACE_ID,
          resumePoolScope: target.scope,
          status: "pending",
          target: target.kind === "studio" ? "resume_library" : "resume_pool",
          totalCount: 1,
          updatedAt: now,
        });
        await tx.insert(resumeUploadBatchItem).values({
          batchId,
          contentHash: target.contentHash,
          fileSize: 0,
          id: itemId,
          orderIndex: 0,
          organizationId: TARGET_WORKSPACE_ID,
          originalFileName: target.fileName ?? "resume.pdf",
          poolItemId: target.kind === "pool" ? target.id : null,
          queuedAt: now,
          resumeRecordId: target.kind === "studio" ? target.id : null,
          status: "pending",
          storageKey: target.storageKey,
        });

        await (target.kind === "studio"
          ? tx
              .update(studioInterview)
              .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
              .where(eq(studioInterview.id, target.id))
          : tx
              .update(resumePoolItem)
              .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: now })
              .where(eq(resumePoolItem.id, target.id)));

        return {
          errorMessage: target.parseError ?? "简历解析失败。",
          job: { batchId, itemId, organizationId: TARGET_WORKSPACE_ID, userId },
        };
      });

      if (!claim) {
        console.log(JSON.stringify({ id: target.id, status: "skipped" }));
        continue;
      }

      if (direct) {
        claimedJobs.push({ itemId: claim.job.itemId, target });
        console.log(JSON.stringify({ id: target.id, itemId: claim.job.itemId, status: "claimed" }));
        continue;
      }

      try {
        await enqueueResumeParseJobs([claim.job]);
        console.log(JSON.stringify({ id: target.id, itemId: claim.job.itemId, status: "queued" }));
      } catch (error) {
        await rollbackFailedResumeParseRetry({
          errorMessage: claim.errorMessage,
          job: claim.job,
          target:
            target.kind === "studio"
              ? { organizationId: TARGET_WORKSPACE_ID, resumeRecordId: target.id }
              : { organizationId: TARGET_WORKSPACE_ID, poolItemId: target.id },
        });
        throw error;
      }
    }

    if (direct && claimedJobs.length > 0) {
      const processorModule =
        await import("../server/routes/studio/routes/resume-upload-batches/utils/processor");
      const processor = processorModule.createResumeUploadBatchProcessor(
        processorModule.defaultResumeUploadBatchProcessorDependencies,
      );
      const directResult = await runDirectRecoveryJobs(claimedJobs, {
        loadFinalRows: (targetIds) =>
          db
            .select({
              candidateName: resumePoolItem.candidateName,
              id: resumePoolItem.id,
              parseError: resumePoolItem.resumeParseError,
              parseStatus: resumePoolItem.resumeParseStatus,
              parsedAt: resumePoolItem.resumeParsedAt,
            })
            .from(resumePoolItem)
            .where(
              and(
                eq(resumePoolItem.organizationId, TARGET_WORKSPACE_ID),
                inArray(resumePoolItem.id, targetIds),
              ),
            ),
        processBatchItem: processor.processBatchItem,
      });
      console.log(
        JSON.stringify(
          {
            event: "direct-recovery-completed",
            ...directResult,
          },
          null,
          2,
        ),
      );
      if (directResult.summary.failed > 0) {
        process.exitCode = 1;
      }
    }
  } finally {
    await Promise.all([
      closeDatabase(),
      closeResumeParseQueue(),
      closeResumeReviewGenerationQueue(),
      closeResumeSemanticIndexQueue(),
    ]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(parseRecoveryOptions(process.argv.slice(2)));
}
