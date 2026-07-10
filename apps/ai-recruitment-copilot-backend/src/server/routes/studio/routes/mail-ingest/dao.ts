import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  calcTotalPages,
  makePaginationSchema,
} from "@arc/ai-recruitment-copilot-backend/lib/server/db/pagination";
import type {
  PaginatedResult,
  PaginationParams,
} from "@arc/ai-recruitment-copilot-backend/lib/server/db/pagination";
import { listActiveDuplicateMatchCounts } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import {
  jobDescription,
  mailIngestAccount,
  mailIngestMessage,
  member,
  organization,
  resumePoolItem,
  resumeUploadBatchItem,
  user as userTable,
} from "@arc/db-schema/schema";
import type {
  MailIngestJdBindStatus,
  MailIngestMessageStatus,
  MailIngestSkipReason,
} from "@arc/db-schema/schema";
import type { ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import {
  decryptMailIngestSecret,
  encryptMailIngestSecret,
} from "@arc/ai-recruitment-copilot-backend/lib/server/mail-ingest-crypto";
import type { createMailIngestAccountSchema, updateMailIngestAccountSchema } from "./schema";
import type { MailIngestLoginConfig } from "./validation";
import type { z } from "zod";

const MAIL_INGEST_ACCOUNT_LEASE_MS = 14 * 60 * 1000;
const MAIL_INGEST_MESSAGE_PROCESSING_STALE_MS = 30 * 60 * 1000;
const ERROR_MESSAGE_MAX = 500;
const WORKSPACE_MAIL_INGEST_SORT_COLUMNS = [
  "userName",
  "userEmail",
  "emailAddress",
  "lastCheckedAt",
] as const;

type AccountRow = typeof mailIngestAccount.$inferSelect;
type CreateAccountInput = z.infer<typeof createMailIngestAccountSchema>;
type UpdateAccountInput = z.infer<typeof updateMailIngestAccountSchema>;
type WorkspaceMailIngestSortColumn = (typeof WORKSPACE_MAIL_INGEST_SORT_COLUMNS)[number];

export type WorkspaceMailIngestPaginationParams = PaginationParams<WorkspaceMailIngestSortColumn>;
export type PaginatedWorkspaceMailIngestAccountResult =
  PaginatedResult<WorkspaceMailIngestAccountRow>;
export type PaginatedPlatformMailIngestAccountResult =
  PaginatedResult<PlatformMailIngestAccountRow>;

const workspaceMailIngestPaginationSchema = makePaginationSchema(
  WORKSPACE_MAIL_INGEST_SORT_COLUMNS,
  {
    defaultSortBy: "userName",
    defaultSortOrder: "asc",
  },
);

export interface MailIngestAccountDto {
  createdAt: string;
  emailAddress: string;
  enabled: boolean;
  failedMailbox: string;
  hasPassword: boolean;
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  listenStartAt: string | null;
  mailbox: string;
  processedMailbox: string;
  subjectKeyword: string;
  updatedAt: string;
  username: string;
}

export interface WorkspaceMailIngestAccountRow {
  account: MailIngestAccountDto | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
  messageCount: number;
  problemCount: number;
  user: {
    email: string;
    id: string;
    image: string | null;
    name: string;
    role: string;
  };
}

export interface PlatformMailIngestAccountRow extends WorkspaceMailIngestAccountRow {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface WorkerMailIngestAccount {
  dedupPolicy: AccountRow["dedupPolicy"];
  emailAddress: string;
  failedMailbox: string;
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  jdMode: AccountRow["jdMode"];
  jobDescriptionId: string | null;
  listenStartAt: Date | null;
  mailbox: string;
  organizationId: string;
  password: string;
  processedMailbox: string;
  resumePoolScope: AccountRow["resumePoolScope"];
  subjectKeyword: string;
  target: AccountRow["target"];
  userId: string;
  username: string;
}

function truncateError(error: unknown): string {
  const parts = [error instanceof Error ? error.message : String(error)];
  if (error && typeof error === "object") {
    const responseStatus = "responseStatus" in error ? error.responseStatus : null;
    const responseText = "responseText" in error ? error.responseText : null;
    if (typeof responseStatus === "string" && responseStatus.trim()) {
      parts.push(responseStatus.trim());
    }
    if (typeof responseText === "string" && responseText.trim()) {
      parts.push(responseText.trim());
    }
  }
  const message = parts.join(" · ");
  return message.length > ERROR_MESSAGE_MAX ? message.slice(0, ERROR_MESSAGE_MAX) : message;
}

function parseNullableDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return new Date(value);
}

function toDto(row: AccountRow): MailIngestAccountDto {
  return {
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
  };
}

function toNullableAccountDto(row: {
  accountCreatedAt: Date | null;
  accountEmailAddress: string | null;
  accountEnabled: boolean | null;
  accountEncryptedPassword: string | null;
  accountFailedMailbox: string | null;
  accountId: string | null;
  accountImapHost: string | null;
  accountImapPort: number | null;
  accountImapSecure: boolean | null;
  accountLastCheckedAt: Date | null;
  accountLastError: string | null;
  accountListenStartAt: Date | null;
  accountMailbox: string | null;
  accountProcessedMailbox: string | null;
  accountSubjectKeyword: string | null;
  accountUpdatedAt: Date | null;
  accountUsername: string | null;
}): MailIngestAccountDto | null {
  if (!row.accountId) {
    return null;
  }
  return {
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
  };
}

function toWorkerAccount(row: AccountRow): WorkerMailIngestAccount {
  return {
    dedupPolicy: row.dedupPolicy,
    emailAddress: row.emailAddress,
    failedMailbox: row.failedMailbox,
    id: row.id,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    jdMode: row.jdMode,
    jobDescriptionId: row.jobDescriptionId,
    listenStartAt: row.listenStartAt,
    mailbox: row.mailbox,
    organizationId: row.organizationId,
    password: decryptMailIngestSecret(row.encryptedPassword),
    processedMailbox: row.processedMailbox,
    resumePoolScope: row.resumePoolScope,
    subjectKeyword: row.subjectKeyword,
    target: row.target,
    userId: row.userId,
    username: row.username,
  };
}

function toLoginConfig(row: AccountRow): MailIngestLoginConfig {
  return {
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    mailbox: row.mailbox,
    password: decryptMailIngestSecret(row.encryptedPassword),
    username: row.username,
  };
}

export async function isWorkspaceMember({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function listMailIngestAccounts(
  organizationId: string,
  userId: string,
): Promise<MailIngestAccountDto[]> {
  const rows = await db
    .select()
    .from(mailIngestAccount)
    .where(
      and(
        eq(mailIngestAccount.organizationId, organizationId),
        eq(mailIngestAccount.userId, userId),
      ),
    )
    .orderBy(mailIngestAccount.createdAt);
  return rows.map(toDto);
}

function buildWorkspaceMailIngestFilters({
  organizationId,
  search,
  userId,
}: {
  organizationId: string;
  search?: string;
  userId?: string;
}) {
  const filters: SQL[] = [eq(member.organizationId, organizationId)];
  if (userId) {
    filters.push(eq(member.userId, userId));
  }
  if (search) {
    const pattern = `%${search}%`;
    const searchCondition = or(
      ilike(userTable.name, pattern),
      ilike(userTable.email, pattern),
      ilike(mailIngestAccount.emailAddress, pattern),
      ilike(mailIngestAccount.username, pattern),
      ilike(mailIngestAccount.imapHost, pattern),
      ilike(mailIngestAccount.subjectKeyword, pattern),
    );
    if (searchCondition) {
      filters.push(searchCondition);
    }
  }
  return and(...filters);
}

function buildPlatformMailIngestFilters({ search }: { search?: string }) {
  if (search) {
    const pattern = `%${search}%`;
    return or(
      ilike(organization.name, pattern),
      ilike(organization.slug, pattern),
      ilike(userTable.name, pattern),
      ilike(userTable.email, pattern),
      ilike(mailIngestAccount.emailAddress, pattern),
      ilike(mailIngestAccount.username, pattern),
      ilike(mailIngestAccount.imapHost, pattern),
      ilike(mailIngestAccount.subjectKeyword, pattern),
    );
  }
}

function buildWorkspaceMailIngestOrderBy(
  sortBy: WorkspaceMailIngestSortColumn,
  sortOrder: "asc" | "desc",
) {
  const direction = sortOrder === "asc" ? asc : desc;
  const primaryColumn = {
    emailAddress: mailIngestAccount.emailAddress,
    lastCheckedAt: mailIngestAccount.lastCheckedAt,
    userEmail: userTable.email,
    userName: userTable.name,
  }[sortBy];
  return [
    asc(isNull(mailIngestAccount.id)),
    direction(primaryColumn),
    asc(userTable.email),
    asc(mailIngestAccount.emailAddress),
  ];
}

function listWorkspaceMailIngestAccountRows({
  limit,
  offset,
  organizationId,
  search,
  sortBy = "userName",
  sortOrder = "asc",
  userId,
}: {
  limit?: number;
  offset?: number;
  organizationId: string;
  search?: string;
  sortBy?: WorkspaceMailIngestSortColumn;
  sortOrder?: "asc" | "desc";
  userId?: string;
}) {
  const where = buildWorkspaceMailIngestFilters({ organizationId, search, userId });
  let query = db
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
      userEmail: userTable.email,
      userId: userTable.id,
      userImage: userTable.image,
      userName: userTable.name,
    })
    .from(member)
    .innerJoin(userTable, eq(userTable.id, member.userId))
    .leftJoin(
      mailIngestAccount,
      and(
        eq(mailIngestAccount.organizationId, member.organizationId),
        eq(mailIngestAccount.userId, member.userId),
      ),
    )
    .where(where)
    .orderBy(...buildWorkspaceMailIngestOrderBy(sortBy, sortOrder))
    .$dynamic();

  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (offset !== undefined) {
    query = query.offset(offset);
  }

  return query;
}

function listPlatformMailIngestAccountRows({
  limit,
  offset,
  search,
  sortBy = "userName",
  sortOrder = "asc",
}: {
  limit?: number;
  offset?: number;
  search?: string;
  sortBy?: WorkspaceMailIngestSortColumn;
  sortOrder?: "asc" | "desc";
}) {
  const where = buildPlatformMailIngestFilters({ search });
  let query = db
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
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      problemCount: sql<number>`(select count(*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id} and status in ('failed','skipped'))`,
      userEmail: userTable.email,
      userId: userTable.id,
      userImage: userTable.image,
      userName: userTable.name,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(userTable, eq(userTable.id, member.userId))
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
      ...buildWorkspaceMailIngestOrderBy(sortBy, sortOrder).slice(1),
    )
    .$dynamic();

  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (offset !== undefined) {
    query = query.offset(offset);
  }

  return query;
}

async function countWorkspaceMailIngestAccountRows({
  organizationId,
  search,
  userId,
}: {
  organizationId: string;
  search?: string;
  userId?: string;
}) {
  const where = buildWorkspaceMailIngestFilters({ organizationId, search, userId });
  const [result] = await db
    .select({ count: count() })
    .from(member)
    .innerJoin(userTable, eq(userTable.id, member.userId))
    .leftJoin(
      mailIngestAccount,
      and(
        eq(mailIngestAccount.organizationId, member.organizationId),
        eq(mailIngestAccount.userId, member.userId),
      ),
    )
    .where(where);
  return result?.count ?? 0;
}

async function countPlatformMailIngestAccountRows({ search }: { search?: string }) {
  const where = buildPlatformMailIngestFilters({ search });
  const [result] = await db
    .select({ count: count() })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(userTable, eq(userTable.id, member.userId))
    .leftJoin(
      mailIngestAccount,
      and(
        eq(mailIngestAccount.organizationId, member.organizationId),
        eq(mailIngestAccount.userId, member.userId),
      ),
    )
    .where(where);
  return result?.count ?? 0;
}

function toWorkspaceMailIngestAccountRow(
  row: Awaited<ReturnType<typeof listWorkspaceMailIngestAccountRows>>[number],
): WorkspaceMailIngestAccountRow {
  return {
    account: toNullableAccountDto(row),
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

function toPlatformMailIngestAccountRow(
  row: Awaited<ReturnType<typeof listPlatformMailIngestAccountRows>>[number],
): PlatformMailIngestAccountRow {
  return {
    ...toWorkspaceMailIngestAccountRow(row),
    organization: {
      id: row.organizationId,
      name: row.organizationName,
      slug: row.organizationSlug,
    },
  };
}

function parseWorkspaceMailIngestSearch(search?: string | null) {
  const trimmed = search?.trim();
  return trimmed || undefined;
}

export async function listWorkspaceMailIngestAccounts(
  organizationId: string,
  options: { search?: string | null; userId?: string } = {},
): Promise<WorkspaceMailIngestAccountRow[]> {
  const rows = await listWorkspaceMailIngestAccountRows({
    organizationId,
    search: parseWorkspaceMailIngestSearch(options.search),
    userId: options.userId,
  });

  return rows.map(toWorkspaceMailIngestAccountRow);
}

export async function queryPaginatedWorkspaceMailIngestAccounts(
  organizationId: string,
  options: { search?: string | null; userId?: string } = {},
  pagination?: Record<string, unknown>,
): Promise<PaginatedWorkspaceMailIngestAccountResult> {
  const { page, pageSize, sortBy, sortOrder } = workspaceMailIngestPaginationSchema.parse(
    pagination ?? {},
  );
  const search = parseWorkspaceMailIngestSearch(options.search);
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listWorkspaceMailIngestAccountRows({
      limit: pageSize,
      offset,
      organizationId,
      search,
      sortBy,
      sortOrder,
      userId: options.userId,
    }),
    countWorkspaceMailIngestAccountRows({
      organizationId,
      search,
      userId: options.userId,
    }),
  ]);

  return {
    page,
    pageSize,
    records: rows.map(toWorkspaceMailIngestAccountRow),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export async function queryPaginatedPlatformMailIngestAccounts(
  options: { search?: string | null } = {},
  pagination?: Record<string, unknown>,
): Promise<PaginatedPlatformMailIngestAccountResult> {
  const { page, pageSize, sortBy, sortOrder } = workspaceMailIngestPaginationSchema.parse(
    pagination ?? {},
  );
  const search = parseWorkspaceMailIngestSearch(options.search);
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listPlatformMailIngestAccountRows({
      limit: pageSize,
      offset,
      search,
      sortBy,
      sortOrder,
    }),
    countPlatformMailIngestAccountRows({ search }),
  ]);

  return {
    page,
    pageSize,
    records: rows.map(toPlatformMailIngestAccountRow),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export async function createMailIngestAccount({
  input,
  organizationId,
  userId,
}: {
  input: CreateAccountInput;
  organizationId: string;
  userId: string;
}): Promise<MailIngestAccountDto> {
  const now = new Date();
  const [row] = await db
    .insert(mailIngestAccount)
    .values({
      createdAt: now,
      emailAddress: input.emailAddress,
      enabled: input.enabled,
      encryptedPassword: encryptMailIngestSecret(input.password),
      failedMailbox: input.failedMailbox,
      id: crypto.randomUUID(),
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecure: input.imapSecure,
      listenStartAt:
        input.listenStartAt === undefined ? now : (parseNullableDate(input.listenStartAt) ?? null),
      mailbox: input.mailbox,
      organizationId,
      processedMailbox: input.processedMailbox,
      subjectKeyword: input.subjectKeyword,
      updatedAt: now,
      userId,
      username: input.username,
    })
    .returning();
  return toDto(row);
}

export async function getMailIngestAccountLoginConfig({
  id,
  organizationId,
  userId,
}: {
  id: string;
  organizationId: string;
  userId?: string;
}): Promise<MailIngestLoginConfig | null> {
  const filters = [
    eq(mailIngestAccount.id, id),
    eq(mailIngestAccount.organizationId, organizationId),
  ];
  if (userId) {
    filters.push(eq(mailIngestAccount.userId, userId));
  }
  const [row] = await db
    .select()
    .from(mailIngestAccount)
    .where(and(...filters))
    .limit(1);
  return row ? toLoginConfig(row) : null;
}

function buildAccountUpdateValues(input: UpdateAccountInput) {
  const updateValues: Partial<typeof mailIngestAccount.$inferInsert> = {
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
      updateValues[key] = input[key] as never;
    }
  }
  if (input.listenStartAt !== undefined) {
    updateValues.listenStartAt = parseNullableDate(input.listenStartAt) ?? null;
  }
  if (input.password) {
    updateValues.encryptedPassword = encryptMailIngestSecret(input.password);
  }
  return updateValues;
}

export async function updateMailIngestAccount({
  id,
  input,
  organizationId,
  userId,
}: {
  id: string;
  input: UpdateAccountInput;
  organizationId: string;
  userId: string;
}): Promise<MailIngestAccountDto | null> {
  const updateValues = buildAccountUpdateValues(input);
  const [row] = await db
    .update(mailIngestAccount)
    .set(updateValues)
    .where(
      and(
        eq(mailIngestAccount.id, id),
        eq(mailIngestAccount.organizationId, organizationId),
        eq(mailIngestAccount.userId, userId),
      ),
    )
    .returning();
  return row ? toDto(row) : null;
}

export async function updateWorkspaceMailIngestAccount({
  id,
  input,
  organizationId,
  userId,
}: {
  id: string;
  input: UpdateAccountInput;
  organizationId: string;
  userId?: string;
}): Promise<MailIngestAccountDto | null> {
  const filters = [
    eq(mailIngestAccount.id, id),
    eq(mailIngestAccount.organizationId, organizationId),
  ];
  if (userId) {
    filters.push(eq(mailIngestAccount.userId, userId));
  }

  const [row] = await db
    .update(mailIngestAccount)
    .set(buildAccountUpdateValues(input))
    .where(and(...filters))
    .returning();
  return row ? toDto(row) : null;
}

export async function deleteMailIngestAccount({
  id,
  organizationId,
  userId,
}: {
  id: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const rows = await db
    .delete(mailIngestAccount)
    .where(
      and(
        eq(mailIngestAccount.id, id),
        eq(mailIngestAccount.organizationId, organizationId),
        eq(mailIngestAccount.userId, userId),
      ),
    )
    .returning({ id: mailIngestAccount.id });
  return rows.length > 0;
}

export async function listEnabledMailIngestAccounts(
  limit = 20,
): Promise<WorkerMailIngestAccount[]> {
  const rows = await db
    .select()
    .from(mailIngestAccount)
    .where(eq(mailIngestAccount.enabled, true))
    .orderBy(mailIngestAccount.lastCheckedAt)
    .limit(limit);
  return rows.map(toWorkerAccount);
}

export async function claimMailIngestAccount(accountId: string): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - MAIL_INGEST_ACCOUNT_LEASE_MS);
  const rows = await db
    .update(mailIngestAccount)
    .set({ lastError: null, pollingStartedAt: now, updatedAt: now })
    .where(
      and(
        eq(mailIngestAccount.id, accountId),
        eq(mailIngestAccount.enabled, true),
        or(
          isNull(mailIngestAccount.pollingStartedAt),
          lt(mailIngestAccount.pollingStartedAt, staleBefore),
        ),
      ),
    )
    .returning({ id: mailIngestAccount.id });
  return rows.length > 0;
}

export async function finishMailIngestAccountRun(
  accountId: string,
  opts?: {
    error?: unknown;
    counts?: {
      received: number;
      subjectSkipped: number;
      matched: number;
      queued: number;
      failed: number;
    };
  },
): Promise<void> {
  const now = new Date();
  await db
    .update(mailIngestAccount)
    .set({
      lastCheckedAt: now,
      lastError: opts?.error ? truncateError(opts.error) : null,
      pollingStartedAt: null,
      updatedAt: now,
      ...(opts?.counts
        ? {
            lastRunFailed: opts.counts.failed,
            lastRunMatched: opts.counts.matched,
            lastRunQueued: opts.counts.queued,
            lastRunReceived: opts.counts.received,
            lastRunSubjectSkipped: opts.counts.subjectSkipped,
          }
        : {}),
    })
    .where(eq(mailIngestAccount.id, accountId));
}

export interface MailIngestMessageClaim {
  id: string;
  moveTo: "processed" | "failed" | null;
  shouldProcess: boolean;
  status: MailIngestMessageStatus;
}

export async function claimMailIngestMessageForProcessing(input: {
  accountId: string;
  fromAddress: string | null;
  mailbox: string;
  messageId: string | null;
  receivedAt: Date | null;
  subject: string | null;
  uid: string;
  uidValidity: string;
}): Promise<MailIngestMessageClaim> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - MAIL_INGEST_MESSAGE_PROCESSING_STALE_MS);
  const [row] = await db
    .insert(mailIngestMessage)
    .values({
      accountId: input.accountId,
      fromAddress: input.fromAddress,
      id: crypto.randomUUID(),
      mailbox: input.mailbox,
      messageId: input.messageId,
      processedAt: now,
      receivedAt: input.receivedAt,
      status: "processing",
      subject: input.subject,
      uid: input.uid,
      uidValidity: input.uidValidity,
    })
    .onConflictDoNothing({
      target: [
        mailIngestMessage.accountId,
        mailIngestMessage.mailbox,
        mailIngestMessage.uidValidity,
        mailIngestMessage.uid,
      ],
    })
    .returning({ id: mailIngestMessage.id, status: mailIngestMessage.status });
  if (row) {
    return { id: row.id, moveTo: null, shouldProcess: true, status: row.status };
  }

  const [existing] = await db
    .select({
      id: mailIngestMessage.id,
      processedAt: mailIngestMessage.processedAt,
      status: mailIngestMessage.status,
    })
    .from(mailIngestMessage)
    .where(
      and(
        eq(mailIngestMessage.accountId, input.accountId),
        eq(mailIngestMessage.mailbox, input.mailbox),
        eq(mailIngestMessage.uidValidity, input.uidValidity),
        eq(mailIngestMessage.uid, input.uid),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("邮件处理记录 claim 失败。");
  }
  if (existing.status !== "processing") {
    return {
      id: existing.id,
      moveTo: existing.status === "failed" ? "failed" : "processed",
      shouldProcess: false,
      status: existing.status,
    };
  }

  const [staleRow] = await db
    .update(mailIngestMessage)
    .set({
      batchId: null,
      errorMessage: null,
      processedAt: now,
      status: "processing",
    })
    .where(
      and(
        eq(mailIngestMessage.id, existing.id),
        eq(mailIngestMessage.status, "processing"),
        or(isNull(mailIngestMessage.processedAt), lt(mailIngestMessage.processedAt, staleBefore)),
      ),
    )
    .returning({ id: mailIngestMessage.id, status: mailIngestMessage.status });
  if (!staleRow) {
    return {
      id: existing.id,
      moveTo: null,
      shouldProcess: false,
      status: existing.status,
    };
  }
  return { id: staleRow.id, moveTo: null, shouldProcess: true, status: staleRow.status };
}

export async function updateMailIngestMessageResult(
  id: string,
  result: {
    batchId?: string | null;
    error?: unknown;
    status: MailIngestMessageStatus;
    jdBindStatus?: MailIngestJdBindStatus | null;
    boundJobDescriptionId?: string | null;
    extractedJobCodes?: string[] | null;
    attachmentCount?: number | null;
    resumeAttachmentCount?: number | null;
  },
): Promise<void> {
  await db
    .update(mailIngestMessage)
    .set({
      attachmentCount: result.attachmentCount ?? null,
      batchId: result.batchId ?? null,
      boundJobDescriptionId: result.boundJobDescriptionId ?? null,
      errorMessage: result.error ? truncateError(result.error) : null,
      extractedJobCodes: result.extractedJobCodes ?? null,
      jdBindStatus: result.jdBindStatus ?? null,
      processedAt: new Date(),
      resumeAttachmentCount: result.resumeAttachmentCount ?? null,
      status: result.status,
    })
    .where(eq(mailIngestMessage.id, id));
}

export async function markMailIngestMessageSkipped(
  id: string,
  skipReason: MailIngestSkipReason,
  extra?: { attachmentCount?: number | null; resumeAttachmentCount?: number | null },
): Promise<void> {
  await db
    .update(mailIngestMessage)
    .set({
      attachmentCount: extra?.attachmentCount ?? null,
      processedAt: new Date(),
      resumeAttachmentCount: extra?.resumeAttachmentCount ?? null,
      skipReason,
      status: "skipped",
    })
    .where(eq(mailIngestMessage.id, id));
}

const POOL_SUMMARY_TERMINAL_READY: ResumeParseStatus = "ready";
const POOL_SUMMARY_TERMINAL_FAILED: ResumeParseStatus = "failed";

export interface MailMessageLogAttachment {
  fileName: string;
  hasDuplicate: boolean;
  poolItemId: string | null;
  resumeParseError: string | null;
  resumeParseStatus: ResumeParseStatus | null;
  resumeRecordId: string | null;
}

export interface MailMessageLogRecord {
  attachmentCount: number | null;
  attachments: MailMessageLogAttachment[];
  boundJobDescriptionName: string | null;
  fromAddress: string | null;
  id: string;
  jdBindStatus: MailIngestJdBindStatus | null;
  poolSummary: "all_failed" | "all_pooled" | "parsing" | "partial_failed" | null;
  receivedAt: string | null;
  resumeAttachmentCount: number | null;
  skipReason: MailIngestSkipReason | null;
  status: MailIngestMessageStatus;
  subject: string | null;
}

function summarizePool(
  attachments: MailMessageLogAttachment[],
): MailMessageLogRecord["poolSummary"] {
  if (attachments.length === 0) {
    return null;
  }
  const hasNonTerminal = attachments.some(
    (a) =>
      a.resumeParseStatus !== POOL_SUMMARY_TERMINAL_READY &&
      a.resumeParseStatus !== POOL_SUMMARY_TERMINAL_FAILED,
  );
  if (hasNonTerminal) {
    return "parsing";
  }
  const allReady = attachments.every((a) => a.resumeParseStatus === POOL_SUMMARY_TERMINAL_READY);
  if (allReady) {
    return "all_pooled";
  }
  const allFailed = attachments.every((a) => a.resumeParseStatus === POOL_SUMMARY_TERMINAL_FAILED);
  if (allFailed) {
    return "all_failed";
  }
  return "partial_failed";
}

async function loadMailMessageAttachments(
  organizationId: string,
  batchIds: string[],
): Promise<Map<string, MailMessageLogAttachment[]>> {
  const rows = await db
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
    .orderBy(asc(resumeUploadBatchItem.batchId), asc(resumeUploadBatchItem.orderIndex));

  const poolItemIds = rows.map((row) => row.poolItemId).filter((id): id is string => id !== null);
  const duplicateCounts = await listActiveDuplicateMatchCounts({
    organizationId,
    sourceIds: poolItemIds,
    sourceType: "resume_pool_item",
  });

  const attachmentsByBatch = new Map<string, MailMessageLogAttachment[]>();
  for (const row of rows) {
    const attachment: MailMessageLogAttachment = {
      fileName: row.fileName,
      hasDuplicate: row.poolItemId ? (duplicateCounts.get(row.poolItemId)?.count ?? 0) > 0 : false,
      poolItemId: row.poolItemId,
      resumeParseError: row.resumeParseError,
      resumeParseStatus: row.resumeParseStatus,
      resumeRecordId: row.resumeRecordId,
    };
    const existing = attachmentsByBatch.get(row.batchId);
    if (existing) {
      existing.push(attachment);
    } else {
      attachmentsByBatch.set(row.batchId, [attachment]);
    }
  }
  return attachmentsByBatch;
}

function buildMailMessageLogWhere(input: {
  accountId: string;
  jdBindStatus?: MailIngestJdBindStatus;
  keyword?: string;
  receivedFrom?: Date;
  receivedTo?: Date;
  skipReason?: MailIngestSkipReason;
  status?: MailIngestMessageStatus;
}) {
  return and(
    eq(mailIngestMessage.accountId, input.accountId),
    ...(input.status ? [eq(mailIngestMessage.status, input.status)] : []),
    ...(input.skipReason ? [eq(mailIngestMessage.skipReason, input.skipReason)] : []),
    ...(input.jdBindStatus ? [eq(mailIngestMessage.jdBindStatus, input.jdBindStatus)] : []),
    ...(input.keyword
      ? [
          or(
            ilike(mailIngestMessage.subject, `%${input.keyword}%`),
            ilike(mailIngestMessage.fromAddress, `%${input.keyword}%`),
          ),
        ]
      : []),
    ...(input.receivedFrom ? [gte(mailIngestMessage.receivedAt, input.receivedFrom)] : []),
    ...(input.receivedTo ? [lte(mailIngestMessage.receivedAt, input.receivedTo)] : []),
  );
}

export async function listAccountMailMessages(input: {
  accountId: string;
  jdBindStatus?: MailIngestJdBindStatus;
  keyword?: string;
  organizationId: string;
  page: number;
  pageSize: number;
  receivedFrom?: Date;
  receivedTo?: Date;
  skipReason?: MailIngestSkipReason;
  status?: MailIngestMessageStatus;
}): Promise<{ records: MailMessageLogRecord[]; total: number }> {
  const where = buildMailMessageLogWhere(input);

  const [[{ count: total } = { count: 0 }], rows] = await Promise.all([
    db
      .select({ count: count() })
      .from(mailIngestMessage)
      .innerJoin(
        mailIngestAccount,
        and(
          eq(mailIngestMessage.accountId, mailIngestAccount.id),
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .leftJoin(jobDescription, eq(mailIngestMessage.boundJobDescriptionId, jobDescription.id))
      .where(where),
    db
      .select({
        attachmentCount: mailIngestMessage.attachmentCount,
        batchId: mailIngestMessage.batchId,
        boundJobDescriptionName: jobDescription.name,
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
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .leftJoin(jobDescription, eq(mailIngestMessage.boundJobDescriptionId, jobDescription.id))
      .where(where)
      .orderBy(sql`${mailIngestMessage.receivedAt} DESC NULLS LAST`, desc(mailIngestMessage.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
  ]);

  const batchIds = rows.map((row) => row.batchId).filter((id): id is string => id !== null);
  const attachmentsByBatch = batchIds.length
    ? await loadMailMessageAttachments(input.organizationId, batchIds)
    : new Map<string, MailMessageLogAttachment[]>();

  const records = rows.map((row) => {
    const attachments = row.batchId ? (attachmentsByBatch.get(row.batchId) ?? []) : [];
    return {
      attachmentCount: row.attachmentCount,
      attachments,
      boundJobDescriptionName: row.boundJobDescriptionName,
      fromAddress: row.fromAddress,
      id: row.id,
      jdBindStatus: row.jdBindStatus,
      poolSummary: summarizePool(attachments),
      receivedAt: row.receivedAt?.toISOString() ?? null,
      resumeAttachmentCount: row.resumeAttachmentCount,
      skipReason: row.skipReason,
      status: row.status,
      subject: row.subject,
    };
  });

  return { records, total };
}
