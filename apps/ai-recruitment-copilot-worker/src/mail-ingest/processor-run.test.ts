import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMailIngestOnce } from "./processor";
import type { MailIngestConfig } from "./config";

const mocks = vi.hoisted(() => ({
  claimMailIngestAccount: vi.fn(),
  errorListenerCount: 0,
  finishMailIngestAccountRun: vi.fn(),
  listEnabledMailIngestAccounts: vi.fn(),
}));

vi.mock("imapflow", () => ({
  ImapFlow: class MockImapFlow {
    private readonly listeners = new Map<string, unknown[]>();

    on(event: string, listener: unknown) {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    listenerCount(event: string) {
      return this.listeners.get(event)?.length ?? 0;
    }

    connect() {
      mocks.errorListenerCount = this.listenerCount("error");
      return Promise.reject(new Error("IMAP login failed"));
    }
  },
}));

vi.mock("mailparser", () => ({
  simpleParser: vi.fn(),
}));

vi.mock("@arc/resume-parse-queue/resume-parse", () => ({
  enqueueResumeParseJobs: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildAttachmentKeyByHash: vi.fn(),
  putObjectBytes: vi.fn(),
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches",
  () => ({
    insertBatchWithItems: vi.fn(),
    loadBatchDetail: vi.fn(),
  }),
);

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao", () => ({
  claimMailIngestAccount: mocks.claimMailIngestAccount,
  claimMailIngestMessageForProcessing: vi.fn(),
  finishMailIngestAccountRun: mocks.finishMailIngestAccountRun,
  listEnabledMailIngestAccounts: mocks.listEnabledMailIngestAccounts,
  updateMailIngestMessageResult: vi.fn(),
}));

const config: MailIngestConfig = {
  enabled: true,
  intervalMs: 60_000,
  maxAccountsPerRun: 20,
  maxMessagesPerAccount: 10,
};

function account() {
  return {
    dedupPolicy: "skip",
    emailAddress: "hr@example.com",
    failedMailbox: "ARC-Failed",
    id: "account_1",
    imapHost: "imap.example.com",
    imapPort: 993,
    imapSecure: true,
    jdMode: "none",
    jobDescriptionId: null,
    listenStartAt: new Date("2026-06-18T10:00:00.000Z"),
    mailbox: "INBOX",
    organizationId: "org_1",
    password: "secret",
    processedMailbox: "ARC-Processed",
    resumePoolScope: "private",
    subjectKeyword: "boss直聘",
    target: "resume_pool",
    userId: "user_1",
    username: "hr@example.com",
  };
}

describe("runMailIngestOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.errorListenerCount = 0;
    mocks.listEnabledMailIngestAccounts.mockResolvedValue([account()]);
    mocks.claimMailIngestAccount.mockResolvedValue(true);
    mocks.finishMailIngestAccountRun.mockImplementation(() => Promise.resolve());
  });

  it("attaches an IMAP error listener so socket errors do not crash the worker process", async () => {
    const result = await runMailIngestOnce(config);

    expect(mocks.errorListenerCount).toBeGreaterThan(0);
    expect(result).toMatchObject({ accounts: 1, messagesFailed: 1 });
    expect(mocks.finishMailIngestAccountRun).toHaveBeenCalledWith("account_1", expect.any(Error));
  });
});
