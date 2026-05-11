import type { Metadata } from "next";
import { connection } from "next/server";
import { InterviewManagementPage } from "@/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page";
import { getActiveOrg } from "@/lib/server/workspace";
import {
  listStudioInterviewRecords,
  queryStudioInterviewSummary,
} from "@/server/routes/studio/routes/interviews/dao/studio-interviews";

export const metadata: Metadata = {
  title: "AI 面试",
};

export default async function StudioInterviewsPage() {
  await connection();
  const activeOrg = await getActiveOrg();
  const orgId = activeOrg?.id ?? "org_default";
  const [initialData, initialSummary] = await Promise.all([
    listStudioInterviewRecords(orgId),
    queryStudioInterviewSummary(orgId),
  ]);

  return <InterviewManagementPage initialData={initialData} initialSummary={initialSummary} />;
}
