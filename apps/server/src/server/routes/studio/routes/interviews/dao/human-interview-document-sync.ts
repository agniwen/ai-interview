import { and, asc, desc, eq, gt, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import type { Database } from "@app/database";
import {
  humanInterviewDocumentSync,
  interviewNotification,
  studioHumanInterviewEvaluationSnapshot,
  studioHumanInterviewRound,
  user,
} from "@app/db-schema/schema";
import type { HumanInterviewDocumentSyncJob } from "../application/sync-human-interview-document";
import { FEISHU_PROVIDER_IDS } from "../../../../../integrations/feishu/provider";
import { resolveFeishuDocxDocumentId } from "../../../../../integrations/feishu/feishu-docx";

const jobs = humanInterviewDocumentSync;
const LEASE_MS = 10 * 60_000;

export function createHumanInterviewDocumentSyncDao(db: Database) {
  const owned = (job: HumanInterviewDocumentSyncJob) =>
    and(
      eq(jobs.snapshotId, job.snapshotId),
      eq(jobs.leaseOwner, job.leaseOwner),
      eq(jobs.status, "syncing"),
    );
  return {
    async claim(): Promise<HumanInterviewDocumentSyncJob | "deferred" | null> {
      return await db.transaction(async (tx) => {
        const now = new Date();
        const [job] = await tx
          .select()
          .from(jobs)
          .where(and(ne(jobs.status, "synced"), lte(jobs.nextAttemptAt, now)))
          .orderBy(asc(jobs.nextAttemptAt), asc(jobs.snapshotId))
          .limit(1)
          .for("update", { skipLocked: true });
        if (!job) {
          return null;
        }
        const [context] = await tx
          .select({
            evaluation: studioHumanInterviewEvaluationSnapshot.evaluation,
            interviewRecordId: studioHumanInterviewRound.interviewRecordId,
            outcome: studioHumanInterviewEvaluationSnapshot.outcome,
            roundLabel: studioHumanInterviewRound.label,
            submittedAt: studioHumanInterviewEvaluationSnapshot.createdAt,
            submittedBy: user.name,
          })
          .from(studioHumanInterviewEvaluationSnapshot)
          .innerJoin(studioHumanInterviewRound, eq(studioHumanInterviewRound.id, job.roundId))
          .leftJoin(user, eq(user.id, studioHumanInterviewEvaluationSnapshot.createdBy))
          .where(
            and(
              eq(studioHumanInterviewEvaluationSnapshot.id, job.snapshotId),
              eq(studioHumanInterviewEvaluationSnapshot.source, "human_submitted"),
            ),
          )
          .limit(1);
        if (!context?.outcome) {
          throw new Error("同步任务缺少正式提交评价");
        }
        let target = {
          documentId: job.documentId,
          documentUrl: job.documentUrl,
          providerId: job.providerId,
        };
        if (!target.documentId) {
          const [notification] = await tx
            .select({
              documentId: interviewNotification.feishuDocumentId,
              documentUrl: interviewNotification.feishuDocumentUrl,
              providerId: interviewNotification.providerId,
            })
            .from(interviewNotification)
            .where(
              and(
                eq(interviewNotification.organizationId, job.organizationId),
                eq(interviewNotification.interviewRecordId, context.interviewRecordId),
                eq(interviewNotification.type, "summary_ready"),
                isNotNull(interviewNotification.feishuDocumentUrl),
              ),
            )
            .orderBy(desc(interviewNotification.updatedAt), desc(interviewNotification.id))
            .limit(1);
          target = {
            documentId: notification?.documentUrl
              ? (resolveFeishuDocxDocumentId(notification.documentId, notification.documentUrl) ??
                null)
              : null,
            documentUrl: notification?.documentUrl ?? null,
            providerId: notification?.providerId ?? null,
          };
        }
        const providerId = FEISHU_PROVIDER_IDS.find((id) => id === target.providerId);
        if (!target.documentId || !target.documentUrl || !providerId) {
          await tx
            .update(jobs)
            .set({
              error: target.documentUrl
                ? "评价表地址或飞书应用无效"
                : "暂无飞书评价表，生成后将自动同步",
              leaseOwner: null,
              nextAttemptAt: new Date(now.getTime() + 60_000),
              status: target.documentUrl ? "failed" : "waiting_document",
            })
            .where(eq(jobs.snapshotId, job.snapshotId));
          return "deferred";
        }

        // Serialize claims for one document; no database connection is held during Feishu I/O.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`human-evaluation:${target.documentId}`}, 0))`,
        );
        const [active] = await tx
          .select({ id: jobs.snapshotId })
          .from(jobs)
          .where(
            and(
              eq(jobs.documentId, target.documentId),
              ne(jobs.snapshotId, job.snapshotId),
              eq(jobs.status, "syncing"),
              gt(jobs.nextAttemptAt, now),
            ),
          )
          .limit(1);
        if (active) {
          await tx
            .update(jobs)
            .set({
              ...target,
              leaseOwner: null,
              nextAttemptAt: new Date(now.getTime() + 10_000),
              status: "pending",
            })
            .where(eq(jobs.snapshotId, job.snapshotId));
          return "deferred";
        }
        const leaseOwner = crypto.randomUUID();
        await tx
          .update(jobs)
          .set({
            ...target,
            attemptCount: job.attemptCount + 1,
            leaseOwner,
            nextAttemptAt: new Date(now.getTime() + LEASE_MS),
            status: "syncing",
          })
          .where(eq(jobs.snapshotId, job.snapshotId));
        return {
          ...job,
          ...target,
          attemptCount: job.attemptCount + 1,
          deadlineAt: now.getTime() + 5 * 60_000,
          documentId: target.documentId,
          documentUrl: target.documentUrl,
          evaluation: context.evaluation,
          leaseOwner,
          outcome: context.outcome,
          providerId,
          roundLabel: context.roundLabel,
          submittedAt: context.submittedAt.toISOString(),
          submittedBy: context.submittedBy ?? "面试官",
        };
      });
    },
    async finish(
      job: HumanInterviewDocumentSyncJob,
      result: { status: "synced" | "failed"; error: string | null },
    ) {
      const now = new Date();
      await db
        .update(jobs)
        .set({
          ...result,
          error: result.error?.slice(0, 2000) ?? null,
          leaseOwner: null,
          nextAttemptAt: new Date(
            now.getTime() + Math.min(60_000 * 2 ** Math.min(job.attemptCount - 1, 6), 3_600_000),
          ),
          syncedAt: result.status === "synced" ? now : null,
        })
        .where(owned(job));
    },
    async loadStatus(input: { roundId: string; organizationId: string }) {
      const [row] = await db
        .select({ documentUrl: jobs.documentUrl, status: jobs.status, syncedAt: jobs.syncedAt })
        .from(jobs)
        .where(and(eq(jobs.roundId, input.roundId), eq(jobs.organizationId, input.organizationId)))
        .limit(1);
      return row ? { ...row, syncedAt: row.syncedAt?.toISOString() ?? null } : null;
    },
    async retry(input: { roundId: string; organizationId: string }) {
      const [row] = await db
        .update(jobs)
        .set({ error: null, nextAttemptAt: new Date(), status: "pending" })
        .where(
          and(
            eq(jobs.roundId, input.roundId),
            eq(jobs.organizationId, input.organizationId),
            inArray(jobs.status, ["failed", "waiting_document"]),
          ),
        )
        .returning({ id: jobs.snapshotId });
      return Boolean(row);
    },
    async saveBlock(job: HumanInterviewDocumentSyncJob, blockId: string) {
      const [saved] = await db
        .update(jobs)
        .set({ blockId })
        .where(owned(job))
        .returning({ id: jobs.snapshotId });
      if (!saved) {
        throw new Error("评价表同步任务已由其他进程接管");
      }
    },
  };
}
