import { describe, expect, it, vi, beforeEach } from "vitest";
import { factory } from "../../../../../factory";
import { createRequestWorkspaceAuthorizer } from "../../../../../access/workspace-access-policy";
import { requirePermission } from "../../../../../middlewares/permission";
import { createMailIngestRouter } from "../route";

const mocks = {
  computeWorkspacePermissionSnapshot: vi.fn(),
  listAccountMailMessages: vi.fn(),
  listMailIngestAccounts: vi.fn(),
};

const mailIngestRouter = createMailIngestRouter({
  listAccountMailMessages: mocks.listAccountMailMessages,
  listMailIngestAccounts: mocks.listMailIngestAccounts,
  requireResumeEmailIngestPermission: (action) =>
    requirePermission("resumeEmailIngest", action, {
      createRequestWorkspaceAuthorizer: (input) =>
        createRequestWorkspaceAuthorizer(input, {
          computeWorkspacePermissionSnapshot: mocks.computeWorkspacePermissionSnapshot,
        }),
    }),
});

const app = factory
  .createApp()
  .use(async (c, next) => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    c.set("activeOrg", { id: "org_1" } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    c.set("member", { role: c.req.header("x-test-member-role") ?? "admin" } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    c.set("user", { id: "admin_1" } as never);
    await next();
  })
  .route("/mail-ingest-accounts", mailIngestRouter);

describe("personal mail ingest permission (real middleware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAccountMailMessages.mockResolvedValue({ records: [], total: 0 });
    mocks.listMailIngestAccounts.mockResolvedValue([]);
  });

  it("denies personal account listing without resumeEmailIngest read", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "interviewer",
      statements: {
        page: ["calendar", "me"],
      },
    });

    const res = await app.request("/mail-ingest-accounts");

    expect(res.status).toBe(403);
    expect(mocks.listMailIngestAccounts).not.toHaveBeenCalled();
  });

  it("allows personal account listing when resumeEmailIngest read is granted", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "member",
      statements: {
        resumeEmailIngest: ["read"],
      },
    });

    const res = await app.request("/mail-ingest-accounts");

    expect(res.status).toBe(200);
    expect(mocks.listMailIngestAccounts).toHaveBeenCalledWith("org_1", "admin_1");
  });
});
