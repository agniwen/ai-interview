"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconBell, IconCircleCheck, IconCircleDashed, IconCircleX } from "@tabler/icons-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MemberCell } from "@/components/data-grid/cells/member-cell";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  textColumn,
  useDataGridState,
} from "@/components/data-grid";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

type NotificationStatus = "pending" | "sent" | "failed";
type NotificationProvider = "feishu" | "feishu-jiguang-hr";
type NotificationProviderFilter = "all" | NotificationProvider;
type NotificationStatusFilter = "all" | NotificationStatus;

interface NotificationFilters extends Record<string, string> {
  providerId: NotificationProviderFilter;
  status: NotificationStatusFilter;
}

type NotificationSortColumn =
  | "candidateName"
  | "createdAt"
  | "organizationName"
  | "providerId"
  | "sentAt"
  | "status"
  | "updatedAt";

interface PlatformNotificationRecord {
  candidateName: string;
  conversationId: string | null;
  createdAt: string;
  error: string | null;
  feishuMessageId: string | null;
  id: string;
  interviewRecordId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  providerId: NotificationProvider;
  recipientOpenId: string;
  recipientUser: {
    email: string | null;
    id: string | null;
    image: string | null;
    name: string | null;
  };
  scheduleEntryId: string | null;
  sentAt: string | null;
  status: NotificationStatus;
  targetRole: string | null;
  type: "summary_ready";
  updatedAt: string;
}

interface NotificationsResult {
  page: number;
  pageSize: number;
  records: PlatformNotificationRecord[];
  total: number;
  totalPages: number;
}

const DEFAULT_FILTERS: NotificationFilters = {
  providerId: "all",
  status: "all",
};

const STATUS_OPTIONS = [
  { label: "全部状态", value: "all" },
  { label: "待发送", value: "pending" },
  { label: "已发送", value: "sent" },
  { label: "发送失败", value: "failed" },
];

const PROVIDER_OPTIONS = [
  { label: "全部机器人", value: "all" },
  { label: "默认飞书机器人", value: "feishu" },
  { label: "极光 HR 机器人", value: "feishu-jiguang-hr" },
];

const PROVIDER_LABEL: Record<NotificationProvider, string> = {
  feishu: "默认飞书",
  "feishu-jiguang-hr": "极光 HR",
};

const STATUS_LABEL: Record<NotificationStatus, string> = {
  failed: "发送失败",
  pending: "待发送",
  sent: "已发送",
};

function statusVariant(status: NotificationStatus): ComponentProps<typeof Badge>["variant"] {
  if (status === "sent") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  return "outline";
}

function StatusIcon({ status }: { status: NotificationStatus }) {
  if (status === "sent") {
    return <IconCircleCheck className="mr-1 size-3" />;
  }
  if (status === "failed") {
    return <IconCircleX className="mr-1 size-3" />;
  }
  return <IconCircleDashed className="mr-1 size-3" />;
}

function buildReportUrl(record: PlatformNotificationRecord): string {
  const base = `/w/${encodeURIComponent(record.organization.slug)}/studio/interviews`;
  if (record.scheduleEntryId) {
    return `${base}?roundId=${encodeURIComponent(record.scheduleEntryId)}`;
  }
  return `${base}?recordId=${encodeURIComponent(record.interviewRecordId)}`;
}

export function NotificationsGrid() {
  const queryClient = useQueryClient();
  const [resendingId, setResendingId] = useState<string | null>(null);

  function fetchNotifications(params: {
    search: string;
    page: number;
    pageSize: number;
    filters: NotificationFilters;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<NotificationsResult> {
    return rpcFetch<NotificationsResult>(
      rpc.api.platform.notifications.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          providerId: params.filters.providerId,
          ...(params.search ? { search: params.search } : {}),
          sortBy: (params.sortBy as NotificationSortColumn | undefined) ?? "createdAt",
          sortOrder: params.sortOrder ?? "desc",
          status: params.filters.status,
        },
      }),
      "加载飞书通知失败",
    );
  }

  const resendMutation = useMutation({
    mutationFn: async (record: PlatformNotificationRecord) => {
      setResendingId(record.id);
      await rpcFetch<{ notificationId: string; sentAt: string }>(
        rpc.api.platform.notifications[":id"].resend.$post({
          param: { id: record.id },
        }),
        "重新发送飞书通知失败",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "重新发送飞书通知失败");
    },
    onSettled: () => {
      setResendingId(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-notifications"] });
      toast.success("飞书通知已重新发送");
    },
  });

  const grid = useDataGridState<PlatformNotificationRecord, NotificationFilters>({
    allowedSortIds: [
      "createdAt",
      "sentAt",
      "updatedAt",
      "status",
      "providerId",
      "candidateName",
      "organizationName",
    ],
    defaultPageSize: 20,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: DEFAULT_FILTERS,
    queryFn: fetchNotifications,
    queryKeyBase: ["platform-notifications"],
  });

  const columns = [
    customColumn<PlatformNotificationRecord>({
      accessorKey: "status",
      cell: (record) => (
        <Badge variant={statusVariant(record.status)}>
          <StatusIcon status={record.status} />
          {STATUS_LABEL[record.status]}
        </Badge>
      ),
      enableSorting: true,
      key: "status",
      title: "状态",
    }),
    customColumn<PlatformNotificationRecord>({
      accessorKey: "candidateName",
      cell: (record) => (
        <div className="min-w-0 max-w-[260px]">
          <p className="truncate font-medium">{record.candidateName}</p>
          <p className="truncate text-muted-foreground text-xs">
            {record.targetRole ?? "未填写岗位"}
          </p>
        </div>
      ),
      enableSorting: true,
      key: "candidateName",
      title: "候选人",
    }),
    customColumn<PlatformNotificationRecord>({
      cell: (record) => (
        <MemberCell
          email={record.recipientUser.email ?? record.recipientOpenId}
          image={record.recipientUser.image}
          name={record.recipientUser.name ?? record.recipientUser.email ?? "未知用户"}
        />
      ),
      key: "recipient",
      title: "接收人",
    }),
    customColumn<PlatformNotificationRecord>({
      accessorKey: "providerId",
      cell: (record) => (
        <Badge variant="outline">{PROVIDER_LABEL[record.providerId] ?? record.providerId}</Badge>
      ),
      enableSorting: true,
      key: "providerId",
      title: "机器人",
    }),
    customColumn<PlatformNotificationRecord>({
      cell: (record) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate">{record.organization.name}</p>
          <p className="truncate font-mono text-muted-foreground text-xs">
            /w/{record.organization.slug}
          </p>
        </div>
      ),
      enableSorting: true,
      key: "organizationName",
      title: "工作区",
    }),
    textColumn<PlatformNotificationRecord>({
      cell: (record) => (
        <span className="font-mono text-xs">
          {record.feishuMessageId ?? record.recipientOpenId}
        </span>
      ),
      key: "feishuMessageId",
      title: "飞书消息",
      truncate: "max-w-[220px]",
    }),
    dateColumn<PlatformNotificationRecord>({
      emptyText: "未发送",
      key: "sentAt",
      sortable: true,
      title: "发送时间",
    }),
    dateColumn<PlatformNotificationRecord>({
      key: "createdAt",
      sortable: true,
      title: "创建时间",
    }),
    customColumn<PlatformNotificationRecord>({
      cell: (record) =>
        record.error ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="block max-w-[240px] truncate text-destructive text-xs">
                    {record.error}
                  </span>
                }
              />
              <TooltipContent className="max-w-sm whitespace-pre-wrap">
                {record.error}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
      key: "error",
      title: "错误",
    }),
    actionsColumn<PlatformNotificationRecord>({
      menu: [
        {
          label: "打开报告",
          onClick: (record) => {
            window.open(buildReportUrl(record), "_blank", "noopener,noreferrer");
          },
        },
        {
          disabled: (record) => resendMutation.isPending && resendingId === record.id,
          disabledReason: () => "正在重新发送",
          label: "重新发送通知",
          onClick: (record) => resendMutation.mutateAsync(record),
        },
      ],
    }),
  ];

  return (
    <DataGrid<PlatformNotificationRecord>
      {...grid.bind}
      columnPinning={{ right: ["actions"] }}
      columns={columns}
      empty={
        <Empty className="border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconBell className="size-5" />
            </EmptyMedia>
            <EmptyTitle>暂无飞书通知</EmptyTitle>
            <EmptyDescription>还没有通过飞书机器人发送的面试报告通知。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      filters={[
        {
          key: "search",
          minWidth: "22rem",
          placeholder: "搜索候选人、接收人、工作区、消息 ID",
          type: "search",
        },
        {
          key: "status",
          options: STATUS_OPTIONS,
          placeholder: "状态",
          type: "select",
        },
        {
          key: "providerId",
          options: PROVIDER_OPTIONS,
          placeholder: "机器人",
          type: "select",
        },
      ]}
      getRowId={(record) => record.id}
    />
  );
}
