import { simpleParser } from "mailparser";
import { enqueueResumeParseJobs } from "@arc/resume-parse-queue/resume-parse";
import {
  buildAttachmentKeyByHash,
  putObjectBytes,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { fetchJobDescriptionsByCodes } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  claimMailIngestMessageForProcessing,
  updateMailIngestMessageResult,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import {
  insertBatchWithItems,
  loadBatchDetail,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMailIngestOnce } from "./processor";
import type { MailIngestConfig } from "./config";

const mocks = vi.hoisted(() => ({
  claimMailIngestAccount: vi.fn(),
  connect: vi.fn(),
  errorListenerCount: 0,
  fetchOne: vi.fn(),
  finishMailIngestAccountRun: vi.fn(),
  getMailboxLock: vi.fn(),
  listEnabledMailIngestAccounts: vi.fn(),
  logout: vi.fn(),
  markMailIngestMessageSkipped: vi.fn(),
  search: vi.fn(),
}));

vi.mock("imapflow", () => ({
  ImapFlow: class MockImapFlow {
    mailbox = { uidValidity: "uid-validity-1" };
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

    readInstanceState() {
      return this.listeners.size;
    }

    connect() {
      mocks.errorListenerCount = this.listenerCount("error");
      return mocks.connect();
    }

    fetchOne(...args: unknown[]) {
      this.readInstanceState();
      return mocks.fetchOne(...args);
    }

    getMailboxLock(...args: unknown[]) {
      this.readInstanceState();
      return mocks.getMailboxLock(...args);
    }

    logout(...args: unknown[]) {
      this.readInstanceState();
      return mocks.logout(...args);
    }

    search(...args: unknown[]) {
      this.readInstanceState();
      return mocks.search(...args);
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

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao",
  () => ({
    fetchJobDescriptionsByCodes: vi.fn(),
  }),
);

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao", () => ({
  claimMailIngestAccount: mocks.claimMailIngestAccount,
  claimMailIngestMessageForProcessing: vi.fn(),
  finishMailIngestAccountRun: mocks.finishMailIngestAccountRun,
  listEnabledMailIngestAccounts: mocks.listEnabledMailIngestAccounts,
  markMailIngestMessageSkipped: mocks.markMailIngestMessageSkipped,
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
    mocks.connect.mockRejectedValue(new Error("IMAP login failed"));
    mocks.listEnabledMailIngestAccounts.mockResolvedValue([account()]);
    mocks.claimMailIngestAccount.mockResolvedValue(true);
    mocks.finishMailIngestAccountRun.mockImplementation(() => Promise.resolve());
    mocks.fetchOne.mockResolvedValue(null);
    mocks.getMailboxLock.mockResolvedValue({ release: vi.fn() });
    mocks.logout.mockImplementation(() => Promise.resolve());
    mocks.markMailIngestMessageSkipped.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([]);
    vi.mocked(buildAttachmentKeyByHash).mockResolvedValue("resumes/hash.pdf");
    vi.mocked(claimMailIngestMessageForProcessing).mockResolvedValue({
      id: "message_1",
      moveTo: null,
      shouldProcess: true,
      status: "processing",
    });
    vi.mocked(enqueueResumeParseJobs).mockImplementation(() => Promise.resolve());
    vi.mocked(fetchJobDescriptionsByCodes).mockResolvedValue([]);
    vi.mocked(insertBatchWithItems).mockResolvedValue("batch_1");
    vi.mocked(loadBatchDetail).mockResolvedValue({
      batch: { id: "batch_1" },
      items: [{ id: "item_1" }],
    } as unknown as Awaited<ReturnType<typeof loadBatchDetail>>);
    vi.mocked(putObjectBytes).mockImplementation(() => Promise.resolve());
    vi.mocked(simpleParser).mockResolvedValue({
      attachments: [],
      subject: "【BOSS直聘】王泽投递 前端工程师",
    } as unknown as Awaited<ReturnType<typeof simpleParser>>);
    vi.mocked(updateMailIngestMessageResult).mockImplementation(() => Promise.resolve());
  });

  it("attaches an IMAP error listener so socket errors do not crash the worker process", async () => {
    const result = await runMailIngestOnce(config);

    expect(mocks.errorListenerCount).toBeGreaterThan(0);
    expect(result).toMatchObject({ accounts: 1, messagesFailed: 1 });
    expect(mocks.finishMailIngestAccountRun).toHaveBeenCalledWith(
      "account_1",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("binds an imported resume batch to the single job matched from the mail subject code", async () => {
    mocks.connect.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([101]);
    mocks.fetchOne.mockResolvedValue({
      envelope: { subject: "【BOSS直聘】王泽投递 AUR00AZ 前端工程师" },
      internalDate: new Date("2026-06-18T10:01:00.000Z"),
      source: Buffer.from("raw message"),
    });
    vi.mocked(simpleParser).mockResolvedValue({
      attachments: [
        {
          content: Buffer.from("resume"),
          contentDisposition: "attachment",
          contentType: "application/pdf",
          filename: "王泽.pdf",
        },
      ],
      date: new Date("2026-06-18T10:01:00.000Z"),
      from: { value: [{ address: "candidate@example.com" }] },
      messageId: "message-id-1",
      subject: "【BOSS直聘】王泽投递 AUR00AZ 前端工程师",
    } as unknown as Awaited<ReturnType<typeof simpleParser>>);
    vi.mocked(fetchJobDescriptionsByCodes).mockResolvedValue([{ code: "AUR00AZ", id: "jd_1" }]);

    const result = await runMailIngestOnce(config);

    expect(result).toMatchObject({ accounts: 1, messagesFailed: 0, messagesQueued: 1 });
    expect(fetchJobDescriptionsByCodes).toHaveBeenCalledWith("org_1", ["AUR00AZ"]);
    expect(insertBatchWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        jdMode: "bind",
        jobDescriptionId: "jd_1",
        organizationId: "org_1",
      }),
    );
  });

  it("queued mail records jdBindStatus + attachment counts", async () => {
    mocks.connect.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([201]);
    mocks.fetchOne.mockResolvedValue({
      envelope: { subject: "【BOSS直聘】李雷投递 AUR0001 后端工程师" },
      internalDate: new Date("2026-06-18T10:02:00.000Z"),
      source: Buffer.from("raw message"),
    });
    vi.mocked(simpleParser).mockResolvedValue({
      attachments: [
        {
          content: Buffer.from("resume"),
          contentDisposition: "attachment",
          contentType: "application/pdf",
          filename: "李雷.pdf",
        },
      ],
      date: new Date("2026-06-18T10:02:00.000Z"),
      from: { value: [{ address: "candidate2@example.com" }] },
      messageId: "message-id-2",
      subject: "【BOSS直聘】李雷投递 AUR0001 后端工程师",
    } as unknown as Awaited<ReturnType<typeof simpleParser>>);
    vi.mocked(fetchJobDescriptionsByCodes).mockResolvedValue([{ code: "AUR0001", id: "jd-1" }]);

    await runMailIngestOnce(config);

    expect(vi.mocked(updateMailIngestMessageResult)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        boundJobDescriptionId: "jd-1",
        jdBindStatus: "bound",
        resumeAttachmentCount: 1,
        status: "queued",
      }),
    );
  });

  it("mail with no supported attachment is skipped, not failed", async () => {
    mocks.connect.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([301]);
    mocks.fetchOne.mockResolvedValue({
      envelope: { subject: "【BOSS直聘】王芳投递 前端工程师" },
      internalDate: new Date("2026-06-18T10:03:00.000Z"),
      source: Buffer.from("raw message"),
    });
    vi.mocked(simpleParser).mockResolvedValue({
      attachments: [
        {
          content: Buffer.from("resume"),
          contentDisposition: "attachment",
          contentType: "application/zip",
          filename: "简历.zip",
        },
      ],
      date: new Date("2026-06-18T10:03:00.000Z"),
      from: { value: [{ address: "candidate3@example.com" }] },
      messageId: "message-id-3",
      subject: "【BOSS直聘】王芳投递 前端工程师",
    } as unknown as Awaited<ReturnType<typeof simpleParser>>);

    await runMailIngestOnce(config);

    expect(mocks.markMailIngestMessageSkipped).toHaveBeenCalledWith(
      expect.any(String),
      "no_supported_attachment",
      expect.objectContaining({ resumeAttachmentCount: 0 }),
    );
    expect(vi.mocked(updateMailIngestMessageResult)).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("finishMailIngestAccountRun receives per-account counts", async () => {
    mocks.connect.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([401, 402]);
    mocks.fetchOne
      .mockResolvedValueOnce({
        envelope: { subject: "普通通知邮件" },
        internalDate: new Date("2026-06-18T10:04:00.000Z"),
        source: Buffer.from("raw message 1"),
      })
      .mockResolvedValueOnce({
        envelope: { subject: "【BOSS直聘】赵敏投递 前端工程师" },
        internalDate: new Date("2026-06-18T10:05:00.000Z"),
        source: Buffer.from("raw message 2"),
      });
    vi.mocked(simpleParser)
      .mockResolvedValueOnce({
        attachments: [],
        subject: "普通通知邮件",
      } as unknown as Awaited<ReturnType<typeof simpleParser>>)
      .mockResolvedValueOnce({
        attachments: [
          {
            content: Buffer.from("resume"),
            contentDisposition: "attachment",
            contentType: "application/pdf",
            filename: "赵敏.pdf",
          },
        ],
        date: new Date("2026-06-18T10:05:00.000Z"),
        from: { value: [{ address: "candidate4@example.com" }] },
        messageId: "message-id-4",
        subject: "【BOSS直聘】赵敏投递 前端工程师",
      } as unknown as Awaited<ReturnType<typeof simpleParser>>);

    await runMailIngestOnce(config);

    expect(mocks.finishMailIngestAccountRun).toHaveBeenCalledWith(
      "account_1",
      expect.objectContaining({
        counts: expect.objectContaining({ queued: 1, received: 2, subjectSkipped: 1 }),
      }),
    );
  });
});
