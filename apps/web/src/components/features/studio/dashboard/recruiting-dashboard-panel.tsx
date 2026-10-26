import { useQuery } from "@tanstack/react-query";
import { RecruitingWorkspaceContentSkeleton } from "../recruiting-ledger/recruiting-workspace-content-skeleton";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { loadStudioDashboardState } from "@/lib/start/studio/dashboard.functions";
import { RecruitingDashboardPage } from "./recruiting-dashboard-page";

export function RecruitingDashboardPanel({ slug }: { slug: string }) {
  const query = useQuery({
    queryFn: async () => {
      const state = await loadStudioDashboardState({ data: { slug } });
      if (state.status === "unauthenticated") {
        throw new Error("登录已失效，请重新登录后查看数据看板。");
      }
      if (state.status === "not_found") {
        throw new Error("暂无数据看板访问权限，请刷新页面后重试。");
      }
      return state.metrics;
    },
    queryKey: ["studio-dashboard", slug],
    staleTime: 15_000,
  });

  return (
    <SkeletonReveal
      loading={query.isPending}
      skeleton={<RecruitingWorkspaceContentSkeleton view="dashboard" />}
    >
      {query.isError ? (
        <div className="flex flex-col items-start gap-3" role="alert">
          <p className="text-destructive text-sm">{query.error.message}</p>
          <Button
            onClick={async () => {
              await query.refetch();
            }}
            size="sm"
            variant="outline"
          >
            重试
          </Button>
        </div>
      ) : null}
      {query.data ? <RecruitingDashboardPage metrics={query.data} slug={slug} /> : null}
    </SkeletonReveal>
  );
}
