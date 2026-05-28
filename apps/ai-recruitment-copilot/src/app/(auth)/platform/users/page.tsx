import { count, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/server/db";
import { session, user } from "@arc/db-schema/schema";
import { UsersGrid } from "./_components/users-grid";

export const metadata: Metadata = {
  title: "平台 · 所有用户",
};

const INITIAL_PAGE_SIZE = 10;
const LAST_ACTIVE_AT_SQL = sql<
  Date | string | null
>`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt})) AT TIME ZONE 'UTC'`.as(
  "last_active_at",
);

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

export default async function PlatformUsersPage() {
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
      .groupBy(user.id)
      .orderBy(desc(user.createdAt))
      .limit(INITIAL_PAGE_SIZE)
      .offset(0),
    db.select({ total: count() }).from(user),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / INITIAL_PAGE_SIZE));

  const initialData = {
    page: 1,
    pageSize: INITIAL_PAGE_SIZE,
    records: rows.map((r) => ({
      ...r,
      banExpires: r.banExpires?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      lastActiveAt: toIsoString(r.lastActiveAt),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    totalPages,
  };

  return <UsersGrid initialData={initialData} />;
}
