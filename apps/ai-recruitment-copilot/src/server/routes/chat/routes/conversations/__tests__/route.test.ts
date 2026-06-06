import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@/server/factory";

const mocks = vi.hoisted(() => ({
  upsertConversation: vi.fn(),
}));

vi.mock("@/server/routes/chat/dao/chat", () => ({
  checkConversationOwner: vi.fn(),
  deleteUserConversation: vi.fn(),
  getUserConversation: vi.fn(),
  listUserConversations: vi.fn(),
  upsertChatMessage: vi.fn(),
  upsertConversation: mocks.upsertConversation,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { conversationsRouter } from "@/server/routes/chat/routes/conversations/route";

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
});
