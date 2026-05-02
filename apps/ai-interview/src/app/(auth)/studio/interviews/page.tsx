import type { Metadata } from "next";
import { connection } from "next/server";
import { InterviewManagementPage } from "@/app/(auth)/studio/interviews/_components/interview-management-page";
import {
  listStudioInterviewRecords,
  queryStudioInterviewSummary,
} from "@/server/queries/studio-interviews";

export const metadata: Metadata = {
  title: "AI 面试",
};

export default async function StudioInterviewsPage() {
  await connection();
  const [initialData, initialSummary] = await Promise.all([
    listStudioInterviewRecords(),
    queryStudioInterviewSummary(),
  ]);

  return <InterviewManagementPage initialData={initialData} initialSummary={initialSummary} />;
}
