import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveActiveOrganization } from "@/lib/server/auth-session";
import { listInterviewQuestionTemplates } from "@/server/routes/studio/routes/interview-questions/dao/queries";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { InterviewQuestionTemplateManagementPage } from "./_components/interview-question-template-management-page";

export const metadata: Metadata = {
  title: "面试题",
};

export default async function StudioInterviewQuestionTemplatesPage() {
  await connection();
  const activeOrg = await resolveActiveOrganization();
  if (!activeOrg) {
    notFound();
  }
  const [initialData, jobDescriptions] = await Promise.all([
    listInterviewQuestionTemplates(activeOrg.id),
    listAllJobDescriptions(activeOrg.id),
  ]);

  return (
    <InterviewQuestionTemplateManagementPage
      initialData={initialData}
      jobDescriptions={jobDescriptions}
    />
  );
}
