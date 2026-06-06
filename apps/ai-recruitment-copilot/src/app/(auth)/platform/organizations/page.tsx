import { asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Metadata } from "next";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary";
import { db } from "@/lib/server/db";
import { requirePlatformAdmin } from "@/lib/server/platform-admin";
import { member, organization } from "@arc/db-schema/schema";
import { OrganizationsGrid } from "./_components/organizations-grid";

export const metadata: Metadata = {
  title: "平台 · 所有工作区",
};

const INITIAL_PAGE_SIZE = 10;

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

async function loadPlatformOrganizations(query: DataGridQueryState<Record<string, never>>) {
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
    records: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const query = parseDataGridSearchParams(await searchParams, {
    allowedSortIds: ["name", "slug", "createdAt", "memberCount"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
  });

  return (
    <QueryHydrationBoundary
      queries={[
        {
          queryFn: () => loadPlatformOrganizations(query),
          queryKey: buildDataGridQueryKey(["platform-organizations"], query),
        },
      ]}
    >
      <OrganizationsGrid />
    </QueryHydrationBoundary>
  );
}
