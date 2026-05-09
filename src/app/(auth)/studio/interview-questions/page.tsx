import type { Metadata } from "next";
import { connection } from "next/server";
import { listAllJobDescriptions } from "@/server/routes/studio/routes/job-descriptions/dao";
import { listInterviewQuestionTemplates } from "@/server/routes/studio/routes/interview-questions/dao";
import { InterviewQuestionTemplateManagementPage } from "./_components/interview-question-template-management-page";

export const metadata: Metadata = {
  title: "面试题",
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
