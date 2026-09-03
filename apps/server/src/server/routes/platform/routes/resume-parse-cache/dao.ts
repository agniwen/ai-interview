import { buildListTextFilterWhere } from "../../../../../lib/server/db/list-text-filters";
import { and, asc, count, desc, eq, ilike, isNotNull, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";
import type { AttachmentTextSource } from "@app/db-schema/db-enums";
import { chatAttachment, organization, user } from "@app/db-schema/schema";
import type { ResumeParseCacheQuery } from "./schema";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function latestCacheValue(column: SQL): SQL {
  return sql`(array_agg(${column} order by ${chatAttachment.parsedAt} desc nulls last, ${chatAttachment.createdAt} desc))[1]`;
}

function cacheOrderBy(query: ResumeParseCacheQuery): SQL {
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

function buildCacheConditions(query: ResumeParseCacheQuery): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    isNotNull(chatAttachment.contentHash),
    ne(chatAttachment.contentHash, ""),
    or(isNotNull(chatAttachment.parsedStructured), isNotNull(chatAttachment.parsedText)),
    buildListTextFilterWhere("parseCache", query.textFilters, {
      contentHash: chatAttachment.contentHash,
      filename: chatAttachment.filename,
      organizationName: organization.name,
      storageKey: chatAttachment.storageKey,
      userEmail: user.email,
      userName: user.name,
    }),
  ];
  const search = query.search?.trim();
  if (search) {
    conditions.push(
      or(
        ilike(chatAttachment.filename, `%${search}%`),
        ilike(chatAttachment.contentHash, `%${search}%`),
        ilike(chatAttachment.storageKey, `%${search}%`),
        ilike(organization.name, `%${search}%`),
        ilike(user.name, `%${search}%`),
        ilike(user.email, `%${search}%`),
      ),
    );
  }
  if (query.parsedStatus !== "all") {
    conditions.push(eq(chatAttachment.parsedStatus, query.parsedStatus));
  }
  if (query.textSource !== "all") {
    conditions.push(eq(chatAttachment.parsedTextSource, query.textSource));
  }
  return and(...conditions);
}

function buildCacheHaving(query: ResumeParseCacheQuery): SQL | undefined {
  if (query.cacheType === "structured") {
    return sql`bool_or(${chatAttachment.parsedStructured} is not null)`;
  }
  if (query.cacheType === "text_only") {
    return sql`not bool_or(${chatAttachment.parsedStructured} is not null) and bool_or(${chatAttachment.parsedText} is not null)`;
  }
  return undefined;
}

export async function queryPaginatedResumeParseCache(query: ResumeParseCacheQuery) {
  const where = buildCacheConditions(query);
  const having = buildCacheHaving(query);
  const latestOrder = sql`order by ${chatAttachment.parsedAt} desc nulls last, ${chatAttachment.createdAt} desc`;
  const groupedHashes = db
    .select({ contentHash: chatAttachment.contentHash })
    .from(chatAttachment)
    .innerJoin(organization, eq(organization.id, chatAttachment.organizationId))
    .innerJoin(user, eq(user.id, chatAttachment.userId))
    .where(where)
    .groupBy(chatAttachment.contentHash)
    .having(having)
    .as("resume_parse_cache_hashes");
  const [rows, [{ total }]] = await Promise.all([
    db
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
        parsedStatus: sql<
          "failed" | "pending" | "ready"
        >`(array_agg(${chatAttachment.parsedStatus} ${latestOrder}))[1]`,
        parsedTextSource: sql<AttachmentTextSource | null>`(array_agg(${chatAttachment.parsedTextSource} ${latestOrder}))[1]`,
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
    db.select({ total: count() }).from(groupedHashes),
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    records: rows.map((row) => ({
      ...row,
      createdAt: toIsoString(row.createdAt),
      parsedAt: row.parsedAt ? toIsoString(row.parsedAt) : null,
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getResumeParseCacheJson(contentHash: string) {
  const [row] = await db
    .select({
      contentHash: chatAttachment.contentHash,
      createdAt: chatAttachment.createdAt,
      filename: chatAttachment.filename,
      id: chatAttachment.id,
      mediaType: chatAttachment.mediaType,
      parsedAt: chatAttachment.parsedAt,
      parsedError: chatAttachment.parsedError,
      parsedPageCount: chatAttachment.parsedPageCount,
      parsedStatus: chatAttachment.parsedStatus,
      parsedStructured: chatAttachment.parsedStructured,
      parsedText: chatAttachment.parsedText,
      parsedTextSource: chatAttachment.parsedTextSource,
      size: chatAttachment.size,
      storageKey: chatAttachment.storageKey,
    })
    .from(chatAttachment)
    .where(
      and(
        eq(chatAttachment.contentHash, contentHash),
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
    return null;
  }
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    parsedAt: row.parsedAt ? toIsoString(row.parsedAt) : null,
  };
}

export async function deleteResumeParseCache(contentHash: string) {
  const cleared = await db
    .update(chatAttachment)
    .set({
      parsedAt: null,
      parsedError: null,
      parsedPageCount: null,
      // Hash reuse explicitly skips failed rows. Marking invalidated entries as
      // failed guarantees the next upload is a cache miss and gets reparsed.
      parsedStatus: "failed",
      parsedStructured: null,
      parsedText: null,
      parsedTextSource: null,
    })
    .where(
      and(
        eq(chatAttachment.contentHash, contentHash),
        or(
          ne(chatAttachment.parsedStatus, "failed"),
          isNotNull(chatAttachment.parsedStructured),
          isNotNull(chatAttachment.parsedText),
        ),
      ),
    )
    .returning({ id: chatAttachment.id });

  return cleared.length > 0 ? { clearedCount: cleared.length } : null;
}
