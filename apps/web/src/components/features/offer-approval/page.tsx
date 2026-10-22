import { IconClipboardCheck, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { offerApprovalLabels } from "@app/shared/offer-approval";
import { actionsColumn, customColumn, DataGrid } from "@/components/features/data-grid";
import { TimeDisplay } from "@/components/features/display/time-display";
import { PageHeader } from "@/components/features/studio/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHasPermission } from "@/hooks/use-has-permission";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalKeys, approvalPolling } from "./queries";

/** 审批列表每页条数，与服务端分页一致。/ Matches the server's fixed page size. */
const APPROVAL_PAGE_SIZE = 20;
const APPROVAL_PAGE_SIZE_OPTIONS = [APPROVAL_PAGE_SIZE] as const;
const APPROVAL_REFETCH_INTERVAL_MS = 15_000;

type ApprovalView = "pending" | "processed" | "submitted" | "all";
type ApprovalStatus = keyof typeof offerApprovalLabels;

interface OfferApprovalListItem {
  applicantName: string;
  attemptNumber: number;
  candidateName: string;
  completedSteps: number;
  createdAt: string;
  currentApprover: string | null;
  id: string;
  invalidatedAt: string | null;
  position: string;
  status: ApprovalStatus;
  totalSteps: number;
  unavailable: boolean;
}

const VIEW_LABELS = {
  all: "全部 Offer 审批",
  pending: "待我审批",
  processed: "我已处理",
  submitted: "我发起的",
} as const satisfies Record<ApprovalView, string>;

const EMPTY_COPY = {
  all: { description: "工作区内还没有发起过 Offer 审批。", title: "暂无 Offer 审批" },
  pending: { description: "需要你审批的 Offer 会出现在这里。", title: "暂无待你审批的 Offer" },
  processed: { description: "你通过或驳回的审批会出现在这里。", title: "还没有处理过的审批" },
  submitted: {
    description: "在候选人的 Offer 协商阶段发起审批后会出现在这里。",
    title: "你还没有发起过 Offer 审批",
  },
} as const satisfies Record<ApprovalView, { description: string; title: string }>;

const STATUS_BADGE_VARIANT = {
  approved: "success",
  cancelled: "outline",
  pending: "warning",
  rejected: "destructive",
  withdrawn: "outline",
} as const satisfies Record<ApprovalStatus, "destructive" | "outline" | "success" | "warning">;

function isApprovalView(value: unknown): value is ApprovalView {
  return typeof value === "string" && Object.hasOwn(VIEW_LABELS, value);
}

export function OfferApprovalsPage({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [view, setView] = useState<ApprovalView>("pending");
  const [page, setPage] = useState(1);
  const canSeeAll = useHasPermission("offerApproval", "manage");
  const query = useQuery({
    queryFn: () =>
      rpcFetch(
        approvalApi.$get({ param: { slug }, query: { page: String(page), view } }),
        "加载审批列表失败",
      ),
    queryKey: [...approvalKeys.all(slug), "list", view, page],
    ...approvalPolling,
    refetchInterval: APPROVAL_REFETCH_INTERVAL_MS,
  });
  const total = query.data?.total ?? 0;
  const views: ApprovalView[] = canSeeAll
    ? ["pending", "processed", "submitted", "all"]
    : ["pending", "processed", "submitted"];

  const columns = useMemo(
    () => [
      customColumn<OfferApprovalListItem>({
        cell: (item) => (
          <Link
            className="flex min-w-0 flex-col gap-0.5"
            params={{ approvalId: item.id, slug }}
            to="/w/$slug/studio/offer-approvals/$approvalId"
          >
            <span className="truncate font-medium text-foreground">{item.candidateName}</span>
            <span className="truncate text-muted-foreground text-xs">{item.position}</span>
          </Link>
        ),
        key: "candidate",
        title: "候选人 / 岗位",
      }),
      customColumn<OfferApprovalListItem>({
        cell: (item) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant={STATUS_BADGE_VARIANT[item.status]}>
              {offerApprovalLabels[item.status]}
            </Badge>
            {item.invalidatedAt ? <Badge variant="outline">已不适用</Badge> : null}
          </span>
        ),
        key: "status",
        size: 150,
        title: "状态",
      }),
      customColumn<OfferApprovalListItem>({
        cell: (item) => (
          <span className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="tabular-nums">
              {item.completedSteps}/{item.totalSteps} 已通过
            </span>
            {item.unavailable ? (
              <span className="truncate text-destructive text-xs">存在不可用的审批人</span>
            ) : (
              <span className="truncate text-muted-foreground text-xs">
                {item.currentApprover ? `当前：${item.currentApprover}` : "—"}
              </span>
            )}
          </span>
        ),
        key: "progress",
        title: "审批进度",
      }),
      customColumn<OfferApprovalListItem>({
        cell: (item) => (
          <span className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="truncate">{item.applicantName}</span>
            <span className="text-muted-foreground text-xs">第 {item.attemptNumber} 轮</span>
          </span>
        ),
        key: "applicant",
        title: "发起人",
      }),
      customColumn<OfferApprovalListItem>({
        cell: (item) => (
          <span className="text-muted-foreground text-sm">
            <TimeDisplay value={item.createdAt} />
          </span>
        ),
        key: "createdAt",
        size: 160,
        title: "发起时间",
      }),
      actionsColumn<OfferApprovalListItem>({
        inline: [
          {
            label: view === "pending" ? "去审批" : "查看",
            onClick: (item) => {
              void navigate({
                params: { approvalId: item.id, slug },
                to: "/w/$slug/studio/offer-approvals/$approvalId",
              });
            },
          },
        ],
      }),
    ],
    [navigate, slug, view],
  );

  const emptyCopy = EMPTY_COPY[view];

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader
        actionRender={
          <div className="flex items-center gap-2">
            <Tabs
              aria-label="审批范围"
              onValueChange={(value) => {
                if (isApprovalView(value)) {
                  setView(value);
                  setPage(1);
                }
              }}
              value={view}
            >
              <TabsList>
                {views.map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {VIEW_LABELS[value]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              aria-label="刷新审批列表"
              disabled={query.isFetching}
              onClick={() => {
                void query.refetch();
              }}
              size="icon"
              title="刷新"
              variant="outline"
            >
              <IconRefresh className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        }
        description="查看待你审批、你已处理和你发起的 Offer 审批；列表每 15 秒自动刷新，审批结果以系统为准。"
        title="Offer 审批"
      />

      <DataGrid<OfferApprovalListItem>
        columns={columns}
        data={query.data?.items ?? []}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconClipboardCheck className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{emptyCopy.title}</EmptyTitle>
              <EmptyDescription>{emptyCopy.description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        error={query.error}
        getRowId={(item) => item.id}
        loading={query.isPending}
        onRetry={() => {
          void query.refetch();
        }}
        pageSizeOptions={APPROVAL_PAGE_SIZE_OPTIONS}
        pagination={{
          onPageChange: setPage,
          // 服务端固定每页 20 条，只有这一个选项；切换时回到第一页。
          onPageSizeChange: () => setPage(1),
          page,
          pageSize: APPROVAL_PAGE_SIZE,
        }}
        refetching={query.isFetching && !query.isPending}
        total={total}
        totalPages={Math.max(1, Math.ceil(total / APPROVAL_PAGE_SIZE))}
      />
    </div>
  );
}
