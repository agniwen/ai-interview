import type { Metadata } from "next";
import { connection } from "next/server";
import { getActiveOrg } from "@/lib/server/workspace";
import { listAllDepartments } from "@/server/routes/studio/routes/departments/dao";
import { listInterviewers } from "@/server/routes/studio/routes/interviewers/dao";
import { InterviewerManagementPage } from "./_components/interviewer-management-page";

export const metadata: Metadata = {
  title: "面试官管理",
};

export default async function StudioInterviewersPage() {
  await connection();
  const activeOrg = await getActiveOrg();
  const organizationId = activeOrg?.id ?? "org_default";
  const [initialData, departments] = await Promise.all([
    listInterviewers(organizationId),
    listAllDepartments(organizationId),
  ]);

  return <InterviewerManagementPage departments={departments} initialData={initialData} />;
}
