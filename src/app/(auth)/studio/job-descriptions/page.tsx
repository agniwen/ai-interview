import type { Metadata } from "next";
import { connection } from "next/server";
import { listAllDepartments } from "@/server/queries/departments";
import { listAllInterviewers } from "@/server/queries/interviewers";
import { listJobDescriptions } from "@/server/queries/job-descriptions";
import { JobDescriptionManagementPage } from "./_components/job-description-management-page";

export const metadata: Metadata = {
  title: "JD 管理",
};

export default async function StudioJobDescriptionsPage() {
  await connection();
  const [initialData, departments, interviewers] = await Promise.all([
    listJobDescriptions(),
    listAllDepartments(),
    listAllInterviewers(),
  ]);

  return (
    <JobDescriptionManagementPage
      departments={departments}
      initialData={initialData}
      interviewers={interviewers}
    />
  );
}
