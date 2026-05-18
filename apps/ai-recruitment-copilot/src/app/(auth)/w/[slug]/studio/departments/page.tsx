import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { listDepartments } from "@/server/routes/studio/routes/departments/dao";
import { DepartmentManagementPage } from "./_components/department-management-page";

export const metadata: Metadata = {
  title: "部门管理",
};

export default async function StudioDepartmentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const initialData = await listDepartments({ organizationId: activeOrg.id });

  return <DepartmentManagementPage initialData={initialData} />;
}
