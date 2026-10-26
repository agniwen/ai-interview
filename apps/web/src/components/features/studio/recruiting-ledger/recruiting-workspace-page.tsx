import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageHeader } from "@/components/features/studio/page-header";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useHasPermission } from "@/hooks/use-has-permission";
import { RecruitingHrStatisticsPage } from "./recruiting-hr-statistics-page";
import { RecruitingLedgerPage } from "./recruiting-ledger-page";
import {
  recruitingWorkspaceViewSchema,
  resolveRecruitingWorkspaceView,
} from "./recruiting-workspace-view";
import { RecruitingWorkspaceContentSkeleton } from "./recruiting-workspace-content-skeleton";

const routeApi = getRouteApi("/w/$slug/studio/recruiting-ledger");
const RecruitingDashboardPanel = lazy(async () => {
  const dashboardModule = await import("../dashboard/recruiting-dashboard-panel");
  return { default: dashboardModule.RecruitingDashboardPanel };
});

const viewDescriptions = {
  dashboard: "整体招聘进展与风险预警。",
  hr: "查看新增简历数、阶段进入次数与阶段比率。",
  jobs: "按岗位汇总招聘进展与需求完成情况。",
  records:
    "按当前招聘台阶段实时汇总候选人、AI 评价、真人面试与 Offer 信息；除信息同步标签外，其余内容只读。",
};

export function RecruitingWorkspacePage() {
  const { slug } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = useNavigate({ from: "/w/$slug/studio/recruiting-ledger" });
  const canViewLedger = useHasPermission("page", "recruitingLedger");
  const canViewDashboard = useHasPermission("page", "dashboard");
  const view = resolveRecruitingWorkspaceView(search.view, canViewLedger, canViewDashboard);

  if (!view) {
    return null;
  }

  return (
    <Tabs
      className="mx-auto w-full min-w-0 max-w-[96rem] gap-6"
      onValueChange={(value) => {
        const next = recruitingWorkspaceViewSchema.safeParse(value);
        if (!next.success) {
          return;
        }
        void navigate({
          resetScroll: false,
          search: (previous) => ({ ...previous, view: next.data }),
        });
      }}
      value={view}
    >
      <PageHeader
        actionRender={
          <TabsList aria-label="台账展示方式">
            {canViewLedger ? <TabsTab value="hr">HR 统计</TabsTab> : null}
            {canViewLedger ? <TabsTab value="records">候选人明细</TabsTab> : null}
            {canViewLedger ? <TabsTab value="jobs">按岗位汇总</TabsTab> : null}
            {canViewDashboard ? <TabsTab value="dashboard">数据看板</TabsTab> : null}
          </TabsList>
        }
        description={viewDescriptions[view]}
        title="招聘台账"
      />
      <TabsPanel value="hr">
        {canViewLedger && view === "hr" ? <RecruitingHrStatisticsPage /> : null}
      </TabsPanel>
      <TabsPanel value="records">
        {canViewLedger && view === "records" ? <RecruitingLedgerPage view="records" /> : null}
      </TabsPanel>
      <TabsPanel value="jobs">
        {canViewLedger && view === "jobs" ? <RecruitingLedgerPage view="jobs" /> : null}
      </TabsPanel>
      <TabsPanel value="dashboard">
        {canViewDashboard && view === "dashboard" ? (
          <Suspense fallback={<RecruitingWorkspaceContentSkeleton view="dashboard" />}>
            <RecruitingDashboardPanel slug={slug} />
          </Suspense>
        ) : null}
      </TabsPanel>
    </Tabs>
  );
}
