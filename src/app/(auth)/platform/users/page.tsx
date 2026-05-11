import { headers } from "next/headers";
import type { Metadata } from "next";
import { auth } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "平台 · 所有用户",
};

export default async function PlatformUsersPage() {
  const result = await auth.api.listUsers({
    headers: await headers(),
    query: { limit: 100 },
  });
  const users = result.users ?? [];
  const total = result.total ?? users.length;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">所有用户 ({total})</h1>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">邮箱</th>
            <th className="py-2 pr-4">姓名</th>
            <th className="py-2 pr-4">平台角色</th>
            <th className="py-2 pr-4">封禁</th>
            <th className="py-2 pr-4">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr className="border-b" key={u.id}>
              <td className="py-2 pr-4 font-mono text-sm">{u.email}</td>
              <td className="py-2 pr-4">{u.name}</td>
              <td className="py-2 pr-4">{u.role ?? "user"}</td>
              <td className="py-2 pr-4">{u.banned ? "是" : "否"}</td>
              <td className="py-2 pr-4 text-sm">{new Date(u.createdAt).toLocaleString("zh-CN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
