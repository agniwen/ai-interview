import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ImapFlow } from "imapflow";
import { isMailIngestTriggerQueueConfigured } from "@arc/resume-parse-queue/mail-ingest-trigger";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  jobDescription,
  mailIngestAccount,
  mailIngestMessage,
  member,
  resumeDuplicateMatch,
  resumePoolItem,
  resumeUploadBatchItem,
  user,
} from "@arc/db-schema/schema";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import type { z } from "zod";
import { BackgroundQueueProducerService } from "../../../../background/background-queue-producer.service.js";
import { WORKSPACE_DATABASE_PORT } from "../../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../../infrastructure/workspace/workspace.ports.js";
import type {
  managedMailListQuerySchema,
  createMailAccountSchema,
  updateMailAccountSchema,
  mailMessagesQuerySchema,
} from "./mail-ingest.schemas.js";

type Query = z.infer<typeof managedMailListQuerySchema>;
type CreateInput = z.infer<typeof createMailAccountSchema>;
type UpdateInput = z.infer<typeof updateMailAccountSchema>;
type MessagesQuery = z.infer<typeof mailMessagesQuerySchema>;
const account = (row: typeof mailIngestAccount.$inferSelect) => ({
  createdAt: row.createdAt.toISOString(),
  emailAddress: row.emailAddress,
  enabled: row.enabled,
  failedMailbox: row.failedMailbox,
  hasPassword: Boolean(row.encryptedPassword),
  id: row.id,
  imapHost: row.imapHost,
  imapPort: row.imapPort,
  imapSecure: row.imapSecure,
  lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
  lastError: row.lastError,
  listenStartAt: row.listenStartAt?.toISOString() ?? null,
  mailbox: row.mailbox,
  processedMailbox: row.processedMailbox,
  subjectKeyword: row.subjectKeyword,
  updatedAt: row.updatedAt.toISOString(),
  username: row.username,
});

function summarizePoolItems(items: { resumeParseStatus: string | null }[]) {
  if (!items.length) {
    return null;
  }
  if (
    items.some((item) => item.resumeParseStatus !== "ready" && item.resumeParseStatus !== "failed")
  ) {
    return "parsing" as const;
  }
  if (items.every((item) => item.resumeParseStatus === "ready")) {
    return "all_pooled" as const;
  }
  if (items.every((item) => item.resumeParseStatus === "failed")) {
    return "all_failed" as const;
  }
  return "partial_failed" as const;
}

@Injectable()
export class MailIngestService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
  ) {}

  async listOwn(organizationId: string, userId: string) {
    const rows = await this.database
      .select()
      .from(mailIngestAccount)
      .where(
        and(
          eq(mailIngestAccount.organizationId, organizationId),
          eq(mailIngestAccount.userId, userId),
        ),
      )
      .orderBy(mailIngestAccount.createdAt);
    return { accounts: rows.map(account) };
  }

  private secretKey() {
    const value = rawBackendEnvironment.MAIL_INGEST_SECRET_KEY?.trim();
    if (!value) {
      throw new Error("MAIL_INGEST_SECRET_KEY is not set.");
    }
    return createHash("sha256").update(value).digest();
  }

  private encrypt(plaintext: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.secretKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(":");
  }

  private decrypt(value: string) {
    const [version, iv, tag, payload] = value.split(":");
    if (version !== "v1" || !iv || !tag || !payload) {
      throw new Error("Invalid mail ingest secret payload.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.secretKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]).toString("utf-8");
  }

  private async validate(input: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    mailbox: string;
    password: string;
    username: string;
  }) {
    const client = new ImapFlow({
      auth: { pass: input.password, user: input.username },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      host: input.imapHost,
      logger: false,
      port: input.imapPort,
      secure: input.imapSecure,
      socketTimeout: 15_000,
    });
    let connected = false;
    try {
      await client.connect();
      connected = true;
      const lock = await client.getMailboxLock(input.mailbox);
      lock.release();
    } catch (error) {
      throw new BadRequestException(
        `邮箱登录校验失败：${error instanceof Error ? error.message : "请检查 IMAP 配置、账号或授权码。"}`,
        { errorCode: "MAIL_INGEST_LOGIN_INVALID" },
      );
    } finally {
      if (connected) {
        await client.logout().catch(() => null);
      }
    }
  }

  async create(organizationId: string, userId: string, input: CreateInput) {
    const membership = await this.database
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1);
    if (!membership[0]) {
      throw new NotFoundException("目标成员不存在。", {
        errorCode: "MAIL_INGEST_MEMBER_NOT_FOUND",
      });
    }
    await this.validate(input);
    const now = new Date();
    let listenStartAt: Date | null = now;
    if (input.listenStartAt === null) {
      listenStartAt = null;
    } else if (input.listenStartAt !== undefined) {
      listenStartAt = new Date(input.listenStartAt);
    }
    const rows = await this.database
      .insert(mailIngestAccount)
      .values({
        createdAt: now,
        emailAddress: input.emailAddress,
        enabled: input.enabled,
        encryptedPassword: this.encrypt(input.password),
        failedMailbox: input.failedMailbox,
        id: crypto.randomUUID(),
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecure: input.imapSecure,
        listenStartAt,
        mailbox: input.mailbox,
        organizationId,
        processedMailbox: input.processedMailbox,
        subjectKeyword: input.subjectKeyword,
        updatedAt: now,
        userId,
        username: input.username,
      })
      .returning();
    return account(rows[0]);
  }

  private async existing(organizationId: string, id: string, userId?: string) {
    const filters = [
      eq(mailIngestAccount.id, id),
      eq(mailIngestAccount.organizationId, organizationId),
    ];
    if (userId) {
      filters.push(eq(mailIngestAccount.userId, userId));
    }
    const rows = await this.database
      .select()
      .from(mailIngestAccount)
      .where(and(...filters))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("邮箱配置不存在。", {
        errorCode: "MAIL_INGEST_ACCOUNT_NOT_FOUND",
      });
    }
    return rows[0];
  }

  async update(organizationId: string, id: string, input: UpdateInput, userId?: string) {
    const existing = await this.existing(organizationId, id, userId);
    const login = {
      imapHost: input.imapHost ?? existing.imapHost,
      imapPort: input.imapPort ?? existing.imapPort,
      imapSecure: input.imapSecure ?? existing.imapSecure,
      mailbox: input.mailbox ?? existing.mailbox,
      password: input.password ?? this.decrypt(existing.encryptedPassword),
      username: input.username ?? existing.username,
    };
    await this.validate(login);
    const values: Partial<typeof mailIngestAccount.$inferInsert> = {
      lastError: null,
      pollingStartedAt: null,
      updatedAt: new Date(),
    };
    for (const key of [
      "emailAddress",
      "enabled",
      "failedMailbox",
      "imapHost",
      "imapPort",
      "imapSecure",
      "mailbox",
      "processedMailbox",
      "subjectKeyword",
      "username",
    ] as const) {
      if (input[key] !== undefined) {
        Object.assign(values, { [key]: input[key] });
      }
    }
    if (input.listenStartAt !== undefined) {
      values.listenStartAt = input.listenStartAt ? new Date(input.listenStartAt) : null;
    }
    if (input.password) {
      values.encryptedPassword = this.encrypt(input.password);
    }
    const filters = [
      eq(mailIngestAccount.id, id),
      eq(mailIngestAccount.organizationId, organizationId),
    ];
    if (userId) {
      filters.push(eq(mailIngestAccount.userId, userId));
    }
    const rows = await this.database
      .update(mailIngestAccount)
      .set(values)
      .where(and(...filters))
      .returning();
    return account(rows[0]);
  }

  // oxlint-disable-next-line complexity -- Legacy mailbox filtering exposes independent optional fields in one query contract.
  private selectWorkspaceRows(organizationId: string, query?: Query) {
    const filters = [eq(member.organizationId, organizationId)];
    const text = parseListTextFilters(query?.textFilters);
    if (query?.search) {
      const searchFilter = or(
        ilike(user.name, `%${query.search}%`),
        ilike(user.email, `%${query.search}%`),
        ilike(mailIngestAccount.emailAddress, `%${query.search}%`),
      );
      if (searchFilter) {
        filters.push(searchFilter);
      }
    }
    if (text.memberName) {
      filters.push(ilike(user.name, `%${text.memberName}%`));
    }
    if (text.memberEmail) {
      filters.push(ilike(user.email, `%${text.memberEmail}%`));
    }
    if (text.emailAddress) {
      filters.push(ilike(mailIngestAccount.emailAddress, `%${text.emailAddress}%`));
    }
    if (text.imapHost) {
      filters.push(ilike(mailIngestAccount.imapHost, `%${text.imapHost}%`));
    }
    if (text.subjectKeyword) {
      filters.push(ilike(mailIngestAccount.subjectKeyword, `%${text.subjectKeyword}%`));
    }
    if (text.username) {
      filters.push(ilike(mailIngestAccount.username, `%${text.username}%`));
    }
    let order = query?.sortOrder === "desc" ? desc(user.name) : asc(user.name);
    if (query?.sortBy === "userEmail") {
      order = query.sortOrder === "desc" ? desc(user.email) : asc(user.email);
    } else if (query?.sortBy === "emailAddress") {
      order =
        query.sortOrder === "desc"
          ? desc(mailIngestAccount.emailAddress)
          : asc(mailIngestAccount.emailAddress);
    } else if (query?.sortBy === "lastCheckedAt") {
      order =
        query.sortOrder === "desc"
          ? desc(mailIngestAccount.lastCheckedAt)
          : asc(mailIngestAccount.lastCheckedAt);
    }
    return this.database
      .select({
        accountCreatedAt: mailIngestAccount.createdAt,
        accountEmailAddress: mailIngestAccount.emailAddress,
        accountEnabled: mailIngestAccount.enabled,
        accountEncryptedPassword: mailIngestAccount.encryptedPassword,
        accountFailedMailbox: mailIngestAccount.failedMailbox,
        accountId: mailIngestAccount.id,
        accountImapHost: mailIngestAccount.imapHost,
        accountImapPort: mailIngestAccount.imapPort,
        accountImapSecure: mailIngestAccount.imapSecure,
        accountLastCheckedAt: mailIngestAccount.lastCheckedAt,
        accountLastError: mailIngestAccount.lastError,
        accountListenStartAt: mailIngestAccount.listenStartAt,
        accountMailbox: mailIngestAccount.mailbox,
        accountProcessedMailbox: mailIngestAccount.processedMailbox,
        accountSubjectKeyword: mailIngestAccount.subjectKeyword,
        accountUpdatedAt: mailIngestAccount.updatedAt,
        accountUsername: mailIngestAccount.username,
        lastRunFailed: mailIngestAccount.lastRunFailed,
        lastRunMatched: mailIngestAccount.lastRunMatched,
        lastRunQueued: mailIngestAccount.lastRunQueued,
        lastRunReceived: mailIngestAccount.lastRunReceived,
        lastRunSubjectSkipped: mailIngestAccount.lastRunSubjectSkipped,
        memberRole: member.role,
        messageCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id})`,
        problemCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id} and status in ('failed','skipped'))`,
        userEmail: user.email,
        userId: user.id,
        userImage: user.image,
        userName: user.name,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(
        mailIngestAccount,
        and(
          eq(mailIngestAccount.organizationId, member.organizationId),
          eq(mailIngestAccount.userId, member.userId),
        ),
      )
      .where(and(...filters))
      .orderBy(asc(isNull(mailIngestAccount.id)), order, asc(user.email));
  }

  private present(row: Awaited<ReturnType<MailIngestService["selectWorkspaceRows"]>>[number]) {
    const value = row.accountId
      ? {
          createdAt: (row.accountCreatedAt ?? new Date(0)).toISOString(),
          emailAddress: row.accountEmailAddress ?? "",
          enabled: row.accountEnabled ?? false,
          failedMailbox: row.accountFailedMailbox ?? "",
          hasPassword: Boolean(row.accountEncryptedPassword),
          id: row.accountId,
          imapHost: row.accountImapHost ?? "",
          imapPort: row.accountImapPort ?? 0,
          imapSecure: row.accountImapSecure ?? false,
          lastCheckedAt: row.accountLastCheckedAt?.toISOString() ?? null,
          lastError: row.accountLastError,
          listenStartAt: row.accountListenStartAt?.toISOString() ?? null,
          mailbox: row.accountMailbox ?? "",
          processedMailbox: row.accountProcessedMailbox ?? "",
          subjectKeyword: row.accountSubjectKeyword ?? "",
          updatedAt: (row.accountUpdatedAt ?? new Date(0)).toISOString(),
          username: row.accountUsername ?? "",
        }
      : null;
    return {
      account: value,
      lastRunFailed: row.lastRunFailed,
      lastRunMatched: row.lastRunMatched,
      lastRunQueued: row.lastRunQueued,
      lastRunReceived: row.lastRunReceived,
      lastRunSubjectSkipped: row.lastRunSubjectSkipped,
      messageCount: row.messageCount,
      problemCount: row.problemCount,
      user: {
        email: row.userEmail,
        id: row.userId,
        image: row.userImage,
        name: row.userName,
        role: row.memberRole,
      },
    };
  }

  async listManaged(organizationId: string, query: Query) {
    const base = this.selectWorkspaceRows(organizationId, query);
    const [rows, totals] = await Promise.all([
      base.limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      this.database
        .select({ count: count() })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, organizationId)),
    ]);
    const total = totals[0]?.count ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.map((row) => this.present(row)),
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async getManaged(organizationId: string, id: string) {
    const rows = await this.selectWorkspaceRows(organizationId);
    const row = rows.find((value) => value.accountId === id);
    if (!row) {
      throw new NotFoundException("邮箱配置不存在。", {
        errorCode: "MAIL_INGEST_ACCOUNT_NOT_FOUND",
      });
    }
    return this.present(row);
  }

  async removeOwn(organizationId: string, userId: string, id: string) {
    const rows = await this.database
      .delete(mailIngestAccount)
      .where(
        and(
          eq(mailIngestAccount.id, id),
          eq(mailIngestAccount.organizationId, organizationId),
          eq(mailIngestAccount.userId, userId),
        ),
      )
      .returning({ id: mailIngestAccount.id });
    if (!rows.length) {
      throw new NotFoundException("邮箱配置不存在。", {
        errorCode: "MAIL_INGEST_ACCOUNT_NOT_FOUND",
      });
    }
    return { ok: true } as const;
  }

  async messages(organizationId: string, accountId: string, query: MessagesQuery, userId?: string) {
    await this.existing(organizationId, accountId, userId);
    const text = parseListTextFilters(query.textFilters);
    const filters = [eq(mailIngestMessage.accountId, accountId)];
    if (query.status) {
      filters.push(eq(mailIngestMessage.status, query.status));
    }
    if (query.skipReason) {
      filters.push(eq(mailIngestMessage.skipReason, query.skipReason));
    }
    if (query.jdBindStatus) {
      filters.push(eq(mailIngestMessage.jdBindStatus, query.jdBindStatus));
    }
    if (query.keyword) {
      const keywordFilter = or(
        ilike(mailIngestMessage.subject, `%${query.keyword}%`),
        ilike(mailIngestMessage.fromAddress, `%${query.keyword}%`),
      );
      if (keywordFilter) {
        filters.push(keywordFilter);
      }
    }
    if (text.subject) {
      filters.push(ilike(mailIngestMessage.subject, `%${text.subject}%`));
    }
    if (text.fromAddress) {
      filters.push(ilike(mailIngestMessage.fromAddress, `%${text.fromAddress}%`));
    }
    if (query.receivedFrom) {
      filters.push(gte(mailIngestMessage.receivedAt, new Date(query.receivedFrom)));
    }
    if (query.receivedTo) {
      filters.push(lte(mailIngestMessage.receivedAt, new Date(query.receivedTo)));
    }
    const where = and(...filters);
    const [rows, totals] = await Promise.all([
      this.database
        .select({
          attachmentCount: mailIngestMessage.attachmentCount,
          batchId: mailIngestMessage.batchId,
          boundJobDescriptionName: jobDescription.name,
          errorMessage: mailIngestMessage.errorMessage,
          fromAddress: mailIngestMessage.fromAddress,
          id: mailIngestMessage.id,
          jdBindStatus: mailIngestMessage.jdBindStatus,
          receivedAt: mailIngestMessage.receivedAt,
          resumeAttachmentCount: mailIngestMessage.resumeAttachmentCount,
          skipReason: mailIngestMessage.skipReason,
          status: mailIngestMessage.status,
          subject: mailIngestMessage.subject,
        })
        .from(mailIngestMessage)
        .innerJoin(
          mailIngestAccount,
          and(
            eq(mailIngestMessage.accountId, mailIngestAccount.id),
            eq(mailIngestAccount.organizationId, organizationId),
          ),
        )
        .leftJoin(jobDescription, eq(mailIngestMessage.boundJobDescriptionId, jobDescription.id))
        .where(where)
        .orderBy(sql`${mailIngestMessage.receivedAt} DESC NULLS LAST`, desc(mailIngestMessage.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ count: count() })
        .from(mailIngestMessage)
        .innerJoin(
          mailIngestAccount,
          and(
            eq(mailIngestMessage.accountId, mailIngestAccount.id),
            eq(mailIngestAccount.organizationId, organizationId),
          ),
        )
        .where(where),
    ]);
    const batchIds = rows.flatMap((row) => (row.batchId ? [row.batchId] : []));
    const attachmentRows = batchIds.length
      ? await this.database
          .select({
            batchId: resumeUploadBatchItem.batchId,
            fileName: resumeUploadBatchItem.originalFileName,
            orderIndex: resumeUploadBatchItem.orderIndex,
            poolItemId: resumeUploadBatchItem.poolItemId,
            resumeParseError: resumePoolItem.resumeParseError,
            resumeParseStatus: resumePoolItem.resumeParseStatus,
            resumeRecordId: resumeUploadBatchItem.resumeRecordId,
          })
          .from(resumeUploadBatchItem)
          .leftJoin(
            resumePoolItem,
            and(
              eq(resumeUploadBatchItem.poolItemId, resumePoolItem.id),
              eq(resumePoolItem.organizationId, organizationId),
            ),
          )
          .where(inArray(resumeUploadBatchItem.batchId, batchIds))
          .orderBy(asc(resumeUploadBatchItem.batchId), asc(resumeUploadBatchItem.orderIndex))
      : [];
    const poolIds = attachmentRows.flatMap((row) => (row.poolItemId ? [row.poolItemId] : []));
    const duplicateRows = poolIds.length
      ? await this.database
          .select({
            matchedSourceId: resumeDuplicateMatch.matchedSourceId,
            sourceId: resumeDuplicateMatch.sourceId,
          })
          .from(resumeDuplicateMatch)
          .where(
            and(
              eq(resumeDuplicateMatch.organizationId, organizationId),
              eq(resumeDuplicateMatch.status, "active"),
              or(
                and(
                  eq(resumeDuplicateMatch.sourceType, "resume_pool_item"),
                  inArray(resumeDuplicateMatch.sourceId, poolIds),
                ),
                and(
                  eq(resumeDuplicateMatch.matchedSourceType, "resume_pool_item"),
                  inArray(resumeDuplicateMatch.matchedSourceId, poolIds),
                ),
              ),
            ),
          )
      : [];
    const duplicates = new Set(duplicateRows.flatMap((row) => [row.sourceId, row.matchedSourceId]));
    const byBatch = new Map<
      string,
      {
        fileName: string;
        hasDuplicate: boolean;
        poolItemId: string | null;
        resumeParseError: string | null;
        resumeParseStatus: "unparsed" | "queued" | "processing" | "ready" | "failed" | null;
        resumeRecordId: string | null;
      }[]
    >();
    for (const row of attachmentRows) {
      const list = byBatch.get(row.batchId) ?? [];
      list.push({
        fileName: row.fileName,
        hasDuplicate: row.poolItemId ? duplicates.has(row.poolItemId) : false,
        poolItemId: row.poolItemId,
        resumeParseError: row.resumeParseError,
        resumeParseStatus: row.resumeParseStatus,
        resumeRecordId: row.resumeRecordId,
      });
      byBatch.set(row.batchId, list);
    }
    return {
      records: rows.map((row) => {
        const items = row.batchId ? (byBatch.get(row.batchId) ?? []) : [];
        const error = row.errorMessage?.replaceAll(/\s+/g, " ").trim() ?? null;
        return {
          attachmentCount: row.attachmentCount,
          attachments: items,
          boundJobDescriptionName: row.boundJobDescriptionName,
          errorMessage: error && error.length > 300 ? `${error.slice(0, 300)}…` : error,
          fromAddress: row.fromAddress,
          id: row.id,
          jdBindStatus: row.jdBindStatus,
          poolSummary: summarizePoolItems(items),
          receivedAt: row.receivedAt?.toISOString() ?? null,
          resumeAttachmentCount: row.resumeAttachmentCount,
          skipReason: row.skipReason,
          status: row.status,
          subject: row.subject,
        };
      }),
      total: totals[0]?.count ?? 0,
    };
  }

  async pollNow(organizationId: string) {
    if (!isMailIngestTriggerQueueConfigured(rawBackendEnvironment)) {
      throw new ServiceUnavailableException("邮箱轮训队列未配置 REDIS_URL。", {
        errorCode: "MAIL_INGEST_QUEUE_UNAVAILABLE",
      });
    }
    await this.queueProducer.enqueueMailIngestTrigger({ organizationId });
    return { status: "queued" } as const;
  }
}
