"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconBell, IconCircleCheck, IconCircleDashed, IconCircleX } from "@tabler/icons-react";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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

const notificationSortColumnSchema = z.enum([
  "candidateName",
  "createdAt",
  "organizationName",
  "providerId",
  "sentAt",
  "status",
  "updatedAt",
]);

interface NotificationQuery {
  page: string;
  pageSize: string;
  providerId: NotificationProviderFilter;
  search?: string;
  sortBy: NotificationSortColumn;
  sortOrder: "asc" | "desc";
  status: NotificationStatusFilter;
}

interface PlatformNotificationRecord {
  candidateName: string;
  conversationId: string | null;
  createdAt: string;
  error: string | null;
  feishuDocumentUrl: string | null;
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

interface FeishuTextContent {
  elements: {
    text_run: {
      content: string;
      text_element_style?: { bold?: boolean; link?: { url: string } };
    };
  }[];
}

interface FeishuPreviewBlock {
  block_type: number;
  children?: FeishuPreviewBlock[];
  heading3?: FeishuTextContent;
  ordered?: FeishuTextContent;
  quote?: FeishuTextContent;
  text?: FeishuTextContent;
  todo?: FeishuTextContent;
}

interface FeishuNotificationPreview {
  block: FeishuPreviewBlock;
  prompt: string;
  title: string;
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

const PROVIDER_LABEL = {
  feishu: "默认飞书",
  "feishu-jiguang-hr": "极光 HR",
} satisfies Record<NotificationProvider, string>;

const STATUS_LABEL = {
  failed: "发送失败",
  pending: "待发送",
  sent: "已发送",
} satisfies Record<NotificationStatus, string>;

function parseNotificationSortColumn(value: string | undefined): NotificationSortColumn {
  const parsed = notificationSortColumnSchema.safeParse(value);
  return parsed.success ? parsed.data : "createdAt";
}

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

function previewBlockContent(block: FeishuPreviewBlock): FeishuTextContent | undefined {
  return block.heading3 ?? block.text ?? block.quote ?? block.todo ?? block.ordered;
}

function previewBlockClassName(blockType: number): string {
  if (blockType === 5) {
    return "mb-4 text-base font-semibold text-foreground";
  }
  if (blockType === 15) {
    return "my-2 border-orange-300 border-l-2 pl-3 text-muted-foreground text-sm";
  }
  return "whitespace-pre-wrap text-sm leading-6 text-foreground/85";
}

function FeishuPreviewLine({ block }: { block: FeishuPreviewBlock }) {
  const content = previewBlockContent(block);
  const text = content?.elements.map((element) => element.text_run.content).join("") ?? "";
  if (!text) {
    return <div className="h-3" />;
  }

  return (
    <div className={previewBlockClassName(block.block_type)}>
      {content?.elements.map((element) => (
        <span
          className={element.text_run.text_element_style?.bold ? "font-semibold" : undefined}
          key={`${element.text_run.content}-${element.text_run.text_element_style?.bold ?? false}-${element.text_run.text_element_style?.link?.url ?? ""}`}
        >
          {element.text_run.content}
        </span>
      ))}
    </div>
  );
}

function FeishuNotificationPreviewDialog({
  onOpenChange,
  record,
}: {
  onOpenChange: (open: boolean) => void;
  record: PlatformNotificationRecord | null;
}) {
  const previewMutation = useMutation({
    mutationFn: (notificationId: string) =>
      rpcFetch<FeishuNotificationPreview>(
        rpc.api.platform.notifications[":id"]["debug-preview"].$post({
          param: { id: notificationId },
        }),
        "生成飞书通知预览失败",
      ),
    retry: false,
  });
  const { mutate: generatePreview, reset: resetPreview } = previewMutation;

  useEffect(() => {
    resetPreview();
    if (record?.id) {
      generatePreview(record.id);
    }
  }, [generatePreview, record?.id, resetPreview]);

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(record)}>
      <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{previewMutation.data?.title ?? "调试飞书通知"}</DialogTitle>
          <DialogDescription>
            {previewMutation.isPending
              ? "AI 正在基于简历背景、表单和面试对话重新生成 HR 评价…"
              : "以下内容由 AI 现场重新生成；未创建飞书文档，也未发送实际通知。"}
          </DialogDescription>
        </DialogHeader>
        {previewMutation.isPending ? <Skeleton className="h-96 w-full" /> : null}
        {previewMutation.isError ? (
          <p className="text-destructive text-sm">{previewMutation.error.message}</p>
        ) : null}
        {previewMutation.data ? (
          <Tabs className="min-h-0 flex-1" defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">评价预览</TabsTrigger>
              <TabsTrigger value="prompt">最终 Prompt</TabsTrigger>
            </TabsList>
            <TabsContent
              className="min-h-0 overflow-y-auto rounded-xl border border-orange-200/80 bg-orange-50/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-orange-900/70 dark:bg-orange-950/25"
              value="preview"
            >
              {previewMutation.data.block.children?.map((block) => (
                <FeishuPreviewLine block={block} key={JSON.stringify(block)} />
              ))}
            </TabsContent>
            <TabsContent
              className="min-h-0 overflow-y-auto rounded-xl border bg-muted/35 p-5"
              value="prompt"
            >
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground/80">
                {previewMutation.data.prompt}
              </pre>
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function NotificationsGrid() {
  const queryClient = useQueryClient();
  const [previewRecord, setPreviewRecord] = useState<PlatformNotificationRecord | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  function fetchNotifications(params: {
    search: string;
    page: number;
    pageSize: number;
    filters: NotificationFilters;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<NotificationsResult> {
    const query: NotificationQuery = {
      page: String(params.page),
      pageSize: String(params.pageSize),
      providerId: params.filters.providerId,
      sortBy: parseNotificationSortColumn(params.sortBy),
      sortOrder: params.sortOrder ?? "desc",
      status: params.filters.status,
    };
    if (params.search) {
      query.search = params.search;
    }
    return rpcFetch<NotificationsResult>(
      rpc.api.platform.notifications.$get({
        query,
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
          label: "调试飞书通知",
          onClick: (record) => setPreviewRecord(record),
        },
        {
          disabled: (record) => !record.feishuDocumentUrl,
          disabledReason: () => "文档尚未生成，请先重新发送通知",
          label: "打开飞书文档",
          onClick: (record) => {
            if (record.feishuDocumentUrl) {
              window.open(record.feishuDocumentUrl, "_blank", "noopener,noreferrer");
            }
          },
        },
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
    <>
      <DataGrid<PlatformNotificationRecord>
        {...grid.bind}
        columnPinning={{ end: ["actions"] }}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconBell className="size-5" />
              </EmptyMedia>
              <EmptyTitle>暂无飞书通知</EmptyTitle>
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
            unfilteredValue: "all",
          },
          {
            key: "providerId",
            options: PROVIDER_OPTIONS,
            placeholder: "机器人",
            type: "select",
            unfilteredValue: "all",
          },
        ]}
        getRowId={(record) => record.id}
      />
      <FeishuNotificationPreviewDialog
        onOpenChange={(open) => {
          if (!open) {
            setPreviewRecord(null);
          }
        }}
        record={previewRecord}
      />
    </>
  );
}
