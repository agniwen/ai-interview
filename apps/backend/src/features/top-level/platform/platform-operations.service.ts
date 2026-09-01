/* oxlint-disable anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion, class-methods-use-this, max-lines, no-empty-function, no-nested-ternary, no-shadow, no-useless-return, typescript/consistent-type-imports, unicorn/no-await-expression-member, unicorn/no-nested-ternary -- Platform diagnostics aggregate queue, LiveKit, mail, cache, and Feishu provider contracts in one parity service; provider SDK types and deliberate no-op probes are normalized at their boundaries. */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ImapFlow } from "imapflow";
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
import { RoomServiceClient } from "livekit-server-sdk";
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
import { matchesListTextFilters, parseListTextFilters } from "@arc/shared/list-text-filters";
import { TOP_LEVEL_DATABASE_PORT } from "../top-level.ports.js";
import type { TopLevelDatabasePort } from "../top-level.ports.js";
import type { TopLevelPlatformOperationsPort } from "./platform.port.js";
import type {
  platformCreateMailAccountSchema,
  platformLiveKitMetricsQuerySchema,
  platformLiveKitRoomsQuerySchema,
  platformMailAccountsQuerySchema,
  platformNotificationsQuerySchema,
  platformQueueJobsQuerySchema,
  platformResumeParseCacheQuerySchema,
  platformUpdateMailAccountSchema,
} from "./platform.schemas.js";
import { z } from "zod";
import { syncInterviewEvaluationDocument } from "./feishu-document-structure.js";

function encryptSecret(value: string) {
  const secret = process.env.MAIL_INGEST_SECRET_KEY?.trim();
  if (!secret) {
    throw new BadRequestException("Mail ingest encryption is not configured", {
      errorCode: "MAIL_INGEST_SECRET_MISSING",
    });
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function toIso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function paginate<T>(records: T[], page: number, pageSize: number) {
  const total = records.length;
  return {
    page,
    pageSize,
    records: records.slice((page - 1) * pageSize, page * pageSize),
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function liveKitUrl() {
  const value = process.env.LIVEKIT_URL?.trim();
  if (!value) {
    throw new Error("LiveKit is not configured");
  }
  const url = new URL(value);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  return url.origin;
}

function roomRecord(room: Awaited<ReturnType<RoomServiceClient["listRooms"]>>[number]) {
  const created =
    room.creationTimeMs > 0n ? Number(room.creationTimeMs) : Number(room.creationTime) * 1000;
  return {
    activeRecording: room.activeRecording,
    createdAt: created > 0 ? new Date(created).toISOString() : null,
    emptyTimeout: room.emptyTimeout,
    maxParticipants: room.maxParticipants,
    name: room.name,
    numParticipants: room.numParticipants,
    numPublishers: room.numPublishers,
    sid: room.sid,
  };
}

function participantStateLabel(state: number) {
  return ["连接中", "已连接", "活跃", "已断开"][state] ?? `未知 (${state})`;
}

function participantKindLabel(kind: number) {
  return (
    new Map([
      [0, "标准用户"],
      [1, "Ingress"],
      [2, "Egress"],
      [3, "SIP"],
      [4, "Agent"],
      [7, "Connector"],
      [8, "Bridge"],
    ]).get(kind) ?? `未知 (${kind})`
  );
}

function trackTypeLabel(type: number) {
  return ["音频", "视频", "数据"][type] ?? `未知 (${type})`;
}

function trackSourceLabel(source: number) {
  return (
    new Map([
      [0, "未知"],
      [1, "摄像头"],
      [2, "麦克风"],
      [3, "屏幕共享"],
      [4, "屏幕共享音频"],
    ]).get(source) ?? `未知 (${source})`
  );
}

function participantRecord(
  participant: Awaited<ReturnType<RoomServiceClient["listParticipants"]>>[number],
) {
  const joined =
    participant.joinedAtMs > 0n
      ? Number(participant.joinedAtMs)
      : Number(participant.joinedAt) * 1000;
  return {
    attributes: participant.attributes,
    identity: participant.identity,
    isPublisher: participant.isPublisher,
    joinedAt: joined > 0 ? new Date(joined).toISOString() : null,
    kind: participantKindLabel(participant.kind),
    metadata: participant.metadata,
    name: participant.name,
    region: participant.region,
    sid: participant.sid,
    state: participantStateLabel(participant.state),
    tracks: participant.tracks.map((track) => ({
      height: track.height,
      mimeType: track.mimeType,
      muted: track.muted,
      name: track.name,
      sid: track.sid,
      source: trackSourceLabel(track.source),
      type: trackTypeLabel(track.type),
      width: track.width,
    })),
  };
}

function parseMetrics(text: string) {
  const help = new Map<string, string>();
  const types = new Map<string, string>();
  const records: {
    help: string | null;
    labels: Record<string, string>;
    name: string;
    type: string | null;
    value: number | string;
  }[] = [];
  for (const line of text.split("\n")) {
    const helpMatch = /^# HELP\s+(\S+)\s+(.+)$/u.exec(line);
    if (helpMatch) {
      help.set(helpMatch[1], helpMatch[2]);
      continue;
    }
    const typeMatch = /^# TYPE\s+(\S+)\s+(\S+)$/u.exec(line);
    if (typeMatch) {
      types.set(typeMatch[1], typeMatch[2]);
      continue;
    }
    const metric = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?$/u.exec(line);
    if (!metric) {
      continue;
    }
    const labels = Object.fromEntries(
      [...(metric[2] ?? "").matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/gu)].map(
        (match) => [match[1], match[2].replaceAll('\\"', '"').replaceAll("\\\\", "\\")],
      ),
    );
    const numeric = Number(metric[3]);
    records.push({
      help: help.get(metric[1]) ?? null,
      labels,
      name: metric[1],
      type: types.get(metric[1]) ?? null,
      value: Number.isFinite(numeric) ? numeric : metric[3],
    });
  }
  return records;
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
  return;
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
export class PlatformOperationsService implements TopLevelPlatformOperationsPort {
  constructor(
    @Inject(TOP_LEVEL_DATABASE_PORT)
    private readonly database: TopLevelDatabasePort,
  ) {}

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

  async createMailAccount(input: z.infer<typeof platformCreateMailAccountSchema>) {
    const [scope] = await this.database
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .limit(1);
    if (!scope) {
      throw new NotFoundException("Workspace member not found", {
        errorCode: "MAIL_INGEST_MEMBER_NOT_FOUND",
      });
    }
    await this.validateMailLogin(input);
    const [row] = await this.database
      .insert(mailIngestAccount)
      .values({
        emailAddress: input.emailAddress,
        enabled: input.enabled,
        encryptedPassword: encryptSecret(input.password),
        failedMailbox: input.failedMailbox,
        id: crypto.randomUUID(),
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecure: input.imapSecure,
        listenStartAt: input.listenStartAt ? new Date(input.listenStartAt) : null,
        mailbox: input.mailbox,
        organizationId: input.organizationId,
        processedMailbox: input.processedMailbox,
        subjectKeyword: input.subjectKeyword,
        userId: input.userId,
        username: input.username,
      })
      .returning();
    return this.presentMail(row);
  }

  async updateMailAccount(id: string, input: z.infer<typeof platformUpdateMailAccountSchema>) {
    const [existing] = await this.database
      .select()
      .from(mailIngestAccount)
      .where(
        and(
          eq(mailIngestAccount.id, id),
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException("Mail ingest account not found", {
        errorCode: "MAIL_INGEST_ACCOUNT_NOT_FOUND",
      });
    }
    const [row] = await this.database
      .update(mailIngestAccount)
      .set({
        emailAddress: input.emailAddress,
        enabled: input.enabled,
        encryptedPassword: input.password ? encryptSecret(input.password) : undefined,
        failedMailbox: input.failedMailbox,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecure: input.imapSecure,
        listenStartAt:
          input.listenStartAt === undefined
            ? undefined
            : input.listenStartAt
              ? new Date(input.listenStartAt)
              : null,
        mailbox: input.mailbox,
        processedMailbox: input.processedMailbox,
        subjectKeyword: input.subjectKeyword,
        updatedAt: new Date(),
        username: input.username,
      })
      .where(eq(mailIngestAccount.id, id))
      .returning();
    return this.presentMail(row);
  }

  async listQueues() {
    const [{ getResumeParseQueueOverview }, { getResumeReviewGenerationQueueOverview }] =
      await Promise.all([
        import("@arc/resume-parse-queue/resume-parse"),
        import("@arc/resume-parse-queue/resume-review-generation"),
      ]);
    const records = await Promise.all([
      getResumeParseQueueOverview(),
      getResumeReviewGenerationQueueOverview(),
    ]);
    return { records, total: records.length };
  }

  async getQueueJobs(queueName: string, query: z.infer<typeof platformQueueJobsQuerySchema>) {
    const resume = await import("@arc/resume-parse-queue/resume-parse");
    const review = await import("@arc/resume-parse-queue/resume-review-generation");
    if (queueName === review.RESUME_REVIEW_GENERATION_QUEUE_NAME) {
      const result = await review.listResumeReviewGenerationQueueJobs({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        state: query.state,
      });
      return {
        ...result,
        records: result.records.map((record) => ({
          ...record,
          organization: null,
          resumeDetail: null,
          triggeredBy: null,
        })),
      };
    }
    if (queueName !== resume.RESUME_PARSE_QUEUE_NAME) {
      throw new NotFoundException("Queue not found", { errorCode: "PLATFORM_QUEUE_NOT_FOUND" });
    }
    if (query.parseStatus === "all" && query.uploadStatus === "all") {
      return this.enrichResumeQueueJobs(
        await resume.listResumeParseQueueJobs({
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          state: query.state,
        }),
      );
    }
    const records = await resume.listAllResumeParseQueueJobs({
      search: query.search,
      state: query.state,
    });
    const enriched = await this.enrichResumeQueueJobs({
      page: 1,
      pageSize: Math.max(1, records.length),
      records,
      state: query.state,
      total: records.length,
      totalPages: records.length > 0 ? 1 : 0,
    });
    const filtered = enriched.records.filter((record) => {
      if (!record.resumeDetail) {
        return false;
      }
      return (
        (query.uploadStatus === "all" || record.resumeDetail.itemStatus === query.uploadStatus) &&
        (query.parseStatus === "all" || record.resumeDetail.resumeParseStatus === query.parseStatus)
      );
    });
    const offset = (query.page - 1) * query.pageSize;
    return {
      ...enriched,
      page: query.page,
      pageSize: query.pageSize,
      records: filtered.slice(offset, offset + query.pageSize),
      total: filtered.length,
      totalPages: filtered.length > 0 ? Math.ceil(filtered.length / query.pageSize) : 0,
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

  private async enrichResumeQueueJobs(
    result: Awaited<
      ReturnType<
        (typeof import("@arc/resume-parse-queue/resume-parse"))["listResumeParseQueueJobs"]
      >
    >,
  ) {
    const itemIds = result.records.flatMap((record) => {
      const parsed = z
        .object({ itemId: z.string().min(1) })
        .passthrough()
        .safeParse(record.data);
      return parsed.success ? [parsed.data.itemId] : [];
    });
    const uniqueItemIds = [...new Set(itemIds)];
    const rows =
      uniqueItemIds.length === 0
        ? []
        : await this.database
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
            .where(inArray(resumeUploadBatchItem.id, uniqueItemIds));
    const details = new Map(
      rows.map((row) => [
        row.itemId,
        {
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
        },
      ]),
    );
    return {
      ...result,
      records: result.records.map((record) => {
        const parsed = z
          .object({ itemId: z.string().min(1) })
          .passthrough()
          .safeParse(record.data);
        const detail = parsed.success ? (details.get(parsed.data.itemId) ?? null) : null;
        return {
          ...record,
          organization: detail
            ? {
                id: detail.organizationId,
                name: detail.organizationName,
                slug: detail.organizationSlug,
              }
            : null,
          resumeDetail: detail,
          triggeredBy: detail
            ? {
                email: detail.userEmail,
                id: detail.userId,
                image: detail.userImage,
                name: detail.userName,
              }
            : null,
        };
      }),
    };
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
    if (!row) {
      throw new NotFoundException("Resume parse cache entry not found", {
        errorCode: "RESUME_PARSE_CACHE_NOT_FOUND",
      });
    }
    return { ...row, createdAt: row.createdAt.toISOString(), parsedAt: toIso(row.parsedAt) };
  }

  async deleteResumeParseCache(hash: string) {
    const rows = await this.database
      .update(chatAttachment)
      .set({
        parsedAt: null,
        parsedError: null,
        parsedPageCount: null,
        parsedStatus: "failed",
        parsedStructured: null,
        parsedText: null,
        parsedTextSource: null,
      })
      .where(
        and(
          eq(chatAttachment.contentHash, hash),
          or(
            ne(chatAttachment.parsedStatus, "failed"),
            isNotNull(chatAttachment.parsedStructured),
            isNotNull(chatAttachment.parsedText),
          ),
        ),
      )
      .returning({ id: chatAttachment.id });
    if (rows.length === 0) {
      throw new NotFoundException("Resume parse cache entry not found", {
        errorCode: "RESUME_PARSE_CACHE_NOT_FOUND",
      });
    }
    return { clearedCount: rows.length };
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

  async resendNotification(id: string) {
    const [row] = await this.database
      .update(interviewNotification)
      .set({
        error: null,
        lastErrorCode: null,
        nextAttemptAt: new Date(),
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(interviewNotification.id, id))
      .returning({ id: interviewNotification.id, status: interviewNotification.status });
    if (!row) {
      throw new NotFoundException("Notification not found", {
        errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      });
    }
    return row;
  }

  async updateNotificationDocumentStructure(id: string) {
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
    if (!row) {
      throw new NotFoundException("Notification not found", {
        errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      });
    }
    if (!row.documentUrl) {
      throw new ConflictException("Notification document is not available", {
        errorCode: "PLATFORM_NOTIFICATION_DOCUMENT_NOT_FOUND",
      });
    }
    if (row.type !== "summary_ready") {
      throw new ConflictException(
        "Document structure update is unavailable for this notification",
        { errorCode: "PLATFORM_NOTIFICATION_STRUCTURE_UNAVAILABLE" },
      );
    }
    if (!(row.providerId === "feishu" || row.providerId === "feishu-jiguang-hr")) {
      throw new BadRequestException("Unsupported Feishu provider", {
        errorCode: "PLATFORM_NOTIFICATION_PROVIDER_UNSUPPORTED",
      });
    }

    const documentId =
      row.documentId?.trim() ||
      (() => {
        try {
          const [kind, id] = new URL(row.documentUrl).pathname.split("/").filter(Boolean);
          return kind === "docx" ? id : undefined;
        } catch {
          return;
        }
      })();
    if (!documentId) {
      throw new ConflictException("Notification document id is unavailable", {
        errorCode: "PLATFORM_NOTIFICATION_DOCUMENT_NOT_FOUND",
      });
    }
    const result = await syncInterviewEvaluationDocument({
      accessToken: await this.feishuAccessToken(row.providerId),
      documentId,
      evaluation:
        row.resumeEvaluationArtifactMode === "qualitative" ? row.qualitativeResumeEvaluation : null,
      questions: row.interviewQuestions,
    });
    return { documentUrl: row.documentUrl, ...result };
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
    if (!row) {
      throw new NotFoundException("Notification not found", {
        errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      });
    }
    if (row.type !== "summary_ready" || !row.conversationId || !row.transcript) {
      throw new ConflictException("Notification has no interview session available for preview", {
        errorCode: "PLATFORM_NOTIFICATION_PREVIEW_UNAVAILABLE",
      });
    }
    const prompt = `你是一位 HR 信息整理助手。只根据以下候选人面试对话，整理 jobMotivation、availability、overseasTravel、compensationExpectations、careerProgression、recentWork、projectHighlights 七个字段。没有证据的字段返回 null。只输出 JSON。\n\n${row.transcript.map((turn) => `${turn.role === "agent" ? "面试官" : "候选人"}：${turn.message}`).join("\n")}`;
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new BadRequestException("AI provider is not configured", {
        errorCode: "AI_PROVIDER_CONFIGURATION_MISSING",
      });
    }
    const endpoint = `${(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/u, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        messages: [{ content: prompt, role: "user" }],
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new BadGatewayException(`AI provider returned HTTP ${response.status}`, {
        errorCode: "AI_PROVIDER_REQUEST_FAILED",
      });
    }
    const responseBody = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const evaluation = JSON.parse(responseBody.choices?.[0]?.message?.content || "{}") as Record<
      string,
      string | null
    >;
    const fields = [
      ["求职动机", "jobMotivation"],
      ["最快到岗时间", "availability"],
      ["海外出差情况", "overseasTravel"],
      ["薪酬预期沟通", "compensationExpectations"],
      ["加薪晋升情况", "careerProgression"],
      ["最近两份工作", "recentWork"],
      ["亮点项目", "projectHighlights"],
    ] as const;
    const children = [
      {
        block_type: 2,
        text: {
          elements: [{ text_run: { content: "HR面试评价", text_element_style: { bold: true } } }],
        },
      },
      ...fields.flatMap(([label, key], index) => [
        this.textBlock(`${index + 1}. ${label}：`),
        this.textBlock(evaluation[key]?.trim() || "未收集到"),
      ]),
    ];
    return {
      block: {
        block_type: 19,
        callout: { background_color: 2, border_color: 2, emoji_id: "books" },
        children,
      },
      prompt,
      title: `${row.candidateName} - HR面试评价预览`,
    };
  }

  async grantNotificationDocumentAccess(input: { id: string; userId: string }) {
    const [row] = await this.database
      .select({
        documentId: interviewNotification.feishuDocumentId,
        documentUrl: interviewNotification.feishuDocumentUrl,
        id: interviewNotification.id,
        providerId: interviewNotification.providerId,
        recipientOpenId: interviewNotification.recipientOpenId,
      })
      .from(interviewNotification)
      .where(eq(interviewNotification.id, input.id))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Notification not found", {
        errorCode: "PLATFORM_NOTIFICATION_NOT_FOUND",
      });
    }
    if (!(row.documentId && row.documentUrl)) {
      throw new ConflictException("Notification document is not available", {
        errorCode: "PLATFORM_NOTIFICATION_DOCUMENT_NOT_FOUND",
      });
    }
    if (!(row.providerId === "feishu" || row.providerId === "feishu-jiguang-hr")) {
      throw new BadRequestException("Unsupported Feishu provider", {
        errorCode: "PLATFORM_NOTIFICATION_PROVIDER_UNSUPPORTED",
      });
    }
    const [currentAccount] = await this.database
      .select({ openId: account.accountId })
      .from(account)
      .where(and(eq(account.userId, input.userId), eq(account.providerId, row.providerId)))
      .orderBy(desc(account.updatedAt))
      .limit(1);
    if (!currentAccount) {
      throw new ConflictException("Current administrator has no linked Feishu account", {
        errorCode: "PLATFORM_NOTIFICATION_FEISHU_ACCOUNT_MISSING",
      });
    }
    if (currentAccount.openId !== row.recipientOpenId) {
      const accessToken = await this.feishuAccessToken(row.providerId);
      const response = await fetch(
        `https://open.feishu.cn/open-apis/drive/v1/permissions/${encodeURIComponent(row.documentId)}/members?type=docx`,
        {
          body: JSON.stringify({
            member_id: currentAccount.openId,
            member_type: "openid",
            perm: "edit",
            type: "user",
          }),
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        throw new BadGatewayException(
          `Feishu document permission returned HTTP ${response.status}`,
          { errorCode: "FEISHU_DOCUMENT_PERMISSION_FAILED" },
        );
      }
      const body = (await response.json()) as { code?: number; msg?: string };
      if (body.code) {
        throw new BadGatewayException(body.msg || "Feishu document permission failed", {
          errorCode: "FEISHU_DOCUMENT_PERMISSION_FAILED",
        });
      }
    }
    return { documentUrl: row.documentUrl };
  }

  async getLiveKitOverview() {
    const startedAt = performance.now();
    try {
      const rooms = await this.roomService().listRooms();
      return {
        endpoint: liveKitUrl(),
        latencyMs: Math.round(performance.now() - startedAt),
        metricsConfigured: Boolean(process.env.LIVEKIT_PROMETHEUS_URL),
        status: "online",
        totals: {
          activeRecordings: rooms.filter((room) => room.activeRecording).length,
          participants: rooms.reduce((sum, room) => sum + room.numParticipants, 0),
          publishers: rooms.reduce((sum, room) => sum + room.numPublishers, 0),
          rooms: rooms.length,
        },
      };
    } catch (error) {
      return {
        endpoint: process.env.LIVEKIT_URL ?? null,
        error: error instanceof Error ? error.message : "LiveKit unavailable",
        latencyMs: Math.round(performance.now() - startedAt),
        metricsConfigured: Boolean(process.env.LIVEKIT_PROMETHEUS_URL),
        status: "offline",
        totals: { activeRecordings: 0, participants: 0, publishers: 0, rooms: 0 },
      };
    }
  }

  async listLiveKitRooms(query: z.infer<typeof platformLiveKitRoomsQuerySchema>) {
    try {
      const keyword = query.search?.trim().toLocaleLowerCase();
      const textFilters = parseListTextFilters(query.textFilters);
      const records = (await this.roomService().listRooms())
        .map(roomRecord)
        .filter((room) => matchesListTextFilters(textFilters, { name: room.name, sid: room.sid }))
        .filter(
          (room) =>
            !keyword ||
            room.name.toLocaleLowerCase().includes(keyword) ||
            room.sid.toLocaleLowerCase().includes(keyword),
        );
      return paginate(records, query.page, query.pageSize);
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error ? error.message : "LiveKit unavailable",
        { errorCode: "LIVEKIT_UPSTREAM_FAILED" },
      );
    }
  }

  async getLiveKitRoom(roomName: string) {
    try {
      const client = this.roomService();
      const [room] = await client.listRooms([roomName]);
      if (!room) {
        throw new NotFoundException("LiveKit room not found", {
          errorCode: "LIVEKIT_ROOM_NOT_FOUND",
        });
      }
      const participants = await client.listParticipants(roomName);
      return {
        metadata: room.metadata,
        participants: participants.map(participantRecord),
        room: roomRecord(room),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadGatewayException(
        error instanceof Error ? error.message : "LiveKit unavailable",
        { errorCode: "LIVEKIT_UPSTREAM_FAILED" },
      );
    }
  }

  async getLiveKitMetrics(query: z.infer<typeof platformLiveKitMetricsQuerySchema>) {
    const metricsUrl = process.env.LIVEKIT_PROMETHEUS_URL?.trim();
    if (!metricsUrl) {
      return { configured: false, ...paginate([], query.page, query.pageSize) };
    }
    const response = await fetch(metricsUrl, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new BadGatewayException(`Prometheus returned HTTP ${response.status}`, {
        errorCode: "PROMETHEUS_UPSTREAM_FAILED",
      });
    }
    const keyword = query.search?.trim().toLocaleLowerCase();
    const textFilters = parseListTextFilters(query.textFilters);
    const records = parseMetrics(await response.text())
      .filter((metric) =>
        matchesListTextFilters(textFilters, { help: metric.help, name: metric.name }),
      )
      .filter(
        (metric) =>
          !keyword ||
          metric.name.toLocaleLowerCase().includes(keyword) ||
          metric.help?.toLocaleLowerCase().includes(keyword),
      );
    return { configured: true, ...paginate(records, query.page, query.pageSize) };
  }

  private roomService() {
    return new RoomServiceClient(
      liveKitUrl(),
      process.env.LIVEKIT_API_KEY?.trim(),
      process.env.LIVEKIT_API_SECRET?.trim(),
    );
  }

  private async validateMailLogin(input: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    password: string;
    username: string;
  }) {
    const client = new ImapFlow({
      auth: { pass: input.password, user: input.username },
      host: input.imapHost,
      logger: false,
      port: input.imapPort,
      secure: input.imapSecure,
    });
    try {
      await client.connect();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "IMAP login failed", {
        errorCode: "MAIL_INGEST_LOGIN_FAILED",
      });
    } finally {
      if (client.usable) {
        await client.logout().catch(() => {});
      }
    }
  }

  private presentMail(row: typeof mailIngestAccount.$inferSelect | undefined) {
    if (!row) {
      throw new NotFoundException("Mail ingest account not found", {
        errorCode: "MAIL_INGEST_ACCOUNT_NOT_FOUND",
      });
    }
    const { encryptedPassword: _encryptedPassword, ...safe } = row;
    return {
      ...safe,
      createdAt: safe.createdAt.toISOString(),
      lastCheckedAt: toIso(safe.lastCheckedAt),
      listenStartAt: toIso(safe.listenStartAt),
      pollingStartedAt: toIso(safe.pollingStartedAt),
      updatedAt: safe.updatedAt.toISOString(),
    };
  }

  private async feishuAccessToken(providerId: "feishu" | "feishu-jiguang-hr") {
    const secondary = providerId === "feishu-jiguang-hr";
    const appId = process.env[secondary ? "FEISHU_APP_ID2" : "FEISHU_APP_ID"]?.trim();
    const appSecret = process.env[secondary ? "FEISHU_APP_SECRET2" : "FEISHU_APP_SECRET"]?.trim();
    if (!(appId && appSecret)) {
      throw new BadRequestException("Feishu application is not configured", {
        errorCode: "FEISHU_CONFIGURATION_MISSING",
      });
    }
    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = (await response.json()) as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
    };
    if (!response.ok || body.code || !body.tenant_access_token) {
      throw new BadGatewayException(body.msg || "Feishu authentication failed", {
        errorCode: "FEISHU_AUTHENTICATION_FAILED",
      });
    }
    return body.tenant_access_token;
  }

  private textBlock(content: string) {
    return { block_type: 2, text: { elements: [{ text_run: { content } }] } };
  }
}
