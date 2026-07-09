import { describe, expect, it, vi, beforeEach } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { platformRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/platform/route";
import { mailIngestRouter } from "../route";

const mocks = vi.hoisted(() => ({
  MailIngestValidationError: class MailIngestValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MailIngestValidationError";
    }
  },
  createMailIngestAccount: vi.fn(),
  getMailIngestAccountLoginConfig: vi.fn(),
  isWorkspaceMember: vi.fn(),
  listAccountMailMessages: vi.fn(),
  updateWorkspaceMailIngestAccount: vi.fn(),
  validateMailIngestAccountLogin: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao", () => ({
  createMailIngestAccount: mocks.createMailIngestAccount,
  deleteMailIngestAccount: vi.fn(),
  getMailIngestAccountLoginConfig: mocks.getMailIngestAccountLoginConfig,
  isWorkspaceMember: mocks.isWorkspaceMember,
  listAccountMailMessages: mocks.listAccountMailMessages,
  listMailIngestAccounts: vi.fn(),
  queryPaginatedPlatformMailIngestAccounts: vi.fn(),
  queryPaginatedWorkspaceMailIngestAccounts: vi.fn(),
  updateMailIngestAccount: vi.fn(),
  updateWorkspaceMailIngestAccount: mocks.updateWorkspaceMailIngestAccount,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/validation",
  () => ({
    MailIngestValidationError: mocks.MailIngestValidationError,
    mergeMailIngestLoginConfig: (
      existing: Record<string, unknown>,
      input: Record<string, unknown>,
    ) => ({
      ...existing,
      ...input,
    }),
    validateMailIngestAccountLogin: mocks.validateMailIngestAccountLogin,
  }),
);

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("@arc/resume-parse-queue/resume-parse", () => ({
  RESUME_PARSE_JOB_LIST_STATES: ["all", "waiting", "active", "completed", "failed"],
  RESUME_PARSE_QUEUE_NAME: "resume-parse",
  getResumeParseQueueOverview: vi.fn(),
  listResumeParseQueueJobs: vi.fn(),
}));

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
    c.set("activeOrg", { id: "org_1" } as never);
    c.set("member", { role: "admin" } as never);
    c.set("user", { id: "admin_1" } as never);
    await next();
  })
  .route("/mail-ingest-accounts", mailIngestRouter);

const platformApp = factory
  .createApp()
  .use(async (c, next) => {
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
    mocks.createMailIngestAccount.mockResolvedValue({ id: "account_1" });
    mocks.listAccountMailMessages.mockResolvedValue({ records: [], total: 0 });
    mocks.updateWorkspaceMailIngestAccount.mockResolvedValue({ id: "account_1" });
    mocks.validateMailIngestAccountLogin.mockRejectedValue(
      new mocks.MailIngestValidationError("邮箱登录校验失败：Invalid credentials"),
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
      records: [{ id: "msg_1" }],
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
});
