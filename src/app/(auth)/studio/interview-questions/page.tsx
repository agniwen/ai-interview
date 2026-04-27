import type { Metadata } from "next";
import { connection } from "next/server";
import { listAllJobDescriptions } from "@/server/queries/job-descriptions";
import { listInterviewQuestionTemplates } from "@/server/queries/interview-question-templates";
import { InterviewQuestionTemplateManagementPage } from "./_components/interview-question-template-management-page";

export const metadata: Metadata = {
  title: "面试中问题模版",
};

export default async function StudioInterviewQuestionTemplatesPage() {
  await connection();
  const [initialData, jobDescriptions] = await Promise.all([
    listInterviewQuestionTemplates(),
    listAllJobDescriptions(),
  ]);

  return (
    <InterviewQuestionTemplateManagementPage
      initialData={initialData}
      jobDescriptions={jobDescriptions}
    />
  );
}
