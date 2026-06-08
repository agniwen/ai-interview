import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { RecruitingDashboardMetrics } from "@arc/shared/studio-dashboard";
import { PageHeader } from "@/components/studio/page-header";
import { RecruitingDashboardPage } from "@/components/studio/dashboard/recruiting-dashboard-page";

const loadStudioDashboardState = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => input)
  .handler(
    async ({
      data,
    }): Promise<
      | { status: "unauthenticated" }
      | { status: "not_found" }
      | { metrics: RecruitingDashboardMetrics; status: "ready" }
    > => {
      const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
      const { loadRecruitingDashboardMetrics } =
        await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics");
      const access = await resolveWorkspaceAccessFromRequest(data.slug);
      if (access.status !== "ready") {
        return access;
      }

      return {
        metrics: await loadRecruitingDashboardMetrics(access.workspace.id),
        status: "ready" as const,
      };
    },
  );

function StudioDashboardRoute() {
  const state = useLoaderData({ from: "/w/$slug/studio/dashboard" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <>
      <PageHeader
        title="数据看板"
        description="从候选人漏斗、待办队列、招聘活动、岗位分布和 Offer 状态观察当前招聘运营。"
      />
      <RecruitingDashboardPage metrics={state.metrics} />
    </>
  );
}

export const Route = createFileRoute("/w/$slug/studio/dashboard")({
  component: StudioDashboardRoute,
  head: () => ({
    meta: [{ title: "数据看板" }],
  }),
  loader: async ({ params }) => {
    const state = await loadStudioDashboardState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/dashboard`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
});
