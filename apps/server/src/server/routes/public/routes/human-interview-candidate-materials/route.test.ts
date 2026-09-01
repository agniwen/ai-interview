import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../../factory";
import { createHumanInterviewCandidateMaterialsRouter } from "./route";
import type { HumanInterviewCandidateMaterialsRouterDependencies } from "./route";

// SAFETY: The route mocks only read meetingId and organizationId from this authorized scope.
const scope = {
  meetingId: "meeting-1",
  organizationId: "organization-1",
} as never;

const mocks = {
  authorize: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["authorize"]>(),
  createPptxPreviewPdfResponse:
    vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["createPptxPreviewPdfResponse"]>(),
  getObjectBytes: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["getObjectBytes"]>(),
  getObjectStream: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["getObjectStream"]>(),
  listCandidates: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["listCandidates"]>(),
  loadAiEvaluation: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["loadAiEvaluation"]>(),
  loadHrInformation:
    vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["loadHrInformation"]>(),
  loadOverview: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["loadOverview"]>(),
  loadQuestions: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["loadQuestions"]>(),
  loadResume: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["loadResume"]>(),
  recordView: vi.fn<HumanInterviewCandidateMaterialsRouterDependencies["recordView"]>(),
};

function makeApp(userId: string | null) {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // Simulate both session states to prove that bearer-link access is session-independent.
      // SAFETY: The route deliberately ignores all user fields; the stub only marks session presence.
      c.set("user", userId ? ({ id: userId } as never) : null);
      await next();
    })
    .route("/human-interview-meetings", createHumanInterviewCandidateMaterialsRouter(mocks));
}

describe("human interview candidate materials routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ scope, status: "authorized" });
    mocks.recordView.mockResolvedValue();
  });

  it("uses the interviewer invite link as a bearer credential without requiring sign-in", async () => {
    mocks.listCandidates.mockResolvedValue([]);

    const response = await makeApp(null).request("/human-interview-meetings/token");

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith({ inviteToken: "token" });
  });

  it("does not bind candidate-material access to an unrelated signed-in account", async () => {
    mocks.listCandidates.mockResolvedValue([]);

    const response = await makeApp("another-user").request("/human-interview-meetings/token");

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith({ inviteToken: "token" });
  });

  it.each([
    "/human-interview-meetings/token/candidate-1",
    "/human-interview-meetings/token/candidate-1/ai-evaluation",
    "/human-interview-meetings/token/candidate-1/hr-initial-information",
    "/human-interview-meetings/token/candidate-1/interview-questions",
    "/human-interview-meetings/token/candidate-1/resume",
    "/human-interview-meetings/token/candidate-1/resume-preview.pdf",
  ])("authorizes anonymous access before resolving %s", async (path) => {
    const response = await makeApp(null).request(path);

    expect(response.status).toBe(404);
    expect(mocks.authorize).toHaveBeenCalledWith({ inviteToken: "token" });
  });

  it("lists every candidate attached to the authorized meeting", async () => {
    mocks.listCandidates.mockResolvedValue([
      {
        candidateName: "候选人甲",
        id: "candidate-1",
        rounds: [{ id: "round-1", label: "技术复面" }],
        targetRole: "后端工程师",
      },
      {
        candidateName: "候选人乙",
        id: "candidate-2",
        rounds: [{ id: "round-2", label: "技术复面" }],
        targetRole: "前端工程师",
      },
    ]);

    const response = await makeApp("interviewer-1").request("/human-interview-meetings/token");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      candidates: [{ id: "candidate-1" }, { id: "candidate-2" }],
      meetingId: "meeting-1",
    });
    expect(mocks.listCandidates).toHaveBeenCalledWith(scope);
  });

  it("records the first-view audit only after resolving a meeting candidate", async () => {
    mocks.loadOverview.mockResolvedValue({
      candidate: {
        candidateEmail: null,
        candidateName: "候选人甲",
        candidatePhone: null,
        creatorName: null,
        hasResumeFile: false,
        id: "candidate-1",
        jobDescriptionName: null,
        resumeFileName: null,
        resumeProfile: null,
        targetRole: null,
      },
    });

    const response = await makeApp("interviewer-1").request(
      "/human-interview-meetings/token/candidate-1",
    );

    expect(response.status).toBe(200);
    expect(mocks.recordView).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      scope,
    });
  });

  it("does not audit an id outside the meeting", async () => {
    mocks.loadOverview.mockResolvedValue(null);

    const response = await makeApp("interviewer-1").request(
      "/human-interview-meetings/token/not-in-meeting",
    );

    expect(response.status).toBe(404);
    expect(mocks.recordView).not.toHaveBeenCalled();
  });
});
