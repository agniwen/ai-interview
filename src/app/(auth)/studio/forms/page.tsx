import type { Metadata } from "next";
import { connection } from "next/server";
import { getActiveOrg } from "@/lib/server/workspace";
import { listCandidateFormTemplates } from "@/server/routes/studio/routes/forms/dao/queries";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { CandidateFormTemplateManagementPage } from "./_components/form-template-management-page";

export const metadata: Metadata = {
  title: "面试表单",
};

export default async function StudioCandidateFormsPage() {
  await connection();
  const activeOrg = await getActiveOrg();
  const organizationId = activeOrg?.id ?? "org_default";
  const [initialData, jobDescriptions] = await Promise.all([
    listCandidateFormTemplates(),
    listAllJobDescriptions(organizationId),
  ]);

  return (
    <CandidateFormTemplateManagementPage
      initialData={initialData}
      jobDescriptions={jobDescriptions}
    />
  );
}
