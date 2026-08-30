import { describe, expect, it, vi, beforeEach } from "vitest";
import { factory } from "@app/server/server/factory";
import { createRequestWorkspaceAuthorizer } from "@app/server/server/access/workspace-access-policy";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { createMailIngestRouter } from "../route";

const mocks = {
  computeWorkspacePermissionSnapshot: vi.fn(),
  listAccountMailMessages: vi.fn(),
  listMailIngestAccounts: vi.fn(),
  mailIngestAccountExistsInOrg: vi.fn(),
};

const mailIngestRouter = createMailIngestRouter({
  listAccountMailMessages: mocks.listAccountMailMessages,
  listMailIngestAccounts: mocks.listMailIngestAccounts,
  mailIngestAccountExistsInOrg: mocks.mailIngestAccountExistsInOrg,
  requireMailIngestPermission: (action) =>
    requirePermission("mailIngestAccount", action, {
      createRequestWorkspaceAuthorizer: (input) =>
        createRequestWorkspaceAuthorizer(input, {
          computeWorkspacePermissionSnapshot: mocks.computeWorkspacePermissionSnapshot,
        }),
    }),
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

describe("managed messages permission (real middleware)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mailIngestAccountExistsInOrg.mockResolvedValue(true);
    mocks.listAccountMailMessages.mockResolvedValue({ records: [], total: 0 });
    mocks.listMailIngestAccounts.mockResolvedValue([]);
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

  it("denies immediate polling without mailIngestAccount manage", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "member",
      statements: {
        mailIngestAccount: ["read"],
      },
    });

    const res = await app.request("/mail-ingest-accounts/managed/poll-now", {
      method: "POST",
    });

    expect(res.status).toBe(403);
  });

  it("denies immediate polling to a custom role even when it has manage permission", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "recruiting-lead",
      statements: {
        mailIngestAccount: ["manage"],
      },
    });

    const res = await app.request("/mail-ingest-accounts/managed/poll-now", {
      headers: { "x-test-member-role": "recruiting-lead" },
      method: "POST",
    });

    expect(res.status).toBe(403);
  });

  it("denies personal account listing when only mailIngestAccount read is granted", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "admin",
      statements: {
        mailIngestAccount: ["read"],
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
