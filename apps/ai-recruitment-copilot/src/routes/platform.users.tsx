import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { SQL } from "drizzle-orm";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { UsersGrid } from "@/components/platform/users/users-grid";
import { createQueryClient } from "@arc/shared/query-client";
import { emptyFiltersSchema, platformDataGridInputSchema } from "@/lib/start/server-fn-validators";

const INITIAL_PAGE_SIZE = 10;

type EmptyFilters = Record<string, never>;
type SearchParamsPrimitive = boolean | number | string;
type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type UserSortColumn = "name" | "email" | "role" | "createdAt" | "lastActiveAt";
type PlatformUsersState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (item): item is boolean | number | string =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return out;
}

function parsePlatformUsersQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["name", "email", "role", "createdAt", "lastActiveAt"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "lastActiveAt" }],
    initialFilters: {},
  });
}

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

const loadPlatformUsersState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(emptyFiltersSchema))
  .handler(async ({ data }): Promise<PlatformUsersState> => {
    const { getPlatformAdminStateFromRequest } = await import("@/lib/start/platform-admin.server");
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    const [{ asc, count, desc, eq, ilike, or, sql }, { db }, { session, user }] = await Promise.all(
      [
        import("drizzle-orm"),
        import("@arc/ai-recruitment-copilot-backend/lib/server/db"),
        import("@arc/db-schema/schema"),
      ],
    );
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

    async function loadPlatformUsers(query: DataGridQueryState<EmptyFilters>) {
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

    const queryClient = createQueryClient();
    await queryClient.prefetchQuery({
      queryFn: () => loadPlatformUsers(data.query),
      queryKey: buildDataGridQueryKey(["platform-users"], data.query),
    });

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      status: "ready" as const,
    };
  });

function PlatformUsersRoute() {
  const state = useLoaderData({ from: "/platform/users" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <UsersGrid />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/users")({
  component: PlatformUsersRoute,
  head: () => ({
    meta: [{ title: "平台 · 所有用户" }],
  }),
  loader: async (loaderContext) => {
    const { location } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
    };
    const query = parsePlatformUsersQuery(location.search);
    const state = (await loadPlatformUsersState({
      data: { query },
    })) as PlatformUsersState;
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    return state;
  },
  shouldReload: false,
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
