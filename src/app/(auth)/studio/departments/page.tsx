import type { Metadata } from "next";
import { connection } from "next/server";
import { listDepartments } from "@/server/queries/departments";
import { DepartmentManagementPage } from "./_components/department-management-page";

export const metadata: Metadata = {
  title: "部门管理",
};

export default async function StudioDepartmentsPage() {
  await connection();
  const initialData = await listDepartments();

  return <DepartmentManagementPage initialData={initialData} />;
}
