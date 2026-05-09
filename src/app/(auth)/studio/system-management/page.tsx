import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { listAdminUsers } from "@/server/queries/admin-users";
import { SystemManagementPage } from "./_components/system-management-page";

export const metadata: Metadata = {
  title: "用户管理",
};

export default async function StudioSystemManagementPage() {
  await connection();

  // Studio layout 已经做了 canAccessAdmin 校验，这里再叠加 admin 角色检查。
  // The studio layout already enforces canAccessAdmin; layer admin-role on top.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.role !== "admin") {
    redirect("/studio");
  }

  const initialData = await listAdminUsers({ page: 1, pageSize: 10 });

  return <SystemManagementPage initialData={initialData} />;
}
