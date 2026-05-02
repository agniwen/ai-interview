import type { Metadata } from "next";
import { connection } from "next/server";
import { listAllDepartments } from "@/server/queries/departments";
import { listInterviewers } from "@/server/queries/interviewers";
import { InterviewerManagementPage } from "./_components/interviewer-management-page";

export const metadata: Metadata = {
  title: "面试官管理",
};

export default async function StudioInterviewersPage() {
  await connection();
  const [initialData, departments] = await Promise.all([listInterviewers(), listAllDepartments()]);

  return <InterviewerManagementPage departments={departments} initialData={initialData} />;
}
