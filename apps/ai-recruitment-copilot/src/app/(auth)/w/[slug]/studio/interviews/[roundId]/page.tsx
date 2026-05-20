import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { InterviewRoundDetailPage } from "./_components/interview-round-detail-page";

export const metadata: Metadata = {
  title: "面试详情",
};

export default async function StudioInterviewRoundDetailPage({
  params,
}: {
  params: Promise<{ slug: string; roundId: string }>;
}) {
  await connection();
  const { slug, roundId } = await params;
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }

  return <InterviewRoundDetailPage roundId={roundId} slug={slug} />;
}
