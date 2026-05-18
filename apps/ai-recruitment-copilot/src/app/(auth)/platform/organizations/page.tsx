import { count, eq, sql, desc } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import { OrganizationsGrid } from "./_components/organizations-grid";

export const metadata: Metadata = {
  title: "平台 · 所有工作区",
};

const INITIAL_PAGE_SIZE = 10;

export default async function PlatformOrganizationsPage() {
  const memberCountSubquery = db
    .select({ count: count(member.id).as("cnt"), organizationId: member.organizationId })
    .from(member)
    .groupBy(member.organizationId)
    .as("mc");

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
      .orderBy(desc(organization.createdAt))
      .limit(INITIAL_PAGE_SIZE)
      .offset(0),
    db.select({ total: count() }).from(organization),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / INITIAL_PAGE_SIZE));

  const initialData = {
    page: 1,
    pageSize: INITIAL_PAGE_SIZE,
    records: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    totalPages,
  };

  return <OrganizationsGrid initialData={initialData} />;
}
