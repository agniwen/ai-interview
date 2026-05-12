import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveActiveOrganization } from "@/lib/server/auth-session";
import { listAllDepartments } from "@/server/routes/studio/routes/departments/dao";
import { listInterviewers } from "@/server/routes/studio/routes/interviewers/dao";
import { InterviewerManagementPage } from "./_components/interviewer-management-page";

export const metadata: Metadata = {
  title: "面试官管理",
};

export default async function StudioInterviewersPage() {
  await connection();
  const activeOrg = await resolveActiveOrganization();
  if (!activeOrg) {
    notFound();
  }
  const [initialData, departments] = await Promise.all([
    listInterviewers(activeOrg.id),
    listAllDepartments(activeOrg.id),
  ]);

  return <InterviewerManagementPage departments={departments} initialData={initialData} />;
}
