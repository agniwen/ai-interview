import { assertNoRecruitingReferences } from "@app/database/recruiting-reference-retention";
import {
  buildWorkspaceMailIngestFilters,
  buildPlatformMailIngestFilters,
} from "./dao/account-filters";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";
import { calcTotalPages, makePaginationSchema } from "../../../../../lib/server/db/pagination";
import type { PaginatedResult, PaginationParams } from "../../../../../lib/server/db/pagination";
import { mailIngestAccount, member, organization, user as userTable } from "@app/db-schema/schema";
import { encryptMailIngestSecret } from "../../../../../lib/server/mail-ingest-crypto";
import type { createMailIngestAccountSchema, updateMailIngestAccountSchema } from "./schema";
import type { MailIngestLoginConfig } from "./validation";
import type { z } from "zod";
import {
  toMailIngestAccountDto,
  toMailIngestLoginConfig,
  toNullableMailIngestAccountDto,
} from "./dao/account-presenters";
import type {
  MailIngestAccountDto,
  PlatformMailIngestAccountRow,
  WorkerMailIngestAccount,
  WorkspaceMailIngestAccountRow,
} from "./dao/account-presenters";
import { mailIngestWorkerDao } from "./dao/worker";

export type {
  MailIngestAccountDto,
  PlatformMailIngestAccountRow,
  WorkerMailIngestAccount,
  WorkspaceMailIngestAccountRow,
} from "./dao/account-presenters";

const WORKSPACE_MAIL_INGEST_SORT_COLUMNS = [
  "userName",
  "userEmail",
  "emailAddress",
  "lastCheckedAt",
] as const;

export {
  claimMailIngestMessageForProcessing,
  listAccountMailMessages,
  markMailIngestMessageSkipped,
  updateMailIngestMessageResult,
} from "./dao/messages";
export type {
  MailIngestMessageClaim,
  MailMessageLogAttachment,
  MailMessageLogRecord,
} from "./dao/messages";
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

interface MailIngestPaginationInput {
  page?: number | string;
  pageSize?: number | string;
  sortBy?: string;
  sortOrder?: string;
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
  return rows.map(toMailIngestAccountDto);
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
  textFilters,
  search,
  sortBy = "userName",
  sortOrder = "asc",
  userId,
}: {
  limit?: number;
  offset?: number;
  organizationId: string;
  textFilters?: string;
  search?: string;
  sortBy?: WorkspaceMailIngestSortColumn;
  sortOrder?: "asc" | "desc";
  userId?: string;
}) {
  const where = buildWorkspaceMailIngestFilters({ organizationId, search, textFilters, userId });
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
      messageCount: sql<number>`(select count(*)::int from recruiting_mail_message where account_id = ${mailIngestAccount.id})`,
      problemCount: sql<number>`(select count(*)::int from recruiting_mail_message where account_id = ${mailIngestAccount.id} and status in ('failed','skipped'))`,
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
  textFilters,
  search,
  sortBy = "userName",
  sortOrder = "asc",
}: {
  limit?: number;
  offset?: number;
  textFilters?: string;
  search?: string;
  sortBy?: WorkspaceMailIngestSortColumn;
  sortOrder?: "asc" | "desc";
}) {
  const where = buildPlatformMailIngestFilters({ search, textFilters });
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
      messageCount: sql<number>`(select count(*)::int from recruiting_mail_message where account_id = ${mailIngestAccount.id})`,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      problemCount: sql<number>`(select count(*)::int from recruiting_mail_message where account_id = ${mailIngestAccount.id} and status in ('failed','skipped'))`,
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
  textFilters,
  search,
  userId,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  userId?: string;
}) {
  const where = buildWorkspaceMailIngestFilters({ organizationId, search, textFilters, userId });
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

async function countPlatformMailIngestAccountRows({
  textFilters,
  search,
}: {
  textFilters?: string;
  search?: string;
}) {
  const where = buildPlatformMailIngestFilters({ search, textFilters });
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
    account: toNullableMailIngestAccountDto(row),
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
  options: { textFilters?: string; search?: string | null; userId?: string } = {},
): Promise<WorkspaceMailIngestAccountRow[]> {
  const rows = await listWorkspaceMailIngestAccountRows({
    organizationId,
    search: parseWorkspaceMailIngestSearch(options.search),
    textFilters: options.textFilters,
    userId: options.userId,
  });

  return rows.map(toWorkspaceMailIngestAccountRow);
}

export async function getWorkspaceMailIngestAccount(
  organizationId: string,
  accountId: string,
): Promise<WorkspaceMailIngestAccountRow | null> {
  const rows = await listWorkspaceMailIngestAccountRows({ organizationId });
  const row = rows.find((candidate) => candidate.accountId === accountId);
  return row ? toWorkspaceMailIngestAccountRow(row) : null;
}

export async function queryPaginatedWorkspaceMailIngestAccounts(
  organizationId: string,
  options: { textFilters?: string; search?: string | null; userId?: string } = {},
  pagination?: MailIngestPaginationInput,
): Promise<PaginatedWorkspaceMailIngestAccountResult> {
  const { page, pageSize, sortBy, sortOrder } = workspaceMailIngestPaginationSchema.parse(
    pagination ?? {},
  );
  const search = parseWorkspaceMailIngestSearch(options.search);
  const { textFilters } = options;
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listWorkspaceMailIngestAccountRows({
      limit: pageSize,
      offset,
      organizationId,
      search,
      sortBy,
      sortOrder,
      textFilters,
      userId: options.userId,
    }),
    countWorkspaceMailIngestAccountRows({
      organizationId,
      search,
      textFilters,
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
  options: { textFilters?: string; search?: string | null } = {},
  pagination?: MailIngestPaginationInput,
): Promise<PaginatedPlatformMailIngestAccountResult> {
  const { page, pageSize, sortBy, sortOrder } = workspaceMailIngestPaginationSchema.parse(
    pagination ?? {},
  );
  const search = parseWorkspaceMailIngestSearch(options.search);
  const { textFilters } = options;
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listPlatformMailIngestAccountRows({
      limit: pageSize,
      offset,
      search,
      sortBy,
      sortOrder,
      textFilters,
    }),
    countPlatformMailIngestAccountRows({ search, textFilters }),
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
  return toMailIngestAccountDto(row);
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
  return row ? toMailIngestLoginConfig(row) : null;
}

export async function mailIngestAccountExistsInOrg({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: mailIngestAccount.id })
    .from(mailIngestAccount)
    .where(and(eq(mailIngestAccount.id, id), eq(mailIngestAccount.organizationId, organizationId)))
    .limit(1);
  return Boolean(row);
}

function buildAccountUpdateValues(input: UpdateAccountInput) {
  const updateValues: Partial<typeof mailIngestAccount.$inferInsert> = {
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
      Object.assign(updateValues, { [key]: input[key] });
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
  return row ? toMailIngestAccountDto(row) : null;
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
  return row ? toMailIngestAccountDto(row) : null;
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
  return await db.transaction(async (tx) => {
    const condition = and(
      eq(mailIngestAccount.id, id),
      eq(mailIngestAccount.organizationId, organizationId),
      eq(mailIngestAccount.userId, userId),
    );
    const [account] = await tx
      .select({ id: mailIngestAccount.id })
      .from(mailIngestAccount)
      .where(condition)
      .for("update")
      .limit(1);
    if (!account) {
      return false;
    }
    await assertNoRecruitingReferences(tx, "mail_ingest_account", id);
    const rows = await tx
      .delete(mailIngestAccount)
      .where(condition)
      .returning({ id: mailIngestAccount.id });
    return rows.length > 0;
  });
}

export function listEnabledMailIngestAccounts(
  limit = 20,
  scope?: { organizationId: string },
): Promise<WorkerMailIngestAccount[]> {
  return mailIngestWorkerDao.listEnabledAccounts(limit, scope);
}

export function claimMailIngestAccount(accountId: string): Promise<Date | null> {
  return mailIngestWorkerDao.claimAccount(accountId);
}

export function finishMailIngestAccountRun(
  accountId: string,
  opts?: {
    error?: unknown;
    pollingStartedAt?: Date;
    counts?: {
      received: number;
      subjectSkipped: number;
      matched: number;
      queued: number;
      failed: number;
    };
  },
): Promise<void> {
  return mailIngestWorkerDao.finishAccountRun(accountId, opts);
}
