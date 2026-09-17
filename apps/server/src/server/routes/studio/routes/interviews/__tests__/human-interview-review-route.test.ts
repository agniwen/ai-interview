/* oxlint-disable anti-slop/no-module-mocking -- transport regression isolates existing DAO/notification modules; real scope queries are covered by DAO integration tests. */
import type { Context } from "hono";
import { RecruitingPipelineError } from "@app/database/recruiting-pipeline";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../../../factory";
import { createStudioHumanInterviewReviewRouter } from "../review-route";
import { humanInterviewReviewRouter } from "../../../../public/routes/human-interview-review/route";

const mocks = vi.hoisted(() => ({
  deny: "",
  load: vi.fn(),
  permissions: new Array<string>(),
  resolveInvite: vi.fn(),
  review: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
  visibility: vi.fn(),
}));
vi.mock("../../../../../middlewares/permission", () => ({
  requirePermission:
    (resource: string, action: string) => async (_c: Context, next: () => Promise<void>) => {
      mocks.permissions.push(`${resource}:${action}`);
      if (mocks.deny === `${resource}:${action}`) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      await next();
    },
}));
vi.mock("../dao/human-interview-evaluation", () => ({
  loadHumanInterviewReview: mocks.review,
  saveHumanInterviewEvaluationDraft: mocks.save,
}));
vi.mock("../utils/human-interview-evaluation-submission", () => ({
  submitAndFinalizeHumanInterviewEvaluation: mocks.submit,
}));
vi.mock("../dao/human-interview-meetings", () => ({
  resolveHumanInterviewMeetingInterviewerInviteToken: mocks.resolveInvite,
}));
vi.mock("../dao/human-interview-document-sync", () => ({
  createHumanInterviewDocumentSyncDao: () => ({
    loadStatus: () => Promise.resolve(null),
    retry: () => Promise.resolve(true),
  }),
}));

const candidateId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const scope = {
  meetingId: "meeting",
  organizationId: "org",
  pipelineStage: "human_interview",
  role: "host",
  roundId,
  status: "ended",
  userId: "reviewer",
};
const evaluation = {
  detailedAnalysis: "分析",
  evidenceTurnIds: [],
  overallEvaluation: "手动评价",
  professionalSkill: "优",
  rating: "A",
  risks: "待验证",
  rolePosition: "开发",
  salaryRecommendation: "",
  seniorityPosition: "高级",
  strengths: "经验",
};
function app(loggedIn = true) {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      if (loggedIn) {
        // SAFETY: this transport fixture's route only reads the user ID populated by workspace middleware.
        c.set("user", { id: "reviewer" } as never);
        // SAFETY: the mocked authorizer and route only read organization ID.
        c.set("activeOrg", { id: "org" } as never);
        // SAFETY: the injected visibility resolver only reads the member role.
        c.set("member", { role: "member" } as never);
      }
      await next();
    })
    .route(
      "/:id/human-interview-rounds/review",
      createStudioHumanInterviewReviewRouter({ load: mocks.load, visibility: mocks.visibility }),
    );
}
function request(action: string, outcome: string | null = "pass", loggedIn = true) {
  return app(loggedIn).request(
    `/${candidateId}/human-interview-rounds/review/${roundId}/${action}`,
    action === "review"
      ? undefined
      : {
          body: JSON.stringify({
            evaluation,
            outcome: outcome ?? undefined,
            transcriptRevisionId: null,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.deny = "";
  mocks.permissions = [];
  mocks.load.mockResolvedValue(scope);
  mocks.resolveInvite.mockResolvedValue(scope);
  mocks.visibility.mockResolvedValue({ kind: "restricted", userIds: ["reviewer"] });
  mocks.review.mockResolvedValue({
    evaluationStatus: "draft",
    meetingSessionId: null,
    roundId,
    transcript: null,
  });
  mocks.save.mockResolvedValue(true);
  mocks.submit.mockResolvedValue(true);
});
describe("system human interview review", () => {
  it.each([
    ["invalid", 400],
    ["conflict", 409],
    ["not_found", 404],
  ] as const)("returns the pipeline %s error with HTTP %s", async (code, status) => {
    mocks.submit.mockRejectedValue(
      new RecruitingPipelineError("面试状态已变更，请刷新后重试。", code),
    );
    const init = {
      body: JSON.stringify({ evaluation, outcome: "pass", transcriptRevisionId: null }),
      headers: { "content-type": "application/json" },
      method: "POST",
    };
    for (const response of [
      await request("evaluation-submit"),
      await humanInterviewReviewRouter.request(
        "/human-interview-meetings/interviewer/signed-invite/evaluation-submit",
        init,
      ),
    ]) {
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "面试状态已变更，请刷新后重试。" });
    }
  });

  it.each(["studio", "invitation"])(
    "accepts an empty optional overall evaluation through %s",
    async (entry) => {
      const init = {
        body: JSON.stringify({
          evaluation: { ...evaluation, overallEvaluation: "  " },
          outcome: "pass",
          transcriptRevisionId: null,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      };
      const response =
        entry === "studio"
          ? await app().request(
              `/${candidateId}/human-interview-rounds/review/${roundId}/evaluation-submit`,
              init,
            )
          : await humanInterviewReviewRouter.request(
              "/human-interview-meetings/interviewer/signed-invite/evaluation-submit",
              init,
            );
      expect(response.status).toBe(200);
      expect(mocks.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluation: expect.objectContaining({ overallEvaluation: "" }),
          outcome: "pass",
        }),
      );
    },
  );
  it.each(["studio", "invitation"])(
    "accepts unrated drafts but rejects unrated submissions through %s",
    async (entry) => {
      const send = (action: string) => {
        const body = JSON.stringify({
          evaluation: { ...evaluation, draftOutcome: "pass", overallEvaluation: "", rating: null },
          outcome: action === "evaluation-submit" ? "pass" : undefined,
          transcriptRevisionId: null,
        });
        const init = { body, headers: { "content-type": "application/json" }, method: "POST" };
        return entry === "studio"
          ? app().request(
              `/${candidateId}/human-interview-rounds/review/${roundId}/${action}`,
              init,
            )
          : humanInterviewReviewRouter.request(
              `/human-interview-meetings/interviewer/signed-invite/${action}`,
              init,
            );
      };
      const draftResponse = await send("evaluation-draft");
      expect(draftResponse.status).toBe(200);
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluation: { ...evaluation, draftOutcome: "pass", overallEvaluation: "", rating: null },
        }),
      );
      const submitResponse = await send("evaluation-submit");
      expect(submitResponse.status).toBe(400);
      expect(mocks.submit).not.toHaveBeenCalled();
    },
  );

  it("scopes reads to the logged-in actor, workspace, candidate and exact round", async () => {
    const response = await request("review");
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith({
      candidateId,
      organizationId: "org",
      roundId,
      userId: "reviewer",
      visibility: { kind: "restricted", userIds: ["reviewer"] },
    });
    expect(mocks.permissions).toEqual(["resumeLibrary:read", "humanInterview:read"]);
    expect(mocks.resolveInvite).not.toHaveBeenCalled();
  });
  it("allows manual draft save without a transcript, without submitting", async () => {
    const response = await request("evaluation-draft", null);
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "reviewer",
        evaluation,
        roundId,
        transcriptRevisionId: null,
      }),
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("uses the existing finalization workflow for pass/fail only", async () => {
    const invalid = await request("evaluation-submit", "inconclusive");
    expect(invalid.status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
    const response = await request("evaluation-submit", "fail");
    expect(response.status).toBe(200);
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "reviewer",
        outcome: "fail",
        roundId,
        transcriptRevisionId: null,
      }),
    );
    expect(mocks.permissions).toContain("humanInterview:update");
  });
  it("allows an HR with update permission to submit without meeting assignment", async () => {
    mocks.load.mockResolvedValue({ ...scope, canManageReview: true, role: "observer" });
    const response = await request("evaluation-submit", "pass");
    expect(response.status).toBe(200);
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "reviewer", outcome: "pass", roundId }),
    );
  });
  it("denies unauthenticated users, missing scope and permission failures", async () => {
    const unauthorized = await request("review", null, false);
    expect(unauthorized.status).toBe(401);
    mocks.load.mockResolvedValueOnce(null);
    const missing = await request("review");
    expect(missing.status).toBe(404);
    mocks.deny = "humanInterview:update";
    const forbidden = await request("evaluation-submit");
    expect(forbidden.status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it.each([
    { code: 403, patch: { role: "observer" } },
    { code: 409, patch: { status: "cancelled" } },
    { code: 409, patch: { status: "in_progress" } },
    { code: 403, patch: { pipelineStage: "closed" } },
  ])("does not finalize a disallowed meeting state: $patch", async ({ patch, code }) => {
    mocks.load.mockResolvedValue({ ...scope, ...patch });
    const response = await request("evaluation-submit");
    expect(response.status).toBe(code);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("keeps the old invitation review URL working through the same workflow", async () => {
    const response = await humanInterviewReviewRouter.request(
      "/human-interview-meetings/interviewer/signed-invite/evaluation-submit",
      {
        body: JSON.stringify({ evaluation, outcome: "pass", transcriptRevisionId: null }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    expect(response.status).toBe(200);
    expect(mocks.resolveInvite).toHaveBeenCalledWith("signed-invite");
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "pass", roundId }),
    );
  });
});
