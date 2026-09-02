import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  humanInterviewDocumentSync,
  interviewAuditLog,
  organization,
  studioHumanInterviewEvaluationSnapshot,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@app/db-schema/schema";
import { factory } from "../../../../../factory";
import { studioInterviewHumanRouter } from "../human-route";
import { resolveHumanInterviewOutcome } from "../application/resolve-human-interview-outcome";
import { createResolveHumanInterviewOutcomeDao } from "./resolve-human-interview-outcome";
import { createHumanInterviewDocumentSyncDao } from "./human-interview-document-sync";
import { createHumanInterviewRound } from "./human-interview-rounds";
import { submitHumanInterviewEvaluation } from "./human-interview-evaluation";

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
const request = (outcome: string) => ({
  body: JSON.stringify({ outcome }),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});
async function cleanup() {
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
  await db.insert(studioInterview).values({
    candidateName: "测试候选人",
    createdBy: actorId,
    id: candidateId,
    interviewQuestions: [],
    organizationId: orgId,
    pipelineStage: "human_interview",
  });
  await db.insert(studioHumanInterviewRound).values({
    evaluation,
    evaluationStatus: "submitted",
    evaluationSubmittedAt: new Date("2026-09-01"),
    evaluationUpdatedBy: actorId,
    feedback: evaluation.overallEvaluation,
    format: "online",
    id: roundId,
    interviewRecordId: candidateId,
    label: "业务一面",
    organizationId: orgId,
    outcome: "inconclusive",
    status: "completed",
  });
  await db.insert(studioHumanInterviewEvaluationSnapshot).values({
    createdBy: actorId,
    evaluation,
    id: snapshotId,
    organizationId: orgId,
    outcome: "inconclusive",
    roundId,
    source: "human_submitted",
  });
  await db.insert(humanInterviewDocumentSync).values({
    blockId: "block",
    documentId: "doc",
    documentUrl: "https://example.feishu.cn/docx/doc",
    organizationId: orgId,
    providerId: "feishu",
    roundId,
    snapshotId,
    status: "synced",
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
      .update(humanInterviewDocumentSync)
      .set({ status: "synced" })
      .where(eq(humanInterviewDocumentSync.snapshotId, input.snapshotId));
  });
  it.each(["pass", "fail"] as const)(
    "resolves %s without changing evaluation or snapshot and queues rating-only sync",
    async (outcome) => {
      const input = await fixture();
      await resolveHumanInterviewOutcome({ ...input, outcome }, { persist });
      const [round] = await db
        .select()
        .from(studioHumanInterviewRound)
        .where(eq(studioHumanInterviewRound.id, input.roundId));
      expect(round).toMatchObject({
        evaluation,
        evaluationStatus: "submitted",
        evaluationSubmittedAt: new Date("2026-09-01"),
        outcome,
      });
      const [snapshot] = await db
        .select()
        .from(studioHumanInterviewEvaluationSnapshot)
        .where(eq(studioHumanInterviewEvaluationSnapshot.id, input.snapshotId));
      expect(snapshot).toMatchObject({ evaluation, outcome: "inconclusive" });
      const [audit] = await db
        .select()
        .from(interviewAuditLog)
        .where(eq(interviewAuditLog.interviewRecordId, input.interviewRecordId));
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
          input: { format: "online", interviewerIds: [], label: "业务二面" },
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
      .from(interviewAuditLog)
      .where(eq(interviewAuditLog.interviewRecordId, input.interviewRecordId));
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
      .update(studioHumanInterviewRound)
      .set({ status: "pending" })
      .where(eq(studioHumanInterviewRound.id, input.roundId));
    await expect(resolveHumanInterviewOutcome(input, { persist })).rejects.toMatchObject({
      status: 409,
    });
    await db
      .update(studioHumanInterviewRound)
      .set({ outcome: "pass", status: "completed" })
      .where(eq(studioHumanInterviewRound.id, input.roundId));
    await expect(
      resolveHumanInterviewOutcome({ ...input, outcome: "fail" }, { persist }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not race with an active document sync", async () => {
    const input = await fixture();
    await db
      .update(humanInterviewDocumentSync)
      .set({ nextAttemptAt: new Date(Date.now() + 600_000), status: "syncing" })
      .where(eq(humanInterviewDocumentSync.snapshotId, input.snapshotId));
    await expect(resolveHumanInterviewOutcome(input, { persist })).rejects.toMatchObject({
      status: 409,
    });
    const [round] = await db
      .select()
      .from(studioHumanInterviewRound)
      .where(eq(studioHumanInterviewRound.id, input.roundId));
    expect(round?.outcome).toBe("inconclusive");
  });
  it("rejects inconclusive formal submissions even when called without HTTP", async () => {
    const input = await fixture();
    await db
      .update(studioHumanInterviewRound)
      .set({ evaluationStatus: "draft", status: "pending" })
      .where(eq(studioHumanInterviewRound.id, input.roundId));
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
