import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { RecruitingDashboardPage } from "@/app/(auth)/w/[slug]/studio/dashboard/_components/recruiting-dashboard-page";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { loadRecruitingDashboardMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics";

export const metadata: Metadata = {
  title: "数据看板",
};

export default async function StudioDashboardPage({
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

  const metrics = await loadRecruitingDashboardMetrics(activeOrg.id);

  return (
    <>
      <PageHeader
        title="数据看板"
        description="从候选人漏斗、待办队列、招聘活动、岗位分布和 Offer 状态观察当前招聘运营。"
      />
      <RecruitingDashboardPage metrics={metrics} />
    </>
  );
}
