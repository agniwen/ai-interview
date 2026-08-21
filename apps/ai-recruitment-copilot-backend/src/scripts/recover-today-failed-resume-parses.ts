import path from "node:path";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { config as loadEnvFile } from "dotenv";

const TARGET_DATE = "2026-08-21";
const TARGET_WORKSPACE_ID = "org_default";
const TARGET_WORKSPACE_NAME = "极光/幻游";

function chinaDateWindow(date: string) {
  const from = new Date(`${date}T00:00:00+08:00`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

async function main() {
  loadEnvFile({
    path: path.resolve(import.meta.dirname, "../../../ai-recruitment-copilot/.env"),
    quiet: true,
  });

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
    { rollbackFailedResumeParseRetry },
  ] = await Promise.all([
    import("@arc/ai-recruitment-copilot-backend/lib/server/db"),
    import("@arc/db-schema/schema"),
    import("@arc/resume-parse-queue/resume-parse"),
    import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/retry"),
  ]);

  const apply = process.argv.includes("--apply");
  const { from, to } = chinaDateWindow(TARGET_DATE);

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
            gte(studioInterview.createdAt, from),
            lt(studioInterview.createdAt, to),
            eq(studioInterview.resumeParseStatus, "failed"),
          ),
        )
        .orderBy(asc(studioInterview.createdAt)),
      db
        .select({
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
            gte(resumePoolItem.createdAt, from),
            lt(resumePoolItem.createdAt, to),
            eq(resumePoolItem.resumeParseStatus, "failed"),
          ),
        )
        .orderBy(asc(resumePoolItem.createdAt)),
    ]);

    const targets = [
      ...studioRows.map((row) => ({ ...row, kind: "studio" as const, scope: null })),
      ...poolRows.map((row) => ({ ...row, kind: "pool" as const })),
    ];

    console.log(
      JSON.stringify(
        {
          apply,
          date: TARGET_DATE,
          pool: poolRows.length,
          studio: studioRows.length,
          targetIds: targets.map((target) => target.id),
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
  } finally {
    await Promise.all([closeDatabase(), closeResumeParseQueue()]);
  }
}

await main();
