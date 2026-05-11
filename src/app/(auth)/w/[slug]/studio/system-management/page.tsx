import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth-session";
import { listAdminUsers } from "@/server/routes/studio/routes/users/dao";
import { SystemManagementPage } from "./_components/system-management-page";

export const metadata: Metadata = {
  title: "用户管理",
};

export default async function StudioSystemManagementPage() {
  // Studio layout 已经做了 canAccessAdmin 校验，这里再叠加 admin 角色检查。
  // The studio layout already enforces canAccessAdmin; layer admin-role on top.
  const session = await getCurrentSession();
  if (session?.user?.role !== "admin") {
    redirect("/studio");
  }

  const initialData = await listAdminUsers({ page: 1, pageSize: 10 });

  return <SystemManagementPage initialData={initialData} />;
}
