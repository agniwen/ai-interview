import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { InterviewManagementPage } from "@/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page";
import { resolveActiveOrganization } from "@/lib/server/auth-session";
import {
  listStudioInterviewRecords,
  queryStudioInterviewSummary,
} from "@/server/routes/studio/routes/interviews/dao/studio-interviews";

export const metadata: Metadata = {
  title: "AI 面试",
};

export default async function StudioInterviewsPage() {
  await connection();
  const activeOrg = await resolveActiveOrganization();
  if (!activeOrg) {
    notFound();
  }
  const [initialData, initialSummary] = await Promise.all([
    listStudioInterviewRecords(activeOrg.id),
    queryStudioInterviewSummary(activeOrg.id),
  ]);

  return <InterviewManagementPage initialData={initialData} initialSummary={initialSummary} />;
}
