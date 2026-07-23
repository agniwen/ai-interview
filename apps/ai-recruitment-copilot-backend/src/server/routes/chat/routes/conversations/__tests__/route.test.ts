import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  checkConversationOwner: vi.fn(),
  confirmRecruitingAction: vi.fn(),
  createRequestWorkspaceAuthorizer: vi.fn(),
  loadResumeDetail: vi.fn(),
  loadResumePoolItem: vi.fn(),
  resolveRecruitingVisibilityScope: vi.fn(),
  upsertConversation: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy", () => ({
  createRequestWorkspaceAuthorizer: mocks.createRequestWorkspaceAuthorizer,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  resolveRecruitingVisibilityScope: mocks.resolveRecruitingVisibilityScope,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes",
  () => ({
    loadResumeDetail: mocks.loadResumeDetail,
  }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao", () => ({
  loadResumePoolItem: mocks.loadResumePoolItem,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat", () => ({
  checkConversationOwner: mocks.checkConversationOwner,
  deleteUserConversation: vi.fn(),
  getUserConversation: vi.fn(),
  listUserConversations: vi.fn(),
  upsertChatMessage: vi.fn(),
  upsertConversation: mocks.upsertConversation,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/chat/routes/conversations/actions",
  () => ({
    confirmRecruitingAction: mocks.confirmRecruitingAction,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { conversationsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/routes/conversations/route";

const USER_ID = "user_conversations_route";
const ORG_ID = "org_conversations_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("user", { id: USER_ID } as never);
      c.set("activeOrg", { id: ORG_ID } as never);
      await next();
    })
    .route("/conversations", conversationsRouter);
}

async function jsonOf(res: Response) {
  return (await res.json()) as { error?: unknown; ok?: boolean };
}

describe("conversationsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRequestWorkspaceAuthorizer.mockReturnValue(mocks.authorize);
    mocks.loadResumeDetail.mockResolvedValue({ id: "resume-1" });
    mocks.loadResumePoolItem.mockResolvedValue({ id: "pool-1" });
    mocks.resolveRecruitingVisibilityScope.mockResolvedValue({ kind: "all" });
  });

  it("returns a normalized string error for invalid conversation create payloads", async () => {
    const res = await makeApp().request("/conversations", {
      body: JSON.stringify({ title: "missing id" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
    const json = await jsonOf(res);
    expect(typeof json.error).toBe("string");
    expect(mocks.upsertConversation).not.toHaveBeenCalled();
  });

  it("returns explicit 200 responses for successful conversation writes", async () => {
    mocks.upsertConversation.mockResolvedValue({ id: "conversation_1" });

    const res = await makeApp().request("/conversations", {
      body: JSON.stringify({ id: "conversation_1", title: "新对话" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(200);
    await expect(jsonOf(res)).resolves.toEqual({ ok: true });
  });

  it("confirms recruiting actions only after conversation ownership is checked", async () => {
    mocks.checkConversationOwner.mockResolvedValue("ok");
    mocks.confirmRecruitingAction.mockResolvedValue({
      actionType: "bind_candidate_to_job",
      message: "已绑定候选人到岗位。",
      status: "executed",
    });

    const res = await makeApp().request("/conversations/conversation_1/actions/confirm", {
      body: JSON.stringify({
        proposal: {
          explanation: "候选人与岗位匹配。",
          id: "proposal-1",
          payload: {
            jobDescriptionId: "jd-1",
            resumeRecordId: "resume-1",
          },
          title: "绑定岗位",
          type: "bind_candidate_to_job",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(mocks.checkConversationOwner).toHaveBeenCalledWith(USER_ID, "conversation_1", ORG_ID);
    expect(mocks.confirmRecruitingAction).toHaveBeenCalledWith(
      expect.objectContaining({
        authorize: mocks.authorize,
        operatorId: USER_ID,
        organizationId: ORG_ID,
        visibilityScope: { kind: "all" },
      }),
    );
    await expect(res.json()).resolves.toEqual({
      actionType: "bind_candidate_to_job",
      message: "已绑定候选人到岗位。",
      status: "executed",
    });
  });

  it("does not execute recruiting actions for conversations outside the workspace", async () => {
    mocks.checkConversationOwner.mockResolvedValue("forbidden");

    const res = await makeApp().request("/conversations/conversation_2/actions/confirm", {
      body: JSON.stringify({
        proposal: {
          explanation: "候选人与岗位匹配。",
          id: "proposal-1",
          payload: {
            jobDescriptionId: "jd-1",
            resumeRecordId: "resume-1",
          },
          title: "绑定岗位",
          type: "bind_candidate_to_job",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(403);
    expect(mocks.confirmRecruitingAction).not.toHaveBeenCalled();
  });
});
