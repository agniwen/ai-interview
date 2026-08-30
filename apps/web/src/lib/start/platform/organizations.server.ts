import { dehydrate } from "@tanstack/react-query";
import { asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import { db } from "@app/server/lib/server/db";
import { member, organization } from "@arc/db-schema/schema";
import { z } from "zod";

type EmptyFilters = Record<string, never>;

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

async function listPlatformOrganizations(query: DataGridQueryState<EmptyFilters>) {
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

export async function loadPlatformOrganizationsHydrationState(
  query: DataGridQueryState<EmptyFilters>,
): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () => listPlatformOrganizations(query),
    queryKey: buildDataGridQueryKey(["platform-organizations"], query),
  });

  const serialized = JSON.stringify(dehydrate(queryClient));
  return z.json().parse(JSON.parse(serialized)) satisfies JsonValue;
}
