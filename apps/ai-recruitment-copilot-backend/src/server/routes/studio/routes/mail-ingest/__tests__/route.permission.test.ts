import { describe, expect, it, vi, beforeEach } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import type * as MailIngestDao from "../dao";

const mocks = vi.hoisted(() => ({
  computeWorkspacePermissionSnapshot: vi.fn(),
  listAccountMailMessages: vi.fn(),
  mailIngestAccountExistsInOrg: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/auth", () => ({
  auth: { api: {} },
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/workspace-permission-snapshot", () => ({
  computeWorkspacePermissionSnapshot: mocks.computeWorkspacePermissionSnapshot,
}));
vi.mock("../dao", async (importOriginal) => ({
  ...(await importOriginal<typeof MailIngestDao>()),
  listAccountMailMessages: mocks.listAccountMailMessages,
  mailIngestAccountExistsInOrg: mocks.mailIngestAccountExistsInOrg,
}));

const { mailIngestRouter } = await import("../route");

const app = factory
  .createApp()
  .use(async (c, next) => {
    c.set("activeOrg", { id: "org_1" } as never);
    c.set("member", { role: "admin" } as never);
    c.set("user", { id: "admin_1" } as never);
    await next();
  })
  .route("/mail-ingest-accounts", mailIngestRouter);

describe("managed messages permission (real middleware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mailIngestAccountExistsInOrg.mockResolvedValue(true);
    mocks.listAccountMailMessages.mockResolvedValue({ records: [], total: 0 });
  });

  it("denies (403) when the shared snapshot lacks mailIngestAccount manage", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "admin",
      statements: {
        mailIngestAccount: ["read"],
      },
    });

    const res = await app.request("/mail-ingest-accounts/managed/account_1/messages");

    expect(res.status).toBe(403);
    expect(mocks.computeWorkspacePermissionSnapshot).toHaveBeenCalledWith({
      memberRole: "admin",
      organizationId: "org_1",
      userId: "admin_1",
    });
    expect(mocks.listAccountMailMessages).not.toHaveBeenCalled();
  });

  it("allows (200) when the shared snapshot grants mailIngestAccount manage", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "admin",
      statements: {
        mailIngestAccount: ["create", "read", "update", "delete", "manage"],
      },
    });

    const res = await app.request("/mail-ingest-accounts/managed/account_1/messages");
    expect(res.status).toBe(200);
  });
});
