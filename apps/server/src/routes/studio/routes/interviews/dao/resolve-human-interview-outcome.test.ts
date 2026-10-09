import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../infrastructure/db/index";
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
import { createHumanInterviewRound } from "./human-interview-rounds";
import { createHumanInterviewMeeting } from "./human-interview-meetings";
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
  await db
    .update(recruitingNodeState)
    .set({ result: "pass", status: "completed" })
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, candidateId),
        eq(recruitingNodeState.node, "screening"),
      ),
    );
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
describe("immutable submitted interview outcomes", () => {
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
      ["owner", "pass", 409],
      ["owner", "fail", 409],
    ] as const) {
      const response = await app(role).request(path, request(outcome));
      expect(response.status).toBe(status);
    }
  });
  it.each(["pass", "fail", "inconclusive"] as const)(
    "keeps submitted %s immutable without changing snapshots or sync",
    async (outcome) => {
      const input = await fixture();
      await db
        .update(humanInterviewRound)
        .set({ outcome })
        .where(eq(humanInterviewRound.id, input.roundId));
      for (const requested of ["pass", "fail"] as const) {
        await expect(
          resolveHumanInterviewOutcome({ ...input, outcome: requested }, { persist }),
        ).rejects.toMatchObject({ status: 409 });
      }
      const [round] = await db
        .select()
        .from(humanInterviewRound)
        .where(eq(humanInterviewRound.id, input.roundId));
      expect(round).toMatchObject({ evaluation, evaluationStatus: "submitted", outcome });
      const [snapshot] = await db
        .select()
        .from(humanInterviewEvaluationSnapshot)
        .where(eq(humanInterviewEvaluationSnapshot.id, input.snapshotId));
      expect(snapshot).toMatchObject({ evaluation, outcome: "inconclusive" });
      const [sync] = await db
        .select()
        .from(humanInterviewEvaluationDocumentSync)
        .where(eq(humanInterviewEvaluationDocumentSync.snapshotId, input.snapshotId));
      expect(sync.status).toBe("synced");
      const audit = await db
        .select()
        .from(recruitingEvent)
        .where(
          and(
            eq(recruitingEvent.recruitingRecordId, input.interviewRecordId),
            eq(recruitingEvent.action, "human_interview_round_updated"),
          ),
        );
      expect(audit).toHaveLength(0);
    },
  );
  it.each(["second_interview", "final_interview"] as const)(
    "submits an inconclusive evaluation and permits %s",
    async (roundKind) => {
      const input = await fixture();
      await db
        .delete(humanInterviewEvaluationDocumentSync)
        .where(eq(humanInterviewEvaluationDocumentSync.roundId, input.roundId));
      await db
        .update(humanInterviewRound)
        .set({ evaluationStatus: "draft", status: "pending" })
        .where(eq(humanInterviewRound.id, input.roundId));
      await createHumanInterviewMeeting({
        createdBy: actorId,
        input: { roundIds: [input.roundId], title: "待定提交测试" },
        organizationId: orgId,
      });
      expect(
        await submitHumanInterviewEvaluation({
          ...input,
          evaluation,
          meetingSessionId: null,
          outcome: "inconclusive",
          transcriptRevisionId: null,
        }),
      ).toBe(true);
      const [round] = await db
        .select()
        .from(humanInterviewRound)
        .where(eq(humanInterviewRound.id, input.roundId));
      expect(round).toMatchObject({
        evaluationStatus: "submitted",
        outcome: "inconclusive",
        status: "completed",
      });
      const [node] = await db
        .select()
        .from(recruitingNodeState)
        .where(
          and(
            eq(recruitingNodeState.recruitingRecordId, input.interviewRecordId),
            eq(recruitingNodeState.node, "second_interview"),
          ),
        );
      expect(node).toMatchObject({ result: "pass", status: "completed" });
      const next = await createHumanInterviewRound({
        input: {
          format: "online",
          interviewerIds: [],
          label: "业务二面",
          roundKind,
        },
        interviewRecordId: input.interviewRecordId,
        organizationId: orgId,
      });
      expect(next.label).toBe("业务二面");
    },
  );
});
