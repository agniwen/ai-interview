import { asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Metadata } from "next";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary";
import { db } from "@arc/backend/lib/server/db";
import { requirePlatformAdmin } from "@/lib/server/platform-admin";
import { session, user } from "@arc/db-schema/schema";
import { UsersGrid } from "./_components/users-grid";

export const metadata: Metadata = {
  title: "平台 · 所有用户",
};

const INITIAL_PAGE_SIZE = 10;
const LAST_ACTIVE_AT_EXPR = sql<Date | string | null>`GREATEST(
  MAX(${session.updatedAt}),
  MAX(${user.lastActiveAt})
)`;
const LAST_ACTIVE_AT_SQL = sql<Date | string | null>`${LAST_ACTIVE_AT_EXPR}`.as("last_active_at");
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

function userOrderBy(sortBy: string | undefined, sortOrder: "asc" | "desc" | undefined) {
  const column = normalizeUserSortColumn(sortBy);
  const direction = sortOrder ?? "desc";
  if (column === "lastActiveAt") {
    const sqlDirection = direction === "asc" ? sql`asc` : sql`desc`;
    return [sql`${LAST_ACTIVE_AT_EXPR} ${sqlDirection} nulls last`, desc(user.createdAt)];
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

async function loadPlatformUsers(query: DataGridQueryState<Record<string, never>>) {
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
        lastActiveAt: LAST_ACTIVE_AT_SQL,
        name: user.name,
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
    records: rows.map((r) => ({
      ...r,
      banExpires: r.banExpires?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      lastActiveAt: toIsoString(r.lastActiveAt),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const query = parseDataGridSearchParams(await searchParams, {
    allowedSortIds: ["name", "email", "role", "createdAt", "lastActiveAt"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "lastActiveAt" }],
    initialFilters: {},
  });
  return (
    <QueryHydrationBoundary
      queries={[
        {
          queryFn: () => loadPlatformUsers(query),
          queryKey: buildDataGridQueryKey(["platform-users"], query),
        },
      ]}
    >
      <UsersGrid />
    </QueryHydrationBoundary>
  );
}
