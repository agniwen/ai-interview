/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, no-void, sort-keys -- Tab state comes from the fixed local tab list and refresh is deliberately fire-and-forget. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { offerApprovalLabels } from "@app/shared/offer-approval";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHasPermission } from "@/hooks/use-has-permission";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalKeys, approvalPolling } from "./queries";
export function OfferApprovalsPage({ slug }: { slug: string }) {
  const [view, setView] = useState<"pending" | "processed" | "submitted" | "all">("pending");
  const [page, setPage] = useState(1);
  const manage = useHasPermission("offerApproval", "manage");
  const query = useQuery({
    queryKey: [...approvalKeys.all(slug), "list", view, page],
    queryFn: () =>
      rpcFetch(
        approvalApi.$get({ param: { slug }, query: { page: String(page), view } }),
        "加载审批列表失败",
      ),
    ...approvalPolling,
    refetchInterval: 15_000,
  });
  const tabs = [
    { label: "待我审批", value: "pending" },
    { label: "我已处理", value: "processed" },
    { label: "我发起的", value: "submitted" },
    ...(manage ? [{ label: "全部 Offer 审批", value: "all" }] : []),
  ] as const;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Offer 审批</h1>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          刷新
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.value}
            variant={view === tab.value ? "default" : "outline"}
            onClick={() => {
              setView(tab.value as typeof view);
              setPage(1);
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        最近刷新：
        {query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString() : "尚未刷新"} ·
        审批结果以系统为准
      </p>
      {query.error ? <p role="alert">{query.error.message}</p> : null}
      {query.isPending ? <output>正在加载审批…</output> : null}
      <div className="space-y-3">
        {query.data?.items.map((item) => (
          <Link
            className="block rounded-lg border p-4 hover:bg-muted/40"
            key={item.id}
            to="/w/$slug/studio/offer-approvals/$approvalId"
            params={{ approvalId: item.id, slug }}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                {item.candidateName} · {item.position}
              </strong>
              <Badge variant="outline">
                {offerApprovalLabels[item.status]}
                {item.invalidatedAt ? " · 已不适用" : ""}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              第 {item.attemptNumber} 轮 · {item.applicantName} 发起 · {item.completedSteps}/
              {item.totalSteps} 已通过
              {item.currentApprover ? ` · 当前：${item.currentApprover}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleString()} · 编号 {item.id}
            </p>
            {item.unavailable ? (
              <p className="mt-2 text-sm text-destructive">审批流程存在不可用人员，请检查后处理</p>
            ) : null}
          </Link>
        ))}
      </div>
      {query.data?.items.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-muted-foreground">暂无审批单</p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm">共 {query.data?.total ?? 0} 项</span>
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          上一页
        </Button>
        <span>{page}</span>
        <Button
          variant="outline"
          disabled={page * 20 >= (query.data?.total ?? 0)}
          onClick={() => setPage((value) => value + 1)}
        >
          下一页
        </Button>
      </div>
    </section>
  );
}
