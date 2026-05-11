import type { Metadata } from "next";
import { connection } from "next/server";
import { getActiveOrg } from "@/lib/server/workspace";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { listInterviewQuestionTemplates } from "@/server/routes/studio/routes/interview-questions/dao/queries";
import { InterviewQuestionTemplateManagementPage } from "./_components/interview-question-template-management-page";

export const metadata: Metadata = {
  title: "面试题",
};

export default async function StudioInterviewQuestionTemplatesPage() {
  await connection();
  const activeOrg = await getActiveOrg();
  const organizationId = activeOrg?.id ?? "org_default";
  const [initialData, jobDescriptions] = await Promise.all([
    listInterviewQuestionTemplates(organizationId),
    listAllJobDescriptions(organizationId),
  ]);

  return (
    <InterviewQuestionTemplateManagementPage
      initialData={initialData}
      jobDescriptions={jobDescriptions}
    />
  );
}
