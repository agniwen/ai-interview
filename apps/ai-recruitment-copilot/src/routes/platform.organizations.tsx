import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { OrganizationsGrid } from "@/components/platform/organizations/organizations-grid";
import { createQueryClient } from "@arc/shared/query-client";
import { emptyFiltersSchema, platformDataGridInputSchema } from "@/lib/start/server-fn-validators";

const INITIAL_PAGE_SIZE = 10;

type EmptyFilters = Record<string, never>;
type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type PlatformOrganizationsState =
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
    if (Array.isArray(value)) {
      out[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return out;
}

function parsePlatformOrganizationsQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["name", "slug", "createdAt", "memberCount"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
  });
}

const loadPlatformOrganizationsState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(emptyFiltersSchema))
  .handler(async ({ data }): Promise<PlatformOrganizationsState> => {
    const { getPlatformAdminStateFromRequest } = await import("@/lib/start/platform-admin.server");
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    const [{ asc, count, desc, eq, ilike, or, sql }, { db }, { member, organization }] =
      await Promise.all([
        import("drizzle-orm"),
        import("@arc/ai-recruitment-copilot-backend/lib/server/db"),
        import("@arc/db-schema/schema"),
      ]);

    function orgOrderExpr(sortBy: string | undefined) {
      if (sortBy === "name") {
        return organization.name;
      }
      if (sortBy === "slug") {
        return organization.slug;
      }
      if (sortBy === "memberCount") {
        return sql`coalesce("mc"."cnt", 0)`;
      }
      return organization.createdAt;
    }

    async function loadPlatformOrganizations(query: DataGridQueryState<EmptyFilters>) {
      const search = query.search.trim();
      const searchFilter = search
        ? or(ilike(organization.name, `%${search}%`), ilike(organization.slug, `%${search}%`))
        : undefined;
      const memberCountSubquery = db
        .select({ count: count(member.id).as("cnt"), organizationId: member.organizationId })
        .from(member)
        .groupBy(member.organizationId)
        .as("mc");
      const orderDir = query.sortOrder === "asc" ? asc : desc;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            createdAt: organization.createdAt,
            id: organization.id,
            memberCount: sql<number>`coalesce("mc"."cnt", 0)`.as("member_count"),
            name: organization.name,
            slug: organization.slug,
          })
          .from(organization)
          .leftJoin(memberCountSubquery, eq(memberCountSubquery.organizationId, organization.id))
          .where(searchFilter)
          .orderBy(orderDir(orgOrderExpr(query.sortBy)))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(organization).where(searchFilter),
      ]);

      return {
        page: query.page,
        pageSize: query.pageSize,
        records: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      };
    }

    const queryClient = createQueryClient();
    await queryClient.prefetchQuery({
      queryFn: () => loadPlatformOrganizations(data.query),
      queryKey: buildDataGridQueryKey(["platform-organizations"], data.query),
    });

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      status: "ready" as const,
    };
  });

function PlatformOrganizationsRoute() {
  const state = useLoaderData({ from: "/platform/organizations" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <OrganizationsGrid />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/organizations")({
  component: PlatformOrganizationsRoute,
  head: () => ({
    meta: [{ title: "平台 · 所有工作区" }],
  }),
  loader: async (loaderContext) => {
    const { deps } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<EmptyFilters> };
    };
    const state = (await loadPlatformOrganizationsState({
      data: { query: deps.query },
    })) as PlatformOrganizationsState;
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parsePlatformOrganizationsQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
