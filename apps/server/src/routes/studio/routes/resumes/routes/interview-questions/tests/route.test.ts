import { beforeEach, describe, expect, it, vi } from "vitest";
import { db as defaultDb } from "../../../../../../../infrastructure/db/index";
import { factory } from "../../../../../../../factory";
import type { InterviewQuestionsRouterDependencies } from "../route";
import { createInterviewQuestionsRouter } from "../route";
import type * as recruitingRecords from "@app/recruiting/records";

interface QuestionUpdatePatch {
  interviewQuestions?: unknown[];
  updatedAt?: Date;
}

const updates: QuestionUpdatePatch[] = [];

// Record persistence lives in @app/recruiting; this route test verifies the patch it hands over.
const recruitingRecordStubs = vi.hoisted(() => ({ update: vi.fn() }));
// oxlint-disable-next-line anti-slop/no-module-mocking -- The route imports the recruiting domain writer directly; injecting it would widen the router dependency contract only for tests.
vi.mock("@app/recruiting/records", async (importOriginal) => ({
  ...(await importOriginal<typeof recruitingRecords>()),
  updateRecruitingRecords: recruitingRecordStubs.update,
}));
const mocks = {
  loadResumeDetail: vi.fn(),
  permissionChecks: new Array<[string, string]>(),
  resolveRecruitingVisibilityScope: vi.fn(),
};

const requirePermission: InterviewQuestionsRouterDependencies["requirePermission"] =
  (resource, action) => (_c, next) => {
    mocks.permissionChecks.push([resource, action]);
    return next();
  };

const router = createInterviewQuestionsRouter({
  db: defaultDb,

  loadResumeDetail: mocks.loadResumeDetail,
  requirePermission,
  resolveRecruitingVisibilityScope: mocks.resolveRecruitingVisibilityScope,
});

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: The test supplies the request context fields read by the route.
      c.set("activeOrg", { id: "org-1" } as never);
      // SAFETY: The test supplies the request context fields read by the route.
      c.set("member", { role: "owner" } as never);
      // SAFETY: The test supplies the request context fields read by the route.
      c.set("user", { id: "user-1" } as never);
      await next();
    })
    .route("/resumes", router);
}

describe("recommended interview questions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    mocks.permissionChecks.length = 0;
    mocks.resolveRecruitingVisibilityScope.mockResolvedValue({ kind: "all" });
    mocks.loadResumeDetail.mockResolvedValue({ id: "candidate-1" });
    recruitingRecordStubs.update.mockImplementation(
      (...args: Parameters<typeof recruitingRecords.updateRecruitingRecords>) => {
        const patch = args.at(2);
        // SAFETY: Route patches are recruiting record values; the test inspects the fields it sent.
        updates.push(patch as QuestionUpdatePatch);
        return Promise.resolve();
      },
    );
  });

  it("persists edited questions and defaults legacy missing dimensions to business", async () => {
    const response = await makeApp().request("/resumes/candidate-1/interview-questions", {
      body: JSON.stringify({
        interviewQuestions: [
          {
            difficulty: "hard",
            evaluationFocus: "技术决策",
            followUpDirections: "追问权衡",
            order: 1,
            question: "请介绍一次关键技术决策。",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(mocks.permissionChecks).toContainEqual(["resumeLibrary", "update"]);
    expect(mocks.loadResumeDetail).toHaveBeenCalledWith("candidate-1", "org-1", {
      kind: "all",
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        interviewQuestions: [
          expect.objectContaining({
            dimension: "business",
            question: "请介绍一次关键技术决策。",
          }),
        ],
      }),
    );
  });

  it("rejects an empty question before writing", async () => {
    const response = await makeApp().request("/resumes/candidate-1/interview-questions", {
      body: JSON.stringify({
        interviewQuestions: [{ difficulty: "medium", order: 1, question: "" }],
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});
