import { count, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";

export const metadata: Metadata = {
  title: "平台 · 所有工作区",
};

export default async function PlatformOrganizationsPage() {
  const rows = await db
    .select({
      createdAt: organization.createdAt,
      id: organization.id,
      memberCount: count(member.id),
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .groupBy(organization.id, organization.name, organization.slug, organization.createdAt)
    .orderBy(sql`${organization.createdAt} DESC`);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">所有工作区 ({rows.length})</h1>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">名称</th>
            <th className="py-2 pr-4">Slug</th>
            <th className="py-2 pr-4">成员数</th>
            <th className="py-2 pr-4">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr className="border-b" key={r.id}>
              <td className="py-2 pr-4 font-semibold">{r.name}</td>
              <td className="py-2 pr-4 font-mono text-sm">{r.slug}</td>
              <td className="py-2 pr-4">{r.memberCount}</td>
              <td className="py-2 pr-4 text-sm">{new Date(r.createdAt).toLocaleString("zh-CN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
