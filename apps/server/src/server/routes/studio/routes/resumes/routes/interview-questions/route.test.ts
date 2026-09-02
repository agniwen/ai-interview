import { beforeEach, describe, expect, it, vi } from "vitest";
import { db as defaultDb } from "@server/lib/server/db/index";
import { factory } from "../../../../../../factory";
import type { InterviewQuestionsRouterDependencies } from "./route";
import { createInterviewQuestionsRouter } from "./route";

interface QuestionUpdatePatch {
  interviewQuestions?: unknown[];
  updatedAt?: Date;
}

const updates: QuestionUpdatePatch[] = [];
const mocks = {
  invalidateStudioInterviewCaches: vi.fn(),
  loadResumeDetail: vi.fn(),
  permissionChecks: new Array<[string, string]>(),
  resolveRecruitingVisibilityScope: vi.fn(),
};

const requirePermission: InterviewQuestionsRouterDependencies["requirePermission"] =
  (resource, action) => (_c, next) => {
    mocks.permissionChecks.push([resource, action]);
    return next();
  };

// SAFETY: The test double inherits the full Drizzle client and overrides only the update chain used by this route.
const testDb = Object.assign(Object.create(defaultDb) as typeof defaultDb, {
  update: () => ({
    set: (patch: QuestionUpdatePatch) => {
      updates.push(patch);
      return { where: () => Promise.resolve() };
    },
  }),
});

const router = createInterviewQuestionsRouter({
  db: testDb,
  invalidateStudioInterviewCaches: mocks.invalidateStudioInterviewCaches,
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
    expect(mocks.invalidateStudioInterviewCaches).toHaveBeenCalledWith("org-1");
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
