import { dehydrate } from "@tanstack/react-query";
import { asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import { db } from "@app/server/lib/server/db";
import { session, user } from "@arc/db-schema/schema";
import { z } from "zod";

type EmptyFilters = Record<string, never>;
type UserSortColumn = "name" | "email" | "role" | "createdAt" | "lastActiveAt";

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeUserSortColumn(value: string | undefined): UserSortColumn {
  if (
    value === "name" ||
    value === "email" ||
    value === "role" ||
    value === "createdAt" ||
    value === "lastActiveAt"
  ) {
    return value;
  }
  return "lastActiveAt";
}

async function listPlatformUsers(query: DataGridQueryState<EmptyFilters>) {
  const lastActiveAtExpr = sql<Date | string | null>`GREATEST(
    MAX(${session.updatedAt}),
    MAX(${user.lastActiveAt})
  )`;
  const lastActiveAtSql = sql<Date | string | null>`${lastActiveAtExpr}`.as("last_active_at");

  function userOrderBy(sortBy: string | undefined, sortOrder: "asc" | "desc" | undefined): SQL[] {
    const column = normalizeUserSortColumn(sortBy);
    const direction = sortOrder ?? "desc";
    if (column === "lastActiveAt") {
      const sqlDirection = direction === "asc" ? sql`asc` : sql`desc`;
      return [sql`${lastActiveAtExpr} ${sqlDirection} nulls last`, desc(user.createdAt)];
    }
    const orderDir = direction === "asc" ? asc : desc;
    if (column === "name") {
      return [orderDir(user.name), desc(user.createdAt)];
    }
    if (column === "email") {
      return [orderDir(user.email), desc(user.createdAt)];
    }
    if (column === "role") {
      return [orderDir(user.role), desc(user.createdAt)];
    }
    return [orderDir(user.createdAt)];
  }

  const search = query.search.trim();
  const searchFilter = search
    ? or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        banExpires: user.banExpires,
        banReason: user.banReason,
        banned: user.banned,
        createdAt: user.createdAt,
        email: user.email,
        emailVerified: user.emailVerified,
        feishuTenantName: user.feishuTenantName,
        id: user.id,
        image: user.image,
        lastActiveAt: lastActiveAtSql,
        name: user.name,
        remark: user.remark,
        role: user.role,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .leftJoin(session, eq(session.userId, user.id))
      .where(searchFilter)
      .groupBy(user.id)
      .orderBy(...userOrderBy(query.sortBy, query.sortOrder))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(user).where(searchFilter),
  ]);

  return {
    page: query.page,
    pageSize: query.pageSize,
    records: rows.map((row) => ({
      ...row,
      banExpires: row.banExpires?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      lastActiveAt: toIsoString(row.lastActiveAt),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function loadPlatformUsersHydrationState(
  query: DataGridQueryState<EmptyFilters>,
): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () => listPlatformUsers(query),
    queryKey: buildDataGridQueryKey(["platform-users"], query),
  });

  const serialized = JSON.stringify(dehydrate(queryClient));
  return z.json().parse(JSON.parse(serialized)) satisfies JsonValue;
}
