import type { Metadata } from "next";
import { connection } from "next/server";
import { listCandidateFormTemplates } from "@/server/routes/studio/routes/forms/dao/queries";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { CandidateFormTemplateManagementPage } from "./_components/form-template-management-page";

export const metadata: Metadata = {
  title: "面试表单",
};

export default async function StudioCandidateFormsPage() {
  await connection();
  const [initialData, jobDescriptions] = await Promise.all([
    listCandidateFormTemplates(),
    listAllJobDescriptions(),
  ]);

  return (
    <CandidateFormTemplateManagementPage
      initialData={initialData}
      jobDescriptions={jobDescriptions}
    />
  );
}
