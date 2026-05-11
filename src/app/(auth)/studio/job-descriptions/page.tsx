import type { Metadata } from "next";
import { connection } from "next/server";
import { getActiveOrg } from "@/lib/server/workspace";
import { listAllDepartments } from "@/server/routes/studio/routes/departments/dao";
import { listAllInterviewers } from "@/server/routes/studio/routes/interviewers/dao";
import { listJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { JobDescriptionManagementPage } from "./_components/job-description-management-page";

export const metadata: Metadata = {
  title: "在招岗位管理",
};

export default async function StudioJobDescriptionsPage() {
  await connection();
  const activeOrg = await getActiveOrg();
  const organizationId = activeOrg?.id ?? "org_default";
  const [initialData, departments, interviewers] = await Promise.all([
    listJobDescriptions(),
    listAllDepartments(organizationId),
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
