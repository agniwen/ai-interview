import { count, desc } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/server/db";
import { user } from "@arc/db-schema/schema";
import { UsersGrid } from "./_components/users-grid";

export const metadata: Metadata = {
  title: "平台 · 所有用户",
};

const INITIAL_PAGE_SIZE = 10;

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
        name: user.name,
        role: user.role,
        updatedAt: user.updatedAt,
      })
      .from(user)
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
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    totalPages,
  };

  return <UsersGrid initialData={initialData} />;
}
