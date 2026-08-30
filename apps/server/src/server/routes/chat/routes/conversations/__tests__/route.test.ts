import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceAuthorizer } from "@app/server/server/access/workspace-access-policy";
import { factory } from "@app/server/server/factory";
import { createConversationsRouter } from "@app/server/server/routes/chat/routes/conversations/route";
import type { ConversationsRouteDependencies } from "@app/server/server/routes/chat/routes/conversations/route";

const authorize = vi.fn<WorkspaceAuthorizer>();
const mocks = {
  checkConversationOwner: vi.fn<ConversationsRouteDependencies["checkConversationOwner"]>(),
  confirmRecruitingAction: vi.fn<ConversationsRouteDependencies["confirmRecruitingAction"]>(),
  createRequestWorkspaceAuthorizer:
    vi.fn<ConversationsRouteDependencies["createRequestWorkspaceAuthorizer"]>(),
  deleteUserConversation: vi.fn<ConversationsRouteDependencies["deleteUserConversation"]>(),
  getUserConversation: vi.fn<ConversationsRouteDependencies["getUserConversation"]>(),
  listUserConversations: vi.fn<ConversationsRouteDependencies["listUserConversations"]>(),
  loadResumeDetail: vi.fn<ConversationsRouteDependencies["loadResumeDetail"]>(),
  loadResumePoolItem: vi.fn<ConversationsRouteDependencies["loadResumePoolItem"]>(),
  resolveRecruitingVisibilityScope:
    vi.fn<ConversationsRouteDependencies["resolveRecruitingVisibilityScope"]>(),
  upsertChatMessage: vi.fn<ConversationsRouteDependencies["upsertChatMessage"]>(),
  upsertConversation: vi.fn<ConversationsRouteDependencies["upsertConversation"]>(),
};

const dependencies: ConversationsRouteDependencies = {
  ...mocks,
  requireResumeLibraryUpdatePermission: factory.createMiddleware(async (c, next) => {
    if (c.req.header("x-test-permission") === "deny") {
      return c.json({ message: "Forbidden" }, 403);
    }
    return await next();
  }),
};

const USER_ID = "user_conversations_route";
const ORG_ID = "org_conversations_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: USER_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORG_ID } as never);
      await next();
    })
    .route("/conversations", createConversationsRouter(dependencies));
}

async function jsonOf(res: Response) {
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return (await res.json()) as { error?: unknown; ok?: boolean };
}

describe("conversationsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRequestWorkspaceAuthorizer.mockReturnValue(authorize);
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
    expect(json.error).toEqual(expect.any(String));
    expect(mocks.upsertConversation).not.toHaveBeenCalled();
  });

  it("returns explicit 200 responses for successful conversation writes", async () => {
    mocks.upsertConversation.mockResolvedValue("ok");

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
      message: "已在本对话中将该候选人关联到所选岗位（仅影响本轮分析，未改招聘台数据）。",
      status: "executed",
    });

    const res = await makeApp().request("/conversations/conversation_1/actions/confirm", {
      body: JSON.stringify({
        decision: "ignore",
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
        authorize,
        conversationId: "conversation_1",
        operatorId: USER_ID,
        organizationId: ORG_ID,
        visibilityScope: { kind: "all" },
      }),
    );
    await expect(res.json()).resolves.toEqual({
      actionType: "bind_candidate_to_job",
      message: "已在本对话中将该候选人关联到所选岗位（仅影响本轮分析，未改招聘台数据）。",
      status: "executed",
    });
  });

  it("does not execute recruiting actions for conversations outside the workspace", async () => {
    mocks.checkConversationOwner.mockResolvedValue("forbidden");

    const res = await makeApp().request("/conversations/conversation_2/actions/confirm", {
      body: JSON.stringify({
        decision: "ignore",
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
