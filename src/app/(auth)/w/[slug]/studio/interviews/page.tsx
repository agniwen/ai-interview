import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { InterviewManagementPage } from "@/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import {
  listInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@/server/routes/studio/routes/interviews/dao/interview-rounds";

export const metadata: Metadata = {
  title: "AI 面试",
};

export default async function StudioInterviewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const [initialData, initialSummary] = await Promise.all([
    listInterviewRounds(activeOrg.id),
    summarizeInterviewRoundCounts(activeOrg.id),
  ]);

  return <InterviewManagementPage initialData={initialData} initialSummary={initialSummary} />;
}
