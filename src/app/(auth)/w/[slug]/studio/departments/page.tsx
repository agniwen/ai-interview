import type { Metadata } from "next";
import { connection } from "next/server";
import { getActiveOrg } from "@/lib/server/workspace";
import { listDepartments } from "@/server/routes/studio/routes/departments/dao";
import { DepartmentManagementPage } from "./_components/department-management-page";

export const metadata: Metadata = {
  title: "部门管理",
};

export default async function StudioDepartmentsPage() {
  await connection();
  const activeOrg = await getActiveOrg();
  const organizationId = activeOrg?.id ?? "org_default";
  const initialData = await listDepartments({ organizationId });

  return <DepartmentManagementPage initialData={initialData} />;
}
