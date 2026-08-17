import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createPlatformRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/platform/route";
import type { PlatformMailIngestDependencies } from "@arc/ai-recruitment-copilot-backend/server/routes/platform/route";
import type { MailIngestAccountDto, WorkspaceMailIngestAccountRow } from "../dao";
import type { MailMessageLogRecord } from "../dao/messages";
import { MailIngestValidationError } from "../validation";
import { createMailIngestRouter } from "../route";
import type { MailIngestRouteDependencies } from "../route";

const mocks = {
  createMailIngestAccount: vi.fn<MailIngestRouteDependencies["createMailIngestAccount"]>(),
  deleteMailIngestAccount: vi.fn<MailIngestRouteDependencies["deleteMailIngestAccount"]>(),
  getMailIngestAccountLoginConfig:
    vi.fn<MailIngestRouteDependencies["getMailIngestAccountLoginConfig"]>(),
  getWorkspaceMailIngestAccount:
    vi.fn<MailIngestRouteDependencies["getWorkspaceMailIngestAccount"]>(),
  isWorkspaceMember: vi.fn<MailIngestRouteDependencies["isWorkspaceMember"]>(),
  listAccountMailMessages: vi.fn<MailIngestRouteDependencies["listAccountMailMessages"]>(),
  listMailIngestAccounts: vi.fn<MailIngestRouteDependencies["listMailIngestAccounts"]>(),
  mailIngestAccountExistsInOrg:
    vi.fn<MailIngestRouteDependencies["mailIngestAccountExistsInOrg"]>(),
  queryPaginatedPlatformMailIngestAccounts:
    vi.fn<PlatformMailIngestDependencies["queryPaginatedPlatformMailIngestAccounts"]>(),
  queryPaginatedWorkspaceMailIngestAccounts:
    vi.fn<MailIngestRouteDependencies["queryPaginatedWorkspaceMailIngestAccounts"]>(),
  updateMailIngestAccount: vi.fn<MailIngestRouteDependencies["updateMailIngestAccount"]>(),
  updateWorkspaceMailIngestAccount:
    vi.fn<MailIngestRouteDependencies["updateWorkspaceMailIngestAccount"]>(),
  validateMailIngestAccountLogin:
    vi.fn<MailIngestRouteDependencies["validateMailIngestAccountLogin"]>(),
};

const dependencies: MailIngestRouteDependencies = {
  ...mocks,
  requireMailIngestPermission: () =>
    factory.createMiddleware(async (c, next) => {
      if (c.req.header("x-test-permission") === "deny") {
        return c.json({ message: "Forbidden" }, 403);
      }
      return await next();
    }),
};

const platformDependencies: PlatformMailIngestDependencies = {
  createMailIngestAccount: mocks.createMailIngestAccount,
  getMailIngestAccountLoginConfig: mocks.getMailIngestAccountLoginConfig,
  isWorkspaceMember: mocks.isWorkspaceMember,
  queryPaginatedPlatformMailIngestAccounts: mocks.queryPaginatedPlatformMailIngestAccounts,
  updateWorkspaceMailIngestAccount: mocks.updateWorkspaceMailIngestAccount,
  validateMailIngestAccountLogin: mocks.validateMailIngestAccountLogin,
};

const mailIngestRouter = createMailIngestRouter(dependencies);
const platformRouter = createPlatformRouter({ mailIngest: platformDependencies });

const account: MailIngestAccountDto = {
  createdAt: "2026-08-18T00:00:00.000Z",
  emailAddress: "listener@example.com",
  enabled: true,
  failedMailbox: "ARC-Failed",
  hasPassword: true,
  id: "account_1",
  imapHost: "imap.example.com",
  imapPort: 993,
  imapSecure: true,
  lastCheckedAt: null,
  lastError: null,
  listenStartAt: null,
  mailbox: "INBOX",
  processedMailbox: "ARC-Processed",
  subjectKeyword: "boss直聘",
  updatedAt: "2026-08-18T00:00:00.000Z",
  username: "listener@example.com",
};

const workspaceAccount: WorkspaceMailIngestAccountRow = {
  account,
  lastRunFailed: 0,
  lastRunMatched: 0,
  lastRunQueued: 0,
  lastRunReceived: 0,
  lastRunSubjectSkipped: 0,
  messageCount: 0,
  problemCount: 0,
  user: {
    email: "listener@example.com",
    id: "user_1",
    image: null,
    name: "Listener",
    role: "admin",
  },
};

const mailMessage: MailMessageLogRecord = {
  attachmentCount: 0,
  attachments: [],
  boundJobDescriptionName: null,
  errorMessage: null,
  fromAddress: "sender@example.com",
  id: "msg_1",
  jdBindStatus: null,
  poolSummary: null,
  receivedAt: "2026-08-18T00:00:00.000Z",
  resumeAttachmentCount: 0,
  skipReason: null,
  status: "queued",
  subject: "简历",
};

function makePayload() {
  return {
    emailAddress: "listener@example.com",
    enabled: true,
    failedMailbox: "ARC-Failed",
    imapHost: "imap.example.com",
    imapPort: 993,
    imapSecure: true,
    mailbox: "INBOX",
    password: "secret",
    processedMailbox: "ARC-Processed",
    subjectKeyword: "boss直聘",
    userId: "user_1",
    username: "listener@example.com",
  };
}

const app = factory
  .createApp()
  .use(async (c, next) => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    c.set("activeOrg", { id: "org_1" } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    c.set("member", { role: "admin" } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    c.set("user", { id: "admin_1" } as never);
    await next();
  })
  .route("/mail-ingest-accounts", mailIngestRouter);

const platformApp = factory
  .createApp()
  .use(async (c, next) => {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    c.set("user", { id: "superadmin_1", role: "admin" } as never);
    await next();
  })
  .route("/platform", platformRouter);

describe("mailIngestRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMailIngestAccountLoginConfig.mockResolvedValue({
      imapHost: "imap.example.com",
      imapPort: 993,
      imapSecure: true,
      mailbox: "INBOX",
      password: "old-secret",
      username: "listener@example.com",
    });
    mocks.isWorkspaceMember.mockResolvedValue(true);
    mocks.getWorkspaceMailIngestAccount.mockResolvedValue(workspaceAccount);
    mocks.createMailIngestAccount.mockResolvedValue(account);
    mocks.listAccountMailMessages.mockResolvedValue({ records: [], total: 0 });
    mocks.mailIngestAccountExistsInOrg.mockResolvedValue(true);
    mocks.updateWorkspaceMailIngestAccount.mockResolvedValue(account);
    mocks.validateMailIngestAccountLogin.mockRejectedValue(
      new MailIngestValidationError("邮箱登录校验失败：Invalid credentials"),
    );
  });

  it("rejects managed create when the IMAP login cannot be validated", async () => {
    const res = await app.request("/mail-ingest-accounts/managed", {
      body: JSON.stringify(makePayload()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("邮箱登录校验失败");
    expect(mocks.createMailIngestAccount).not.toHaveBeenCalled();
  });

  it("rejects managed update when the IMAP login cannot be validated", async () => {
    const res = await app.request("/mail-ingest-accounts/managed/account_1", {
      body: JSON.stringify({
        imapHost: "imap.changed.example.com",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("邮箱登录校验失败");
    expect(mocks.validateMailIngestAccountLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        imapHost: "imap.changed.example.com",
        password: "old-secret",
      }),
    );
    expect(mocks.updateWorkspaceMailIngestAccount).not.toHaveBeenCalled();
  });

  it("rejects platform create when the IMAP login cannot be validated", async () => {
    const res = await platformApp.request("/platform/mail-ingest-accounts", {
      body: JSON.stringify({
        ...makePayload(),
        organizationId: "org_1",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("邮箱登录校验失败");
    expect(mocks.createMailIngestAccount).not.toHaveBeenCalled();
  });

  it("rejects platform update when the IMAP login cannot be validated", async () => {
    const res = await platformApp.request("/platform/mail-ingest-accounts/account_1", {
      body: JSON.stringify({
        organizationId: "org_1",
        username: "changed@example.com",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("邮箱登录校验失败");
    expect(mocks.validateMailIngestAccountLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        password: "old-secret",
        username: "changed@example.com",
      }),
    );
    expect(mocks.updateWorkspaceMailIngestAccount).not.toHaveBeenCalled();
  });

  it("returns mail messages for an account owned by the current user", async () => {
    mocks.listAccountMailMessages.mockResolvedValue({
      records: [mailMessage],
      total: 1,
    });

    const res = await app.request("/mail-ingest-accounts/account_1/messages");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(mocks.getMailIngestAccountLoginConfig).toHaveBeenCalledWith({
      id: "account_1",
      organizationId: "org_1",
      userId: "admin_1",
    });
    expect(mocks.listAccountMailMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account_1",
        organizationId: "org_1",
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it("returns 404 for mail messages when the account is not owned by the current user", async () => {
    mocks.getMailIngestAccountLoginConfig.mockResolvedValue(null);

    const res = await app.request("/mail-ingest-accounts/account_2/messages");

    expect(res.status).toBe(404);
    expect(mocks.listAccountMailMessages).not.toHaveBeenCalled();
  });

  it("managed messages: manage user drills into any org account (org-scoped, no userId)", async () => {
    mocks.listAccountMailMessages.mockResolvedValue({ records: [mailMessage], total: 1 });

    const res = await app.request("/mail-ingest-accounts/managed/account_9/messages");

    expect(res.status).toBe(200);
    expect(mocks.mailIngestAccountExistsInOrg).toHaveBeenCalledWith({
      id: "account_9",
      organizationId: "org_1",
    });
    expect(mocks.listAccountMailMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "account_9",
        organizationId: "org_1",
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it("returns the managed account detail used by the log page", async () => {
    const res = await app.request("/mail-ingest-accounts/managed/account_1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(workspaceAccount);
    expect(mocks.getWorkspaceMailIngestAccount).toHaveBeenCalledWith("org_1", "account_1");
  });

  it("returns 404 when the managed account detail is outside the workspace", async () => {
    mocks.getWorkspaceMailIngestAccount.mockResolvedValue(null);

    const res = await app.request("/mail-ingest-accounts/managed/account_x");

    expect(res.status).toBe(404);
  });

  it("managed messages: 404 when account not in org", async () => {
    mocks.mailIngestAccountExistsInOrg.mockResolvedValue(false);

    const res = await app.request("/mail-ingest-accounts/managed/account_x/messages");

    expect(res.status).toBe(404);
    expect(mocks.listAccountMailMessages).not.toHaveBeenCalled();
  });
});
