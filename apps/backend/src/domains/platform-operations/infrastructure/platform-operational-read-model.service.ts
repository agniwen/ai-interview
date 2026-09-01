/* oxlint-disable anti-slop/no-known-value-widening, max-lines, no-nested-ternary, unicorn/no-nested-ternary -- Operational diagnostics require several purpose-built aggregate read queries; this adapter keeps their Drizzle details behind one read-model boundary. */
import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import {
  account,
  chatAttachment,
  interviewConversation,
  interviewNotification,
  mailIngestAccount,
  member,
  organization,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import { HTTP_DATABASE } from "../../../infrastructure/http/http.ports.js";
import type { HttpDatabase } from "../../../infrastructure/http/http.ports.js";
import type { z } from "zod";
import type {
  platformMailAccountsQuerySchema,
  platformNotificationsQuerySchema,
  platformResumeParseCacheQuerySchema,
} from "../http/platform.schemas.js";
import type {
  PlatformOperationalReadModel,
  ResumeQueueJobDetail,
} from "./platform-operational-read-model.port.js";

function toIso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function literalContains(column: SQLWrapper, value: string) {
  return sql`${column} ILIKE ${`%${value.replaceAll(/[!%_]/gu, "!$&")}%`} ESCAPE '!'`;
}

function cacheTextFilter(value: string | undefined) {
  const parsed = parseListTextFilters(value);
  const columns: Record<string, SQLWrapper> = {
    contentHash: chatAttachment.contentHash,
    filename: chatAttachment.filename,
    organizationName: organization.name,
    storageKey: chatAttachment.storageKey,
    userEmail: user.email,
    userName: user.name,
  };
  return and(
    ...Object.entries(parsed)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([key, text]) => literalContains(columns[key], text)),
  );
}

function platformMailTextFilter(value: string | undefined) {
  const parsed = parseListTextFilters(value);
  const columns: Record<string, SQLWrapper> = {
    emailAddress: mailIngestAccount.emailAddress,
    imapHost: mailIngestAccount.imapHost,
    memberEmail: user.email,
    memberName: user.name,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    subjectKeyword: mailIngestAccount.subjectKeyword,
    username: mailIngestAccount.username,
  };
  return and(
    ...Object.entries(parsed)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([key, text]) => literalContains(columns[key], text)),
  );
}

function notificationTextFilter(value: string | undefined) {
  const parsed = parseListTextFilters(value);
  const columns: Record<string, SQLWrapper> = {
    candidateName: studioInterview.candidateName,
    error: interviewNotification.error,
    messageId: interviewNotification.feishuMessageId,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    recipientEmail: user.email,
    recipientName: user.name,
    recipientOpenId: interviewNotification.recipientOpenId,
    targetRole: studioInterview.targetRole,
  };
  return and(
    ...Object.entries(parsed)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([key, text]) => literalContains(columns[key], text)),
  );
}

function notificationOrderBy(query: z.infer<typeof platformNotificationsQuerySchema>) {
  const direction = query.sortOrder === "asc" ? asc : desc;
  const fallback = desc(interviewNotification.createdAt);
  if (query.sortBy === "sentAt") {
    return [direction(interviewNotification.sentAt), fallback];
  }
  if (query.sortBy === "updatedAt") {
    return [direction(interviewNotification.updatedAt), fallback];
  }
  if (query.sortBy === "status") {
    return [direction(interviewNotification.status), fallback];
  }
  if (query.sortBy === "providerId") {
    return [direction(interviewNotification.providerId), fallback];
  }
  if (query.sortBy === "candidateName") {
    return [direction(studioInterview.candidateName), fallback];
  }
  if (query.sortBy === "organizationName") {
    return [direction(organization.name), fallback];
  }
  return [direction(interviewNotification.createdAt)];
}

function latestCacheValue(column: SQL) {
  return sql`(array_agg(${column} order by ${chatAttachment.parsedAt} desc nulls last, ${chatAttachment.createdAt} desc))[1]`;
}

function cacheOrderBy(query: z.infer<typeof platformResumeParseCacheQuerySchema>) {
  const direction = query.sortOrder === "asc" ? asc : desc;
  if (query.sortBy === "filename") {
    return direction(latestCacheValue(sql`${chatAttachment.filename}`));
  }
  if (query.sortBy === "size") {
    return direction(latestCacheValue(sql`${chatAttachment.size}`));
  }
  if (query.sortBy === "createdAt") {
    return direction(sql`max(${chatAttachment.createdAt})`);
  }
  if (query.sortBy === "parsedStatus") {
    return direction(latestCacheValue(sql`${chatAttachment.parsedStatus}`));
  }
  const parsedAt = sql`max(${chatAttachment.parsedAt})`;
  return query.sortOrder === "asc"
    ? sql`${parsedAt} asc nulls last`
    : sql`${parsedAt} desc nulls last`;
}

function cacheHaving(query: z.infer<typeof platformResumeParseCacheQuerySchema>) {
  if (query.cacheType === "structured") {
    return sql`bool_or(${chatAttachment.parsedStructured} is not null)`;
  }
  if (query.cacheType === "text_only") {
    return sql`not bool_or(${chatAttachment.parsedStructured} is not null) and bool_or(${chatAttachment.parsedText} is not null)`;
  }
}

function cacheConditions(query: z.infer<typeof platformResumeParseCacheQuerySchema>) {
  const search = query.search?.trim();
  return and(
    isNotNull(chatAttachment.contentHash),
    ne(chatAttachment.contentHash, ""),
    or(isNotNull(chatAttachment.parsedStructured), isNotNull(chatAttachment.parsedText)),
    cacheTextFilter(query.textFilters),
    search
      ? or(
          ilike(chatAttachment.filename, `%${search}%`),
          ilike(chatAttachment.contentHash, `%${search}%`),
          ilike(chatAttachment.storageKey, `%${search}%`),
          ilike(organization.name, `%${search}%`),
          ilike(user.name, `%${search}%`),
          ilike(user.email, `%${search}%`),
        )
      : undefined,
    query.parsedStatus === "all" ? undefined : eq(chatAttachment.parsedStatus, query.parsedStatus),
    query.textSource === "all" ? undefined : eq(chatAttachment.parsedTextSource, query.textSource),
  );
}

@Injectable()
export class PlatformOperationalReadModelService implements PlatformOperationalReadModel {
  constructor(@Inject(HTTP_DATABASE) private readonly database: HttpDatabase) {}

  async listMailAccounts(query: z.infer<typeof platformMailAccountsQuerySchema>) {
    const search = query.search?.trim();
    const where = and(
      platformMailTextFilter(query.textFilters),
      search
        ? or(
            ilike(organization.name, `%${search}%`),
            ilike(organization.slug, `%${search}%`),
            ilike(user.name, `%${search}%`),
            ilike(user.email, `%${search}%`),
            ilike(mailIngestAccount.emailAddress, `%${search}%`),
            ilike(mailIngestAccount.username, `%${search}%`),
            ilike(mailIngestAccount.imapHost, `%${search}%`),
            ilike(mailIngestAccount.subjectKeyword, `%${search}%`),
          )
        : undefined,
    );
    const orderColumn =
      query.sortBy === "emailAddress"
        ? mailIngestAccount.emailAddress
        : query.sortBy === "lastCheckedAt"
          ? mailIngestAccount.lastCheckedAt
          : query.sortBy === "userEmail"
            ? user.email
            : user.name;
    const direction = query.sortOrder === "asc" ? asc : desc;
    const [rows, totals] = await Promise.all([
      this.database
        .select({
          accountCreatedAt: mailIngestAccount.createdAt,
          accountEmailAddress: mailIngestAccount.emailAddress,
          accountEnabled: mailIngestAccount.enabled,
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
          messageCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id})`,
          organization: { id: organization.id, name: organization.name, slug: organization.slug },
          problemCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id} and status in ('failed','skipped'))`,
          user: {
            email: user.email,
            id: user.id,
            image: user.image,
            name: user.name,
            role: member.role,
          },
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(
          mailIngestAccount,
          and(
            eq(mailIngestAccount.organizationId, member.organizationId),
            eq(mailIngestAccount.userId, member.userId),
          ),
        )
        .where(where)
        .orderBy(
          asc(isNull(mailIngestAccount.id)),
          asc(organization.name),
          direction(orderColumn),
          asc(user.email),
          asc(mailIngestAccount.emailAddress),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ total: count() })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(
          mailIngestAccount,
          and(
            eq(mailIngestAccount.organizationId, member.organizationId),
            eq(mailIngestAccount.userId, member.userId),
          ),
        )
        .where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.map((row) => ({
        account: row.accountId
          ? {
              createdAt: row.accountCreatedAt?.toISOString() ?? "",
              emailAddress: row.accountEmailAddress ?? "",
              enabled: row.accountEnabled ?? false,
              failedMailbox: row.accountFailedMailbox ?? "",
              id: row.accountId,
              imapHost: row.accountImapHost ?? "",
              imapPort: row.accountImapPort ?? 993,
              imapSecure: row.accountImapSecure ?? true,
              lastCheckedAt: toIso(row.accountLastCheckedAt),
              lastError: row.accountLastError,
              listenStartAt: toIso(row.accountListenStartAt),
              mailbox: row.accountMailbox ?? "",
              processedMailbox: row.accountProcessedMailbox ?? "",
              subjectKeyword: row.accountSubjectKeyword ?? "",
              updatedAt: row.accountUpdatedAt?.toISOString() ?? "",
              username: row.accountUsername ?? "",
            }
          : null,
        lastRunFailed: row.lastRunFailed,
        lastRunMatched: row.lastRunMatched,
        lastRunQueued: row.lastRunQueued,
        lastRunReceived: row.lastRunReceived,
        lastRunSubjectSkipped: row.lastRunSubjectSkipped,
        messageCount: row.messageCount,
        organization: row.organization,
        problemCount: row.problemCount,
        user: row.user,
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async listResumeParseCache(query: z.infer<typeof platformResumeParseCacheQuerySchema>) {
    const where = cacheConditions(query);
    const having = cacheHaving(query);
    const latestOrder = sql`order by ${chatAttachment.parsedAt} desc nulls last, ${chatAttachment.createdAt} desc`;
    const groupedHashes = this.database
      .select({ contentHash: chatAttachment.contentHash })
      .from(chatAttachment)
      .innerJoin(organization, eq(organization.id, chatAttachment.organizationId))
      .innerJoin(user, eq(user.id, chatAttachment.userId))
      .where(where)
      .groupBy(chatAttachment.contentHash)
      .having(having)
      .as("resume_parse_cache_hashes");
    const [rows, totals] = await Promise.all([
      this.database
        .select({
          contentHash: sql<string>`${chatAttachment.contentHash}`,
          createdAt: sql<Date>`max(${chatAttachment.createdAt})`,
          filename: sql<string>`(array_agg(${chatAttachment.filename} ${latestOrder}))[1]`,
          hasStructured: sql<boolean>`bool_or(${chatAttachment.parsedStructured} is not null)`,
          hasText: sql<boolean>`bool_or(${chatAttachment.parsedText} is not null)`,
          id: sql<string>`${chatAttachment.contentHash}`,
          mediaType: sql<string>`(array_agg(${chatAttachment.mediaType} ${latestOrder}))[1]`,
          organizationName: sql<string>`(array_agg(${organization.name} ${latestOrder}))[1]`,
          parsedAt: sql<Date | null>`max(${chatAttachment.parsedAt})`,
          parsedPageCount: sql<
            number | null
          >`(array_agg(${chatAttachment.parsedPageCount} ${latestOrder}))[1]`,
          parsedStatus: sql<string>`(array_agg(${chatAttachment.parsedStatus} ${latestOrder}))[1]`,
          parsedTextSource: sql<
            string | null
          >`(array_agg(${chatAttachment.parsedTextSource} ${latestOrder}))[1]`,
          size: sql<number>`(array_agg(${chatAttachment.size} ${latestOrder}))[1]`,
          storageKey: sql<string>`(array_agg(${chatAttachment.storageKey} ${latestOrder}))[1]`,
          userEmail: sql<string>`(array_agg(${user.email} ${latestOrder}))[1]`,
          userName: sql<string>`(array_agg(${user.name} ${latestOrder}))[1]`,
        })
        .from(chatAttachment)
        .innerJoin(organization, eq(organization.id, chatAttachment.organizationId))
        .innerJoin(user, eq(user.id, chatAttachment.userId))
        .where(where)
        .groupBy(chatAttachment.contentHash)
        .having(having)
        .orderBy(cacheOrderBy(query), desc(sql`max(${chatAttachment.createdAt})`))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.select({ total: count() }).from(groupedHashes),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        parsedAt: toIso(row.parsedAt),
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getResumeQueueJobDetails(itemIds: string[]): Promise<ResumeQueueJobDetail[]> {
    if (itemIds.length === 0) {
      return [];
    }
    const rows = await this.database
      .select({
        attemptCount: resumeUploadBatchItem.attemptCount,
        batchFailedCount: resumeUploadBatch.failedCount,
        batchId: resumeUploadBatchItem.batchId,
        batchProcessedCount: resumeUploadBatch.processedCount,
        batchStatus: resumeUploadBatch.status,
        batchSucceededCount: resumeUploadBatch.succeededCount,
        batchTarget: resumeUploadBatch.target,
        batchTotalCount: resumeUploadBatch.totalCount,
        errorMessage: resumeUploadBatchItem.errorMessage,
        fileSize: resumeUploadBatchItem.fileSize,
        finishedAt: resumeUploadBatchItem.finishedAt,
        itemId: resumeUploadBatchItem.id,
        itemStatus: resumeUploadBatchItem.status,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        originalFileName: resumeUploadBatchItem.originalFileName,
        poolCandidateEmail: resumePoolItem.candidateEmail,
        poolCandidateName: resumePoolItem.candidateName,
        poolItemId: resumeUploadBatchItem.poolItemId,
        poolResumeParseError: resumePoolItem.resumeParseError,
        poolResumeParseStatus: resumePoolItem.resumeParseStatus,
        poolScope: resumePoolItem.scope,
        poolStatus: resumePoolItem.status,
        poolTargetRole: resumePoolItem.targetRole,
        queuedAt: resumeUploadBatchItem.queuedAt,
        resumeRecordId: resumeUploadBatchItem.resumeRecordId,
        startedAt: resumeUploadBatchItem.startedAt,
        studioCandidateEmail: studioInterview.candidateEmail,
        studioCandidateName: studioInterview.candidateName,
        studioResumeParseError: studioInterview.resumeParseError,
        studioResumeParseStatus: studioInterview.resumeParseStatus,
        studioTargetRole: studioInterview.targetRole,
        userEmail: user.email,
        userId: user.id,
        userImage: user.image,
        userName: user.name,
      })
      .from(resumeUploadBatchItem)
      .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
      .innerJoin(organization, eq(organization.id, resumeUploadBatch.organizationId))
      .innerJoin(user, eq(user.id, resumeUploadBatch.createdBy))
      .leftJoin(
        studioInterview,
        and(
          eq(studioInterview.id, resumeUploadBatchItem.resumeRecordId),
          eq(studioInterview.organizationId, resumeUploadBatch.organizationId),
        ),
      )
      .leftJoin(
        resumePoolItem,
        and(
          eq(resumePoolItem.id, resumeUploadBatchItem.poolItemId),
          eq(resumePoolItem.organizationId, resumeUploadBatch.organizationId),
        ),
      )
      .where(inArray(resumeUploadBatchItem.id, itemIds));
    return rows.map((row) => ({
      attemptCount: row.attemptCount,
      batch: {
        failedCount: row.batchFailedCount,
        processedCount: row.batchProcessedCount,
        status: row.batchStatus,
        succeededCount: row.batchSucceededCount,
        target: row.batchTarget,
        totalCount: row.batchTotalCount,
      },
      batchId: row.batchId,
      candidateEmail: row.studioCandidateEmail ?? row.poolCandidateEmail,
      candidateName: row.studioCandidateName ?? row.poolCandidateName,
      errorMessage: row.errorMessage,
      fileSize: row.fileSize,
      finishedAt: toIso(row.finishedAt),
      itemId: row.itemId,
      itemStatus: row.itemStatus,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationSlug: row.organizationSlug,
      originalFileName: row.originalFileName,
      poolItemId: row.poolItemId,
      poolScope: row.poolScope,
      poolStatus: row.poolStatus,
      queuedAt: toIso(row.queuedAt),
      resumeParseError: row.studioResumeParseError ?? row.poolResumeParseError,
      resumeParseStatus: row.studioResumeParseStatus ?? row.poolResumeParseStatus,
      resumeRecordId: row.resumeRecordId,
      startedAt: toIso(row.startedAt),
      targetRole: row.studioTargetRole ?? row.poolTargetRole,
      userEmail: row.userEmail,
      userId: row.userId,
      userImage: row.userImage,
      userName: row.userName,
    }));
  }

  async getResumeParseCache(hash: string) {
    const [row] = await this.database
      .select()
      .from(chatAttachment)
      .where(
        and(
          eq(chatAttachment.contentHash, hash),
          or(isNotNull(chatAttachment.parsedStructured), isNotNull(chatAttachment.parsedText)),
        ),
      )
      .orderBy(
        desc(sql`${chatAttachment.parsedStructured} is not null`),
        desc(chatAttachment.parsedAt),
        desc(chatAttachment.createdAt),
      )
      .limit(1);
    return row
      ? { ...row, createdAt: row.createdAt.toISOString(), parsedAt: toIso(row.parsedAt) }
      : null;
  }

  async listNotifications(query: z.infer<typeof platformNotificationsQuerySchema>) {
    const search = query.search?.trim();
    const where = and(
      isNull(interviewNotification.eventId),
      query.providerId === "all"
        ? inArray(interviewNotification.providerId, ["feishu", "feishu-jiguang-hr"])
        : eq(interviewNotification.providerId, query.providerId),
      query.status === "all" ? undefined : eq(interviewNotification.status, query.status),
      search
        ? or(
            ilike(studioInterview.candidateName, `%${search}%`),
            ilike(studioInterview.targetRole, `%${search}%`),
            ilike(organization.name, `%${search}%`),
            ilike(organization.slug, `%${search}%`),
            ilike(user.name, `%${search}%`),
            ilike(user.email, `%${search}%`),
            ilike(interviewNotification.providerId, `%${search}%`),
            ilike(interviewNotification.recipientOpenId, `%${search}%`),
            ilike(interviewNotification.feishuMessageId, `%${search}%`),
            ilike(interviewNotification.error, `%${search}%`),
          )
        : undefined,
      notificationTextFilter(query.textFilters),
    );
    const [rows, totals] = await Promise.all([
      this.database
        .select({
          candidateName: studioInterview.candidateName,
          conversationId: interviewNotification.conversationId,
          createdAt: interviewNotification.createdAt,
          error: interviewNotification.error,
          feishuDocumentUrl: interviewNotification.feishuDocumentUrl,
          feishuMessageId: interviewNotification.feishuMessageId,
          id: interviewNotification.id,
          interviewRecordId: interviewNotification.interviewRecordId,
          organizationId: organization.id,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          providerId: interviewNotification.providerId,
          recipientEmail: user.email,
          recipientImage: user.image,
          recipientName: user.name,
          recipientOpenId: interviewNotification.recipientOpenId,
          recipientUserId: user.id,
          scheduleEntryId: interviewConversation.scheduleEntryId,
          sentAt: interviewNotification.sentAt,
          status: interviewNotification.status,
          targetRole: studioInterview.targetRole,
          type: interviewNotification.type,
          updatedAt: interviewNotification.updatedAt,
        })
        .from(interviewNotification)
        .innerJoin(studioInterview, eq(studioInterview.id, interviewNotification.interviewRecordId))
        .leftJoin(
          interviewConversation,
          eq(interviewConversation.conversationId, interviewNotification.conversationId),
        )
        .innerJoin(organization, eq(organization.id, interviewNotification.organizationId))
        .leftJoin(user, eq(user.id, interviewNotification.recipientUserId))
        .where(where)
        .orderBy(...notificationOrderBy(query))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ total: count() })
        .from(interviewNotification)
        .innerJoin(studioInterview, eq(studioInterview.id, interviewNotification.interviewRecordId))
        .leftJoin(
          interviewConversation,
          eq(interviewConversation.conversationId, interviewNotification.conversationId),
        )
        .innerJoin(organization, eq(organization.id, interviewNotification.organizationId))
        .leftJoin(user, eq(user.id, interviewNotification.recipientUserId))
        .where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.map((row) => ({
        candidateName: row.candidateName,
        conversationId: row.conversationId,
        createdAt: row.createdAt.toISOString(),
        error: row.error,
        feishuDocumentUrl: row.feishuDocumentUrl,
        feishuMessageId: row.feishuMessageId,
        id: row.id,
        interviewRecordId: row.interviewRecordId,
        organization: {
          id: row.organizationId,
          name: row.organizationName,
          slug: row.organizationSlug,
        },
        providerId: row.providerId,
        recipientOpenId: row.recipientOpenId,
        recipientUser: {
          email: row.recipientEmail,
          id: row.recipientUserId,
          image: row.recipientImage,
          name: row.recipientName,
        },
        scheduleEntryId: row.scheduleEntryId,
        sentAt: toIso(row.sentAt),
        status: row.status,
        targetRole: row.targetRole,
        type: row.type,
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getNotificationDocumentStructure(id: string) {
    const [row] = await this.database
      .select({
        documentId: interviewNotification.feishuDocumentId,
        documentUrl: interviewNotification.feishuDocumentUrl,
        interviewQuestions: studioInterview.interviewQuestions,
        providerId: interviewNotification.providerId,
        qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
        type: interviewNotification.type,
      })
      .from(interviewNotification)
      .innerJoin(studioInterview, eq(studioInterview.id, interviewNotification.interviewRecordId))
      .where(eq(interviewNotification.id, id))
      .limit(1);
    return row ?? null;
  }

  async getNotificationPreview(id: string) {
    const [row] = await this.database
      .select({
        candidateName: studioInterview.candidateName,
        conversationId: interviewNotification.conversationId,
        transcript: interviewConversation.transcript,
        type: interviewNotification.type,
      })
      .from(interviewNotification)
      .innerJoin(studioInterview, eq(studioInterview.id, interviewNotification.interviewRecordId))
      .leftJoin(
        interviewConversation,
        eq(interviewConversation.conversationId, interviewNotification.conversationId),
      )
      .where(eq(interviewNotification.id, id))
      .limit(1);
    return row ?? null;
  }

  async getNotificationDocumentAccess(id: string) {
    const [row] = await this.database
      .select({
        documentId: interviewNotification.feishuDocumentId,
        documentUrl: interviewNotification.feishuDocumentUrl,
        id: interviewNotification.id,
        providerId: interviewNotification.providerId,
        recipientOpenId: interviewNotification.recipientOpenId,
      })
      .from(interviewNotification)
      .where(eq(interviewNotification.id, id))
      .limit(1);
    return row ?? null;
  }

  async getLatestProviderAccountOpenId(userId: string, providerId: string) {
    const [row] = await this.database
      .select({ openId: account.accountId })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
      .orderBy(desc(account.updatedAt))
      .limit(1);
    return row?.openId ?? null;
  }
}
