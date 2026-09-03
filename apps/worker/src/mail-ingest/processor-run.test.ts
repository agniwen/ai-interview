import type { ParsedMail } from "mailparser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FetchMessageObject,
  FetchOptions,
  FetchQueryObject,
  ImapFlowOptions,
  MailboxLockObject,
  MailboxLockOptions,
  SearchObject,
} from "imapflow";
import { createMailIngestProcessor } from "./processor";
import type { MailIngestDependencies } from "./processor";
import type { MailIngestConfig } from "./config";

const mocks = {
  buildAttachmentKeyByHash: vi.fn(),
  claimMailIngestAccount: vi.fn(),
  claimMailIngestMessageForProcessing: vi.fn(),
  connect: vi.fn(),
  // SAFETY: The fixture stores only the constructor options passed by the processor seam.
  constructorOptions: undefined as ImapFlowOptions | undefined,
  enqueueResumeParseJobs: vi.fn(),
  errorListenerCount: 0,
  fetchOne: vi.fn(),
  fetchPublishedJobDescriptionsByCodes: vi.fn(),
  finishMailIngestAccountRun: vi.fn(),
  getMailboxLock: vi.fn(),
  insertBatchWithItems: vi.fn(),
  listEnabledMailIngestAccounts: vi.fn(),
  loadBatchDetail: vi.fn(),
  logout: vi.fn(),
  markMailIngestMessageSkipped: vi.fn(),
  parseMail: vi.fn(),
  putObjectBytes: vi.fn(),
  search: vi.fn(),
  updateMailIngestMessageResult: vi.fn(),
};

const POLLING_STARTED_AT = new Date("2026-06-18T10:00:01.000Z");

function parsedMail(input: Partial<ParsedMail>): ParsedMail {
  return {
    attachments: [],
    headerLines: [],
    headers: new Map(),
    html: false,
    ...input,
  };
}

class TestImapClient {
  mailbox = {
    delimiter: "/",
    exists: 0,
    flags: new Set<string>(),
    path: "INBOX",
    uidNext: 1,
    uidValidity: 1n,
  };

  constructor(options: ImapFlowOptions) {
    mocks.constructorOptions = options;
  }

  on = (_event: "error", _listener: (error: Error) => void) => {
    mocks.errorListenerCount += 1;
    return this;
  };

  connect = () => {
    void this;
    mocks.errorListenerCount = Math.max(mocks.errorListenerCount, 1);
    return mocks.connect();
  };

  fetchOne = (
    range: string,
    query: FetchQueryObject,
    options?: FetchOptions,
  ): Promise<FetchMessageObject | false> => {
    void this;
    return mocks.fetchOne(range, query, options);
  };

  getMailboxLock = (
    path: string | string[],
    options?: MailboxLockOptions,
  ): Promise<MailboxLockObject> => {
    void this;
    return mocks.getMailboxLock(path, options);
  };

  logout = () => {
    void this;
    return mocks.logout();
  };

  search = (
    query: SearchObject,
    options?: { readonly uid?: boolean },
  ): Promise<number[] | false> => {
    void this;
    return mocks.search(query, options);
  };
}

const processor = createMailIngestProcessor({
  ...mocks,
  createImapClient: (options) => new TestImapClient(options),
} satisfies MailIngestDependencies);

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
    mocks.constructorOptions = undefined;
    mocks.errorListenerCount = 0;
    mocks.connect.mockRejectedValue(new Error("IMAP login failed"));
    mocks.listEnabledMailIngestAccounts.mockResolvedValue([account()]);
    mocks.claimMailIngestAccount.mockResolvedValue(POLLING_STARTED_AT);
    mocks.finishMailIngestAccountRun.mockImplementation(() => Promise.resolve());
    mocks.fetchOne.mockResolvedValue(null);
    mocks.getMailboxLock.mockResolvedValue({ release: vi.fn() });
    mocks.logout.mockImplementation(() => Promise.resolve());
    mocks.markMailIngestMessageSkipped.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([]);
    mocks.buildAttachmentKeyByHash.mockResolvedValue("resumes/hash.pdf");
    mocks.claimMailIngestMessageForProcessing.mockResolvedValue({
      id: "message_1",
      moveTo: null,
      shouldProcess: true,
      status: "processing",
    });
    mocks.enqueueResumeParseJobs.mockImplementation(() => Promise.resolve());
    mocks.fetchPublishedJobDescriptionsByCodes.mockResolvedValue([]);
    mocks.insertBatchWithItems.mockResolvedValue("batch_1");
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.loadBatchDetail.mockResolvedValue({
      batch: { id: "batch_1" },
      items: [{ id: "item_1" }],
    });
    mocks.putObjectBytes.mockImplementation(() => Promise.resolve());
    mocks.parseMail.mockResolvedValue(parsedMail({ subject: "【BOSS直聘】王泽投递 前端工程师" }));
    mocks.updateMailIngestMessageResult.mockImplementation(() => Promise.resolve());
  });

  it("limits an immediate poll to the requested workspace", async () => {
    mocks.listEnabledMailIngestAccounts.mockResolvedValue([]);

    await processor.runMailIngestOnce(config, { organizationId: "org_1" });

    expect(mocks.listEnabledMailIngestAccounts).toHaveBeenCalledWith(20, {
      organizationId: "org_1",
    });
  });

  it("attaches an IMAP error listener so socket errors do not crash the worker process", async () => {
    const result = await processor.runMailIngestOnce(config);

    expect(mocks.errorListenerCount).toBeGreaterThan(0);
    expect(result).toMatchObject({ accounts: 1, messagesFailed: 1 });
    expect(mocks.finishMailIngestAccountRun).toHaveBeenCalledWith(
      "account_1",
      expect.objectContaining({
        error: expect.any(Error),
        pollingStartedAt: POLLING_STARTED_AT,
      }),
    );
  });

  it("disables ImapFlow protocol logging while retaining business error handling", async () => {
    await processor.runMailIngestOnce(config);

    expect(mocks.constructorOptions).toEqual(expect.objectContaining({ logger: false }));
    expect(mocks.errorListenerCount).toBeGreaterThan(0);
  });

  it("a failed poll preserves prior counters (no zeroed counts written)", async () => {
    await processor.runMailIngestOnce(config);

    const call = mocks.finishMailIngestAccountRun.mock.calls.find((c) => c[0] === "account_1");
    expect(call?.[1]).toMatchObject({ error: expect.any(Error) });
    expect(call?.[1]).not.toHaveProperty("counts");
  });

  it("binds an imported resume batch to the single job matched from the mail subject code", async () => {
    mocks.connect.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([101]);
    mocks.fetchOne.mockResolvedValue({
      envelope: { subject: "【BOSS直聘】王泽投递 AUR00AZ 前端工程师" },
      internalDate: new Date("2026-06-18T10:01:00.000Z"),
      source: Buffer.from("raw message"),
    });
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.parseMail.mockResolvedValue({
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
    });
    mocks.fetchPublishedJobDescriptionsByCodes.mockResolvedValue([{ code: "AUR00AZ", id: "jd_1" }]);

    const result = await processor.runMailIngestOnce(config);

    expect(result).toMatchObject({ accounts: 1, messagesFailed: 0, messagesQueued: 1 });
    expect(mocks.fetchPublishedJobDescriptionsByCodes).toHaveBeenCalledWith("org_1", ["AUR00AZ"]);
    expect(mocks.insertBatchWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        jdMode: "bind",
        jobDescriptionId: "jd_1",
        jobMatchRequestedAt: expect.any(Date),
        organizationId: "org_1",
        resumePoolScope: "public",
      }),
    );
  });

  it("uses automatic matching for a new mail batch when the account has no fixed job", async () => {
    mocks.connect.mockImplementation(() => Promise.resolve());
    mocks.search.mockResolvedValue([150]);
    mocks.fetchOne.mockResolvedValue({
      envelope: { subject: "【BOSS直聘】王泽投递 前端工程师" },
      internalDate: new Date("2026-06-18T10:01:00.000Z"),
      source: Buffer.from("raw message"),
    });
    mocks.parseMail.mockResolvedValue(
      parsedMail({
        attachments: [
          {
            checksum: "fixture-auto-match-checksum",
            content: Buffer.from("resume"),
            contentDisposition: "attachment",
            contentType: "application/pdf",
            filename: "王泽-前端工程师.pdf",
            headerLines: [],
            headers: new Map(),
            related: false,
            size: 6,
            type: "attachment",
          },
        ],
        subject: "【BOSS直聘】王泽投递 前端工程师",
      }),
    );

    await processor.runMailIngestOnce(config);

    expect(mocks.insertBatchWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        jdMode: "auto",
        jobDescriptionId: null,
        jobMatchRequestedAt: expect.any(Date),
        sourceChannel: "mail_ingest",
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
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.parseMail.mockResolvedValue({
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
    });
    mocks.fetchPublishedJobDescriptionsByCodes.mockResolvedValue([{ code: "AUR0001", id: "jd-1" }]);

    await processor.runMailIngestOnce(config);

    expect(mocks.updateMailIngestMessageResult).toHaveBeenCalledWith(
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
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.parseMail.mockResolvedValue({
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
    });

    await processor.runMailIngestOnce(config);

    expect(mocks.markMailIngestMessageSkipped).toHaveBeenCalledWith(
      expect.any(String),
      "no_supported_attachment",
      expect.objectContaining({ resumeAttachmentCount: 0 }),
    );
    expect(mocks.updateMailIngestMessageResult).not.toHaveBeenCalledWith(
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
    mocks.parseMail
      .mockResolvedValueOnce(parsedMail({ subject: "普通通知邮件" }))
      .mockResolvedValueOnce(
        parsedMail({
          attachments: [
            {
              checksum: "fixture-checksum",
              content: Buffer.from("resume"),
              contentDisposition: "attachment",
              contentType: "application/pdf",
              filename: "赵敏.pdf",
              headerLines: [],
              headers: new Map(),
              related: false,
              size: 6,
              type: "attachment",
            },
          ],
          date: new Date("2026-06-18T10:05:00.000Z"),
          from: {
            html: '<span class="mp_address_group"><a href="mailto:candidate4@example.com">候选人</a></span>',
            text: "候选人 <candidate4@example.com>",
            value: [{ address: "candidate4@example.com", name: "候选人" }],
          },
          messageId: "message-id-4",
          subject: "【BOSS直聘】赵敏投递 前端工程师",
        }),
      );

    await processor.runMailIngestOnce(config);

    expect(mocks.finishMailIngestAccountRun).toHaveBeenCalledWith(
      "account_1",
      expect.objectContaining({
        counts: expect.objectContaining({
          matched: 1,
          queued: 1,
          received: 2,
          subjectSkipped: 1,
        }),
      }),
    );
  });
});
