import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  humanInterviewEvaluationDocumentSync,
  recruitingEvent,
  recruitingNodeState,
  organization,
  humanInterviewEvaluationSnapshot,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import { factory } from "../../../../../factory";
import { studioInterviewHumanRouter } from "../human-route";
import { resolveHumanInterviewOutcome } from "../application/resolve-human-interview-outcome";
import { createResolveHumanInterviewOutcomeDao } from "./resolve-human-interview-outcome";
import { createHumanInterviewDocumentSyncDao } from "./human-interview-document-sync";
import { createHumanInterviewRound } from "./human-interview-rounds";
import { submitHumanInterviewEvaluation } from "./human-interview-evaluation";
import { syncHumanInterviewDocument } from "../application/sync-human-interview-document";
import { updateFeishuDocxHumanInterviewEvaluation } from "../../../../../integrations/feishu/feishu-docx";
import { buildHumanInterviewEvaluationBlock } from "../../../../../integrations/feishu/human-interview-evaluation-doc";
import { INTERVIEW_STAGE_PLACEHOLDER_FIELDS } from "../../../../../integrations/feishu/interview-evaluation-doc";

const orgId = "outcome-test-org";
const actorId = "outcome-test-user";
const evaluation = {
  detailedAnalysis: "原详细分析",
  evidenceTurnIds: [],
  overallEvaluation: "原整体评价",
  professionalSkill: "中",
  rating: "C" as const,
  risks: "风险",
  rolePosition: "执行",
  salaryRecommendation: "",
  seniorityPosition: "高级",
  strengths: "优势",
};
const persist = createResolveHumanInterviewOutcomeDao(db);
const text = (content: string) => ({
  block_type: 2,
  text: { elements: [{ text_run: { content } }] },
});
const request = (outcome: string) => ({
  body: JSON.stringify({ outcome }),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});
async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, orgId));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, actorId));
}
beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: new Date(),
    email: "outcome-test@example.com",
    emailVerified: false,
    id: actorId,
    name: "修改人",
    updatedAt: new Date(),
  });
  await db
    .insert(organization)
    .values({ createdAt: new Date(), id: orgId, name: "Outcome test", slug: orgId });
});
afterAll(cleanup);
async function fixture() {
  const candidateId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();
  await createRecruitingRecords(db, {
    candidateName: "测试候选人",
    createdBy: actorId,
    id: candidateId,
    interviewQuestions: [],
    organizationId: orgId,
    pipelineStage: "second_interview",
  });
  await db.insert(humanInterviewRound).values({
    evaluation,
    evaluationStatus: "submitted",
    evaluationSubmittedAt: new Date("2026-09-01"),
    evaluationUpdatedBy: actorId,
    feedback: evaluation.overallEvaluation,
    format: "online",
    id: roundId,
    label: "业务一面",
    organizationId: orgId,
    outcome: "inconclusive",
    recruitingRecordId: candidateId,
    roundKind: "second_interview",
    status: "completed",
  });
  await db
    .update(recruitingNodeState)
    .set({ effectiveHumanRoundId: roundId, status: "awaiting_review" })
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, candidateId),
        eq(recruitingNodeState.node, "second_interview"),
      ),
    );
  await db.insert(humanInterviewEvaluationSnapshot).values({
    createdBy: actorId,
    evaluation,
    id: snapshotId,
    organizationId: orgId,
    outcome: "inconclusive",
    roundId,
    source: "human_submitted",
  });
  await db.insert(humanInterviewEvaluationDocumentSync).values({
    blockId: "block",
    documentId: "doc",
    documentUrl: "https://example.feishu.cn/docx/doc",
    organizationId: orgId,
    providerId: "feishu",
    roundId,
    snapshotId,
    status: "synced",
    syncedAt: new Date("2026-09-01"),
  });
  return {
    actorId,
    interviewRecordId: candidateId,
    organizationId: orgId,
    outcome: "pass" as const,
    roundId,
    snapshotId,
  };
}
describe("resolve historical human interview outcome", () => {
  it("validates HTTP input and scopes the mutation to authorized workspace members", async () => {
    const input = await fixture();
    const [actor] = await db.select().from(user).where(eq(user.id, actorId));
    const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
    if (!actor || !org) {
      throw new Error("Missing test actor or workspace");
    }
    const app = (role: string) =>
      factory
        .createApp()
        .use("*", async (c, next) => {
          c.set("user", actor);
          c.set("activeOrg", org);
          c.set("member", {
            createdAt: new Date(),
            id: "member",
            inviteLinkId: null,
            organizationId: orgId,
            role,
            userId: actorId,
          });
          await next();
        })
        .route("/", studioInterviewHumanRouter);
    const path = `/${input.interviewRecordId}/human-interview-rounds/${input.roundId}/outcome`;
    for (const [role, outcome, status] of [
      ["noAccess", "pass", 403],
      ["owner", "inconclusive", 400],
      ["owner", "pass", 200],
      ["owner", "fail", 409],
    ] as const) {
      const response = await app(role).request(path, request(outcome));
      expect(response.status).toBe(status);
    }
    // This fixture's sync should not interfere with the claim tests below.
    await db
      .update(humanInterviewEvaluationDocumentSync)
      .set({ status: "synced" })
      .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, input.snapshotId));
  });
  it.each(["pass", "fail"] as const)(
    "resolves %s without changing evaluation or snapshot and queues rating-only sync",
    async (outcome) => {
      const input = await fixture();
      await resolveHumanInterviewOutcome({ ...input, outcome }, { persist });
      const [round] = await db
        .select()
        .from(humanInterviewRound)
        .where(eq(humanInterviewRound.id, input.roundId));
      expect(round).toMatchObject({
        evaluation,
        evaluationStatus: "submitted",
        evaluationSubmittedAt: new Date("2026-09-01"),
        outcome,
      });
      const [snapshot] = await db
        .select()
        .from(humanInterviewEvaluationSnapshot)
        .where(eq(humanInterviewEvaluationSnapshot.id, input.snapshotId));
      expect(snapshot).toMatchObject({ evaluation, outcome: "inconclusive" });
      const [audit] = await db
        .select()
        .from(recruitingEvent)
        .where(
          and(
            eq(recruitingEvent.recruitingRecordId, input.interviewRecordId),
            eq(recruitingEvent.action, "human_interview_round_updated"),
          ),
        );
      expect(audit).toMatchObject({
        detail: { newOutcome: outcome, oldOutcome: "inconclusive" },
        operatorId: actorId,
      });
      const dao = createHumanInterviewDocumentSyncDao(db);
      const job = await dao.claim();
      expect(job).toMatchObject({ outcome, ratingOnly: true, snapshotId: input.snapshotId });
      if (job && job !== "deferred") {
        await dao.finish(job, { error: null, status: "synced" });
      }
      const nextRound = () =>
        createHumanInterviewRound({
          input: {
            format: "online",
            interviewerIds: [],
            label: "业务二面",
            roundKind: "final_interview",
          },
          interviewRecordId: input.interviewRecordId,
          organizationId: orgId,
        });
      if (outcome === "pass") {
        const next = await nextRound();
        expect(next.label).toBe("业务二面");
      } else {
        await expect(nextRound()).rejects.toThrow();
      }
    },
  );
  it.each(["before-body-write", "after-body-delete"])(
    "retries the complete evaluation after resolving an initial sync failure: %s",
    async (stage) => {
      const input = await fixture();
      await db
        .update(humanInterviewEvaluationDocumentSync)
        .set({ status: "failed", syncedAt: null })
        .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, input.snapshotId));
      await resolveHumanInterviewOutcome(input, { persist });
      const fields = stage === "before-body-write" ? INTERVIEW_STAGE_PLACEHOLDER_FIELDS : [];
      const writes: string[] = [];
      const dao = createHumanInterviewDocumentSyncDao(db);
      await syncHumanInterviewDocument({
        ...dao,
        updateDocument: (job) =>
          updateFeishuDocxHumanInterviewEvaluation(
            { ...job, accessToken: "test-token", block: buildHumanInterviewEvaluationBlock(job) },
            {
              fetcher: (_url, init) => {
                if (init?.method === "GET") {
                  return Promise.resolve(
                    Response.json({
                      code: 0,
                      data: {
                        items: [
                          {
                            block_id: "block",
                            block_type: 19,
                            children: ["title", ...fields.map((_, i) => `field-${i}`)],
                          },
                          { block_id: "title", ...text("业务一面评价") },
                          ...fields.map((field, i) => ({ block_id: `field-${i}`, ...text(field) })),
                        ],
                      },
                    }),
                  );
                }
                writes.push(String(init?.body));
                return Promise.resolve(Response.json({ code: 0, data: {} }));
              },
              sleep: () => Promise.resolve(),
            },
          ),
      });
      expect(await dao.loadStatus({ organizationId: orgId, roundId: input.roundId })).toMatchObject(
        { status: "synced" },
      );
      for (const field of [
        "面试官：修改人",
        "C（通过）",
        "职级定位：高级",
        "专业技能：中",
        "优势特点：优势",
        "劣势风险：风险",
      ]) {
        expect(writes.join("\n")).toContain(field);
      }
    },
  );
  it("keeps a completed initial sync across failed rating-only retries", async () => {
    const input = await fixture();
    await resolveHumanInterviewOutcome(input, { persist });
    const dao = createHumanInterviewDocumentSyncDao(db);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const job = await dao.claim();
      expect(job).toMatchObject({ ratingOnly: true, snapshotId: input.snapshotId });
      if (!job || job === "deferred") {
        throw new Error("Missing sync job");
      }
      await dao.finish(job, { error: "temporary failure", status: "failed" });
      expect(await dao.loadStatus({ organizationId: orgId, roundId: input.roundId })).toMatchObject(
        { syncedAt: "2026-09-01T00:00:00.000Z" },
      );
      await dao.retry({ organizationId: orgId, roundId: input.roundId });
    }
    const job = await dao.claim();
    if (!job || job === "deferred") {
      throw new Error("Missing final sync job");
    }
    await dao.finish(job, { error: null, status: "synced" });
  });
  it("rejects a concurrent second decision", async () => {
    const input = await fixture();
    const results = await Promise.allSettled([
      resolveHumanInterviewOutcome(input, { persist }),
      resolveHumanInterviewOutcome({ ...input, outcome: "fail" }, { persist }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const logs = await db
      .select()
      .from(recruitingEvent)
      .where(
        and(
          eq(recruitingEvent.recruitingRecordId, input.interviewRecordId),
          eq(recruitingEvent.action, "human_interview_round_updated"),
        ),
      );
    expect(logs).toHaveLength(1);
  });
  it("rejects wrong organization, wrong candidate, non-completed and finalized rounds", async () => {
    const input = await fixture();
    await expect(
      resolveHumanInterviewOutcome({ ...input, organizationId: "other" }, { persist }),
    ).rejects.toMatchObject({ status: 404 });
    const other = await fixture();
    await expect(
      resolveHumanInterviewOutcome(
        { ...input, interviewRecordId: other.interviewRecordId },
        { persist },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await db
      .update(humanInterviewRound)
      .set({ status: "pending" })
      .where(eq(humanInterviewRound.id, input.roundId));
    await expect(resolveHumanInterviewOutcome(input, { persist })).rejects.toMatchObject({
      status: 409,
    });
    await db
      .update(humanInterviewRound)
      .set({ outcome: "pass", status: "completed" })
      .where(eq(humanInterviewRound.id, input.roundId));
    await expect(
      resolveHumanInterviewOutcome({ ...input, outcome: "fail" }, { persist }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not race with an active document sync", async () => {
    const input = await fixture();
    await db
      .update(humanInterviewEvaluationDocumentSync)
      .set({ nextAttemptAt: new Date(Date.now() + 600_000), status: "syncing" })
      .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, input.snapshotId));
    await expect(resolveHumanInterviewOutcome(input, { persist })).rejects.toMatchObject({
      status: 409,
    });
    const [round] = await db
      .select()
      .from(humanInterviewRound)
      .where(eq(humanInterviewRound.id, input.roundId));
    expect(round?.outcome).toBe("inconclusive");
  });
  it("rejects inconclusive formal submissions even when called without HTTP", async () => {
    const input = await fixture();
    await db
      .update(humanInterviewRound)
      .set({ evaluationStatus: "draft", status: "pending" })
      .where(eq(humanInterviewRound.id, input.roundId));
    expect(
      await submitHumanInterviewEvaluation({
        ...input,
        evaluation,
        meetingSessionId: null,
        outcome: "inconclusive",
        transcriptRevisionId: null,
      }),
    ).toBe(false);
  });
});
