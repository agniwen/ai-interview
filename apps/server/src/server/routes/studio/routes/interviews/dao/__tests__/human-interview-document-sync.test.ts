import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startHumanInterviewDocumentSyncScheduler } from "../../adapters/document-sync-scheduler";
import { syncHumanInterviewDocument } from "../../application/sync-human-interview-document";
import { db } from "../../../../../../../lib/server/db/index";
import {
  humanInterviewDocumentSync,
  interviewNotification,
  organization,
  studioHumanInterviewEvaluationSnapshot,
  studioHumanInterviewRound,
  studioInterview,
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
  await db.insert(studioHumanInterviewRound).values({
    evaluation,
    evaluationStatus: "submitted",
    format: "online",
    id,
    interviewRecordId: candidate,
    label: `轮次${serial}`,
    organizationId: org,
    status: "completed",
  });
  await db.insert(studioHumanInterviewEvaluationSnapshot).values({
    createdBy: actor,
    evaluation,
    id,
    organizationId: org,
    outcome: "pass",
    roundId: id,
    source: "human_submitted",
  });
  await db
    .insert(humanInterviewDocumentSync)
    .values({ nextAttemptAt: new Date(0), organizationId: org, roundId: id, snapshotId: id });
  return id;
}
async function notification(suffix: string, providerId: string, date: string) {
  await db.insert(interviewNotification).values({
    feishuDocumentId: suffix,
    feishuDocumentUrl: `https://feishu.cn/docx/${suffix}`,
    id: `${org}-${suffix}`,
    interviewRecordId: candidate,
    organizationId: org,
    providerId,
    recipientOpenId: "open",
    recipientUserId: actor,
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
  await db.insert(studioInterview).values({
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
  it("processes a ready task in the same poll after postponing a task without a document", async () => {
    const waitingId = await seed();
    const readyId = await seed();
    await db
      .update(humanInterviewDocumentSync)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(humanInterviewDocumentSync.snapshotId, waitingId));
    await db
      .update(humanInterviewDocumentSync)
      .set({
        documentId: "ready-document",
        documentUrl: "https://feishu.cn/docx/ready-document",
        nextAttemptAt: new Date(1),
        providerId: "feishu",
      })
      .where(eq(humanInterviewDocumentSync.snapshotId, readyId));
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
        .delete(studioHumanInterviewRound)
        .where(inArray(studioHumanInterviewRound.id, [waitingId, readyId]));
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
      .update(humanInterviewDocumentSync)
      .set({ nextAttemptAt: new Date(0) })
      .where(
        and(
          eq(humanInterviewDocumentSync.snapshotId, id),
          eq(humanInterviewDocumentSync.organizationId, org),
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
      .update(humanInterviewDocumentSync)
      .set({ nextAttemptAt: new Date(0) })
      .where(
        and(
          eq(humanInterviewDocumentSync.organizationId, org),
          eq(humanInterviewDocumentSync.status, "pending"),
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
