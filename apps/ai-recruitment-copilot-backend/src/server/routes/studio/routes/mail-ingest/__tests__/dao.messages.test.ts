import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  mailIngestAccount,
  mailIngestMessage,
  member,
  organization,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  user,
} from "@arc/db-schema/schema";
import { createMailIngestAccount, listAccountMailMessages } from "../dao";

const NOW = new Date("2026-06-18T10:00:00.000Z");

process.env.MAIL_INGEST_SECRET_KEY ??= "mail-ingest-test-secret";

describe("listAccountMailMessages", () => {
  const LOG_ORG = "test_mail_ingest_log_org";
  const LOG_OTHER_ORG = "test_mail_ingest_log_other_org";
  const LOG_USER = "test_mail_ingest_log_user";
  const LOG_BATCH = "test_mail_ingest_log_batch";
  const LOG_POOL_READY = "test_mail_ingest_log_pool_ready";
  const LOG_POOL_FAILED = "test_mail_ingest_log_pool_failed";
  const LOG_ITEM_READY = "test_mail_ingest_log_item_ready";
  const LOG_ITEM_FAILED = "test_mail_ingest_log_item_failed";
  const LOG_MSG_QUEUED = "test_mail_ingest_log_msg_queued";
  const LOG_MSG_SKIPPED = "test_mail_ingest_log_msg_skipped";
  const LOG_MSG_FAILED = "test_mail_ingest_log_msg_failed";

  async function logCleanup() {
    // mailIngestAccount -> mailIngestMessage 是 cascade 删除，不需要单独清理 message。
    await db.delete(resumeUploadBatchItem).where(eq(resumeUploadBatchItem.batchId, LOG_BATCH));
    await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, LOG_BATCH));
    await db.delete(resumePoolItem).where(eq(resumePoolItem.organizationId, LOG_ORG));
    await db.delete(mailIngestAccount).where(eq(mailIngestAccount.organizationId, LOG_ORG));
    await db.delete(member).where(eq(member.organizationId, LOG_ORG));
    await db.delete(organization).where(eq(organization.id, LOG_ORG));
    await db.delete(user).where(eq(user.id, LOG_USER));
  }

  async function insertTestAccount(): Promise<string> {
    await db.insert(user).values({
      createdAt: NOW,
      email: "log-user@mail-ingest.test",
      emailVerified: true,
      id: LOG_USER,
      name: "Log User",
      updatedAt: NOW,
    });
    await db.insert(organization).values({
      createdAt: NOW,
      id: LOG_ORG,
      name: "Log Org",
      slug: "mail-ingest-log-org",
    });
    await db.insert(member).values({
      createdAt: NOW,
      id: "m_mail_ingest_log_member",
      organizationId: LOG_ORG,
      role: "owner",
      userId: LOG_USER,
    });
    const account = await createMailIngestAccount({
      input: {
        emailAddress: "log-listener@mail-ingest.test",
        enabled: true,
        failedMailbox: "ARC-Failed",
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        password: "log-password",
        processedMailbox: "ARC-Processed",
        subjectKeyword: "boss直聘",
        username: "log-listener@mail-ingest.test",
      },
      organizationId: LOG_ORG,
      userId: LOG_USER,
    });
    return account.id;
  }

  beforeEach(logCleanup, 30_000);
  afterEach(logCleanup, 30_000);

  it("returns per-message rows with attachment expansion + scope", async () => {
    const accountId = await insertTestAccount();

    await db.insert(resumeUploadBatch).values({
      createdAt: NOW,
      createdBy: LOG_USER,
      dedupPolicy: "skip",
      id: LOG_BATCH,
      jdMode: "none",
      organizationId: LOG_ORG,
      status: "completed",
      target: "resume_pool",
      totalCount: 2,
      updatedAt: NOW,
    });
    await db.insert(resumePoolItem).values([
      {
        candidateName: "Ready Candidate",
        createdAt: NOW,
        createdBy: LOG_USER,
        id: LOG_POOL_READY,
        organizationId: LOG_ORG,
        resumeFileName: "ready.pdf",
        resumeParseStatus: "ready",
        scope: "private",
        updatedAt: NOW,
      },
      {
        candidateName: "Failed Candidate",
        createdAt: NOW,
        createdBy: LOG_USER,
        id: LOG_POOL_FAILED,
        organizationId: LOG_ORG,
        resumeFileName: "failed.pdf",
        resumeParseError: "解析失败",
        resumeParseStatus: "failed",
        scope: "private",
        updatedAt: NOW,
      },
    ]);
    await db.insert(resumeUploadBatchItem).values([
      {
        batchId: LOG_BATCH,
        fileSize: 100,
        id: LOG_ITEM_READY,
        orderIndex: 0,
        organizationId: LOG_ORG,
        originalFileName: "ready.pdf",
        poolItemId: LOG_POOL_READY,
        status: "succeeded",
        storageKey: "storage/test/ready.pdf",
      },
      {
        batchId: LOG_BATCH,
        fileSize: 100,
        id: LOG_ITEM_FAILED,
        orderIndex: 1,
        organizationId: LOG_ORG,
        originalFileName: "failed.pdf",
        poolItemId: LOG_POOL_FAILED,
        status: "failed",
        storageKey: "storage/test/failed.pdf",
      },
    ]);
    await db.insert(mailIngestMessage).values([
      {
        accountId,
        attachmentCount: 2,
        batchId: LOG_BATCH,
        fromAddress: "candidate@boss.test",
        id: LOG_MSG_QUEUED,
        mailbox: "INBOX",
        receivedAt: new Date("2026-06-20T10:00:00.000Z"),
        resumeAttachmentCount: 2,
        status: "queued",
        subject: "boss直聘：投递简历",
        uid: "log-1",
        uidValidity: "1",
      },
      {
        accountId,
        attachmentCount: 1,
        batchId: null,
        fromAddress: "spam@boss.test",
        id: LOG_MSG_SKIPPED,
        mailbox: "INBOX",
        receivedAt: null,
        resumeAttachmentCount: 0,
        skipReason: "no_supported_attachment",
        status: "skipped",
        subject: "无附件",
        uid: "log-2",
        uidValidity: "1",
      },
      {
        accountId,
        batchId: null,
        errorMessage: "IMAP timeout",
        fromAddress: "err@boss.test",
        id: LOG_MSG_FAILED,
        mailbox: "INBOX",
        receivedAt: new Date("2026-06-19T10:00:00.000Z"),
        status: "failed",
        subject: "处理失败",
        uid: "log-3",
        uidValidity: "1",
      },
    ]);

    const res = await listAccountMailMessages({
      accountId,
      organizationId: LOG_ORG,
      page: 1,
      pageSize: 20,
    });

    expect(res.total).toBe(3);
    expect(res.records.map((r) => r.id)).toEqual([LOG_MSG_QUEUED, LOG_MSG_FAILED, LOG_MSG_SKIPPED]);

    const skipped = res.records.find((r) => r.id === LOG_MSG_SKIPPED);
    expect(skipped?.attachments).toEqual([]);
    expect(skipped?.poolSummary).toBeNull();

    const queued = res.records.find((r) => r.id === LOG_MSG_QUEUED);
    expect(queued?.attachments).toHaveLength(2);
    expect(queued?.poolSummary).toBe("partial_failed");
    const readyAttachment = queued?.attachments.find((a) => a.poolItemId === LOG_POOL_READY);
    expect(readyAttachment).toMatchObject({
      fileName: "ready.pdf",
      hasDuplicate: false,
      resumeParseError: null,
      resumeParseStatus: "ready",
    });
    const failedAttachment = queued?.attachments.find((a) => a.poolItemId === LOG_POOL_FAILED);
    expect(failedAttachment).toMatchObject({
      fileName: "failed.pdf",
      hasDuplicate: false,
      resumeParseError: "解析失败",
      resumeParseStatus: "failed",
    });

    const failed = res.records.find((r) => r.id === LOG_MSG_FAILED);
    expect(failed?.attachments).toEqual([]);
    expect(failed?.poolSummary).toBeNull();

    // 跨 org 不可见
    const other = await listAccountMailMessages({
      accountId,
      organizationId: LOG_OTHER_ORG,
      page: 1,
      pageSize: 20,
    });
    expect(other.total).toBe(0);
    expect(other.records).toEqual([]);
  }, 30_000);

  it("reflects the filtered+scoped total independent of page length", async () => {
    const accountId = await insertTestAccount();

    await db.insert(mailIngestMessage).values([
      {
        accountId,
        batchId: null,
        fromAddress: "a@boss.test",
        id: LOG_MSG_SKIPPED,
        mailbox: "INBOX",
        receivedAt: new Date("2026-06-20T10:00:00.000Z"),
        skipReason: "no_supported_attachment",
        status: "skipped",
        subject: "a",
        uid: "log-4",
        uidValidity: "1",
      },
      {
        accountId,
        batchId: null,
        fromAddress: "b@boss.test",
        id: LOG_MSG_FAILED,
        mailbox: "INBOX",
        receivedAt: new Date("2026-06-19T10:00:00.000Z"),
        status: "failed",
        subject: "b",
        uid: "log-5",
        uidValidity: "1",
      },
    ]);

    const page = await listAccountMailMessages({
      accountId,
      organizationId: LOG_ORG,
      page: 1,
      pageSize: 1,
    });
    expect(page.total).toBe(2);
    expect(page.records).toHaveLength(1);

    const filtered = await listAccountMailMessages({
      accountId,
      organizationId: LOG_ORG,
      page: 1,
      pageSize: 20,
      status: "failed",
    });
    expect(filtered.total).toBe(1);
    expect(filtered.records[0]?.id).toBe(LOG_MSG_FAILED);
  }, 30_000);

  it("projects errorMessage truncated + single-lined on failed rows", async () => {
    const accountId = await insertTestAccount();
    await db.insert(mailIngestMessage).values({
      accountId,
      errorMessage: `IMAP fetch failed\nstack line 2\n${"x".repeat(400)}`,
      id: "m_err",
      mailbox: "INBOX",
      status: "failed",
      uid: "1",
      uidValidity: "1",
    });

    const { records } = await listAccountMailMessages({
      accountId,
      organizationId: LOG_ORG,
      page: 1,
      pageSize: 20,
    });

    expect(records[0]?.errorMessage).not.toContain("\n");
    expect(records[0]?.errorMessage?.startsWith("IMAP fetch failed stack line 2")).toBe(true);
    // 300 + "…"
    expect((records[0]?.errorMessage ?? "").length).toBeLessThanOrEqual(301);
  }, 30_000);
});
