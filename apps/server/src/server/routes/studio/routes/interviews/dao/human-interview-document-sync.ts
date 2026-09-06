import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { formatBusinessInterviewLabel } from "@app/shared/human-interview-rounds";
import type { Database } from "@app/database";
import type { HumanInterviewRoundOutcome } from "@app/db-schema/studio-interviews";
import {
  humanInterviewEvaluationDocumentSync,
  recruitingNotificationDelivery,
  humanInterviewEvaluationSnapshot,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import type { HumanInterviewDocumentSyncJob } from "../application/sync-human-interview-document";
import { FEISHU_PROVIDER_IDS } from "../../../../../integrations/feishu/provider";
import { resolveFeishuDocxDocumentId } from "../../../../../integrations/feishu/feishu-docx";

const jobs = humanInterviewEvaluationDocumentSync;
const LEASE_MS = 10 * 60_000;

function documentDecision(
  context: {
    outcome: HumanInterviewRoundOutcome | null;
    submittedOutcome: HumanInterviewRoundOutcome | null;
  },
  blockId: string | null,
  syncedAt: Date | null,
) {
  const outcome = context.outcome ?? context.submittedOutcome;
  if (!outcome) {
    throw new Error("同步任务缺少正式提交结论");
  }
  // A block is checkpointed before its body is written. Only a successful sync
  // proves that later outcome corrections can safely leave the other fields alone.
  return {
    outcome,
    ratingOnly: Boolean(blockId && syncedAt) && outcome !== context.submittedOutcome,
  };
}

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
            evaluation: humanInterviewEvaluationSnapshot.evaluation,
            interviewRecordId: humanInterviewRound.recruitingRecordId,
            outcome: humanInterviewRound.outcome,
            roundLabel: humanInterviewRound.label,
            sortOrder: humanInterviewRound.sortOrder,
            submittedAt: humanInterviewEvaluationSnapshot.createdAt,
            submittedBy: user.name,
            submittedOutcome: humanInterviewEvaluationSnapshot.outcome,
          })
          .from(humanInterviewEvaluationSnapshot)
          .innerJoin(humanInterviewRound, eq(humanInterviewRound.id, job.roundId))
          .leftJoin(user, eq(user.id, humanInterviewEvaluationSnapshot.createdBy))
          .where(
            and(
              eq(humanInterviewEvaluationSnapshot.id, job.snapshotId),
              eq(humanInterviewEvaluationSnapshot.source, "human_submitted"),
            ),
          )
          .limit(1);
        if (!context) {
          throw new Error("同步任务缺少正式提交评价");
        }
        // Editable meeting labels are not template identities. Cancelled rounds
        // and CEO interviews do not consume a business evaluation slot.
        let roundLabel = "CEO面试";
        if (context.roundLabel !== "CEO面试") {
          const [previous] = await tx
            .select({ total: count() })
            .from(humanInterviewRound)
            .where(
              and(
                eq(humanInterviewRound.organizationId, job.organizationId),
                eq(humanInterviewRound.recruitingRecordId, context.interviewRecordId),
                lt(humanInterviewRound.sortOrder, context.sortOrder),
                ne(humanInterviewRound.status, "cancelled"),
                ne(humanInterviewRound.label, "CEO面试"),
              ),
            );
          roundLabel = formatBusinessInterviewLabel(previous.total + 1);
        }
        const decision = documentDecision(context, job.blockId, job.syncedAt);
        let target = {
          documentId: job.documentId,
          documentUrl: job.documentUrl,
          providerId: job.providerId,
        };
        if (!target.documentId) {
          const [notification] = await tx
            .select({
              documentId: recruitingNotificationDelivery.feishuDocumentId,
              documentUrl: recruitingNotificationDelivery.feishuDocumentUrl,
              providerId: recruitingNotificationDelivery.providerId,
            })
            .from(recruitingNotificationDelivery)
            .where(
              and(
                eq(recruitingNotificationDelivery.organizationId, job.organizationId),
                eq(recruitingNotificationDelivery.recruitingRecordId, context.interviewRecordId),
                eq(recruitingNotificationDelivery.type, "summary_ready"),
                isNotNull(recruitingNotificationDelivery.feishuDocumentUrl),
              ),
            )
            .orderBy(
              desc(recruitingNotificationDelivery.updatedAt),
              desc(recruitingNotificationDelivery.id),
            )
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
          ...decision,
          providerId,
          roundLabel,
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
          // Retain the last success across failed outcome-only updates and retries.
          syncedAt: result.status === "synced" ? now : undefined,
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
