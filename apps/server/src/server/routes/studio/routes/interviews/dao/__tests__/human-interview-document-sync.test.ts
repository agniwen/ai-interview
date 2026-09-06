import { createRecruitingRecords } from "@app/database/recruiting-records";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startHumanInterviewDocumentSyncScheduler } from "../../adapters/document-sync-scheduler";
import { syncHumanInterviewDocument } from "../../application/sync-human-interview-document";
import { db } from "../../../../../../../lib/server/db/index";
import {
  humanInterviewEvaluationDocumentSync,
  recruitingNotificationDelivery,
  organization,
  humanInterviewEvaluationSnapshot,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import { createHumanInterviewDocumentSyncDao } from "../human-interview-document-sync";
const org = `doc-sync-${crypto.randomUUID()}`;
const actor = `${org}-user`;
const candidate = `${org}-candidate`;
const evaluation = {
  detailedAnalysis: "完整分析",
  evidenceTurnIds: [],
  overallEvaluation: "确认评价",
  professionalSkill: "良",
  rating: "B" as const,
  risks: "风险",
  rolePosition: "执行者",
  salaryRecommendation: "",
  seniorityPosition: "高级",
  strengths: "优势",
};
const dao = createHumanInterviewDocumentSyncDao(db);
let serial = 0;
async function seed() {
  serial += 1;
  const id = `${org}-${serial}`;
  await db.insert(humanInterviewRound).values({
    evaluation,
    evaluationStatus: "submitted",
    format: "online",
    id,
    label: `轮次${serial}`,
    organizationId: org,
    recruitingRecordId: candidate,
    roundKind: "second_interview",
    status: "completed",
  });
  await db.insert(humanInterviewEvaluationSnapshot).values({
    createdBy: actor,
    evaluation,
    id,
    organizationId: org,
    outcome: "pass",
    roundId: id,
    source: "human_submitted",
  });
  await db
    .insert(humanInterviewEvaluationDocumentSync)
    .values({ nextAttemptAt: new Date(0), organizationId: org, roundId: id, snapshotId: id });
  return id;
}
async function notification(suffix: string, providerId: string, date: string) {
  await db.insert(recruitingNotificationDelivery).values({
    feishuDocumentId: suffix,
    feishuDocumentUrl: `https://feishu.cn/docx/${suffix}`,
    id: `${org}-${suffix}`,
    organizationId: org,
    providerId,
    recipientOpenId: "open",
    recipientUserId: actor,
    recruitingRecordId: candidate,
    status: "sent",
    type: "summary_ready",
    updatedAt: new Date(date),
  });
}
beforeAll(async () => {
  await db
    .insert(user)
    .values({ email: `${actor}@example.com`, emailVerified: false, id: actor, name: "测试面试官" });
  await db
    .insert(organization)
    .values({ createdAt: new Date(), id: org, name: "文档同步测试", slug: org });
  await createRecruitingRecords(db, {
    candidateName: "测试候选人",
    createdBy: actor,
    id: candidate,
    interviewQuestions: [],
    organizationId: org,
  });
});
afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, org));
  await db.delete(user).where(eq(user.id, actor));
});
describe("human interview document outbox", () => {
  it("maps custom round labels by business order, excluding cancelled rounds and CEO interviews", async () => {
    const id = await seed();
    const previous = [
      { label: "业务一面", status: "completed" as const },
      { label: "已取消的二面", status: "cancelled" as const },
      { label: "CEO面试", status: "completed" as const },
    ].map((round, sortOrder) => ({
      ...round,
      format: "online" as const,
      id: `${id}-previous-${sortOrder}`,
      organizationId: org,
      recruitingRecordId: candidate,
      roundKind: "second_interview" as const,
      sortOrder,
    }));
    try {
      await db.insert(humanInterviewRound).values(previous);
      await db
        .update(humanInterviewRound)
        .set({ label: "业务一面后面的二面", sortOrder: 3 })
        .where(eq(humanInterviewRound.id, id));
      await db
        .update(humanInterviewEvaluationDocumentSync)
        .set({
          documentId: "ordinal-document",
          documentUrl: "https://feishu.cn/docx/ordinal-document",
          providerId: "feishu",
        })
        .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, id));
      const job = await dao.claim();
      expect(job).toMatchObject({ roundLabel: "业务二面", snapshotId: id });
      if (!job || job === "deferred") {
        throw new Error("missing job");
      }
      await dao.saveBlock(job, "existing-business-two");
      await dao.finish(job, { error: "retry", status: "failed" });
      await dao.retry({ organizationId: org, roundId: id });
      const retry = await dao.claim();
      expect(retry).toMatchObject({ blockId: "existing-business-two", roundLabel: "业务二面" });
      if (!retry || retry === "deferred") {
        throw new Error("missing retry");
      }
      await dao.finish(retry, { error: null, status: "synced" });
    } finally {
      await db
        .delete(humanInterviewRound)
        .where(inArray(humanInterviewRound.id, [id, ...previous.map((round) => round.id)]));
    }
  });

  it("preserves the dedicated CEO template identity", async () => {
    const id = await seed();
    try {
      await db
        .update(humanInterviewRound)
        .set({ label: "CEO面试", sortOrder: 4 })
        .where(eq(humanInterviewRound.id, id));
      await db
        .update(humanInterviewEvaluationDocumentSync)
        .set({
          documentId: "ceo-document",
          documentUrl: "https://feishu.cn/docx/ceo-document",
          providerId: "feishu",
        })
        .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, id));
      expect(await dao.claim()).toMatchObject({ roundLabel: "CEO面试", snapshotId: id });
    } finally {
      await db.delete(humanInterviewRound).where(eq(humanInterviewRound.id, id));
    }
  });

  it("processes a ready task in the same poll after postponing a task without a document", async () => {
    const waitingId = await seed();
    const readyId = await seed();
    await db
      .update(humanInterviewEvaluationDocumentSync)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, waitingId));
    await db
      .update(humanInterviewEvaluationDocumentSync)
      .set({
        documentId: "ready-document",
        documentUrl: "https://feishu.cn/docx/ready-document",
        nextAttemptAt: new Date(1),
        providerId: "feishu",
      })
      .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, readyId));
    const updateDocument = vi.fn(async () => {});
    const scheduler = startHumanInterviewDocumentSyncScheduler(() =>
      syncHumanInterviewDocument({ ...dao, updateDocument }),
    );
    try {
      await scheduler.runOnce();
      expect(await dao.loadStatus({ organizationId: org, roundId: waitingId })).toMatchObject({
        status: "waiting_document",
      });
      expect(await dao.loadStatus({ organizationId: org, roundId: readyId })).toMatchObject({
        status: "synced",
      });
      expect(updateDocument).toHaveBeenCalledTimes(1);
    } finally {
      await scheduler.close();
      await db
        .delete(humanInterviewRound)
        .where(inArray(humanInterviewRound.id, [waitingId, readyId]));
    }
  });

  it("waits for a document, pins the latest provider target, and retains it on retry", async () => {
    const id = await seed();
    expect(await dao.claim()).toBe("deferred");
    expect(await dao.loadStatus({ organizationId: org, roundId: id })).toMatchObject({
      status: "waiting_document",
    });
    await notification("older", "feishu", "2026-09-01T00:00:00Z");
    await notification("latest", "feishu-jiguang-hr", "2026-09-02T00:00:00Z");
    await dao.retry({ organizationId: org, roundId: id });
    const job = await dao.claim();
    expect(job).toMatchObject({
      documentId: "latest",
      evaluation,
      providerId: "feishu-jiguang-hr",
      snapshotId: id,
    });
    if (!job || job === "deferred") {
      throw new Error("missing job");
    }
    await dao.saveBlock(job, "block-owned");
    await dao.finish(job, { error: "network timeout", status: "failed" });
    await notification("newest", "feishu", "2026-09-03T00:00:00Z");
    await dao.retry({ organizationId: org, roundId: id });
    const retry = await dao.claim();
    expect(retry).toMatchObject({
      blockId: "block-owned",
      documentId: "latest",
      providerId: "feishu-jiguang-hr",
    });
    if (!retry || retry === "deferred") {
      throw new Error("missing retry");
    }
    await dao.finish(job, { error: null, status: "synced" });
    expect(await dao.loadStatus({ organizationId: org, roundId: id })).toMatchObject({
      status: "syncing",
    });
    await dao.finish(retry, { error: null, status: "synced" });
    expect(await dao.loadStatus({ organizationId: org, roundId: id })).toMatchObject({
      documentUrl: "https://feishu.cn/docx/latest",
      status: "synced",
    });
  });
  it("claims only once concurrently and isolates workspace reads and retries", async () => {
    const id = await seed();
    const claims = await Promise.all([dao.claim(), dao.claim()]);
    expect(claims.filter((claim) => claim !== null && claim !== "deferred")).toHaveLength(1);
    expect(await dao.loadStatus({ organizationId: "other", roundId: id })).toBeNull();
    expect(await dao.retry({ organizationId: "other", roundId: id })).toBe(false);
    const job = claims.find((claim) => claim !== null && claim !== "deferred");
    if (!job) {
      throw new Error("missing job");
    }
    await db
      .update(humanInterviewEvaluationDocumentSync)
      .set({ nextAttemptAt: new Date(0) })
      .where(
        and(
          eq(humanInterviewEvaluationDocumentSync.snapshotId, id),
          eq(humanInterviewEvaluationDocumentSync.organizationId, org),
        ),
      );
    const recovered = await dao.claim();
    if (recovered === "deferred") {
      throw new Error("expected an expired job to be reclaimed");
    }
    expect(recovered?.snapshotId).toBe(id);
    expect(recovered?.leaseOwner).not.toBe(job.leaseOwner);
    if (recovered) {
      await dao.finish(recovered, { error: null, status: "synced" });
    }
  });
  it("serializes different rounds writing the same document across backend instances", async () => {
    await seed();
    await seed();
    const claims = await Promise.all([dao.claim(), dao.claim()]);
    expect(claims.filter((claim) => claim !== null && claim !== "deferred")).toHaveLength(1);
    const first = claims.find((claim) => claim !== null && claim !== "deferred");
    if (!first) {
      throw new Error("missing first claim");
    }
    await dao.finish(first, { error: null, status: "synced" });
    await db
      .update(humanInterviewEvaluationDocumentSync)
      .set({ nextAttemptAt: new Date(0) })
      .where(
        and(
          eq(humanInterviewEvaluationDocumentSync.organizationId, org),
          eq(humanInterviewEvaluationDocumentSync.status, "pending"),
        ),
      );
    const second = await dao.claim();
    if (second === "deferred") {
      throw new Error("expected the next round to be claimed");
    }
    expect(second?.documentId).toBe(first.documentId);
    expect(second?.roundId).not.toBe(first.roundId);
    if (second) {
      await dao.finish(second, { error: null, status: "synced" });
    }
  });
});
