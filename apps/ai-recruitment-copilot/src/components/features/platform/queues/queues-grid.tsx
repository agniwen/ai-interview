"use client";

import {
  ActivityIcon,
  Building2Icon,
  DatabaseIcon,
  ListChecksIcon,
  ServerIcon,
} from "@/components/icons/hugeicons";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { formatBytes } from "@arc/shared/utils/format";

const DEFAULT_QUEUE_NAME = "resume-parse";
const DEFAULT_FILTERS = {
  queue: DEFAULT_QUEUE_NAME,
  state: "all",
};

const JOB_STATE_OPTIONS = [
  { label: "全部状态", value: "all" },
  { label: "等待中", value: "waiting" },
  { label: "处理中", value: "active" },
  { label: "延迟中", value: "delayed" },
  { label: "失败", value: "failed" },
  { label: "已完成", value: "completed" },
  { label: "已暂停", value: "paused" },
  { label: "优先级", value: "prioritized" },
  { label: "等待子任务", value: "waiting-children" },
] as const;

type QueueFilters = typeof DEFAULT_FILTERS;
type JobStateFilter = (typeof JOB_STATE_OPTIONS)[number]["value"];

interface QueueCounts {
  active: number;
  completed: number;
  delayed: number;
  failed: number;
  paused: number;
  prioritized: number;
  waiting: number;
  "waiting-children": number;
}

interface QueueOverviewRecord {
  counts: QueueCounts;
  displayName: string;
  name: string;
  redis: {
    db: number;
    host: string;
    port: number;
    protocol: string;
    usesPassword: boolean;
    usesUsername: boolean;
  } | null;
  workers: {
    addr?: string;
    age?: string;
    cmd?: string;
    db?: string;
    flags?: string;
    id?: string;
    idle?: string;
    name?: string;
  }[];
  workersCount: number;
}

interface QueuesOverviewResult {
  records: QueueOverviewRecord[];
  total: number;
}

interface QueueJobRecord {
  attemptsMade: number;
  attemptsStarted: number | null;
  data: unknown;
  failedReason: string | null;
  finishedOn: string | null;
  id: string;
  name: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  processedBy: string | null;
  processedOn: string | null;
  progress: unknown;
  resumeDetail: {
    attemptCount: number;
    batch: {
      failedCount: number;
      processedCount: number;
      status: string;
      succeededCount: number;
      target: string;
      totalCount: number;
    };
    batchId: string;
    candidateEmail: string | null;
    candidateName: string | null;
    errorMessage: string | null;
    fileSize: number;
    finishedAt: string | null;
    itemId: string;
    itemStatus: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    originalFileName: string;
    poolItemId: string | null;
    poolScope: string | null;
    poolStatus: string | null;
    queuedAt: string | null;
    resumeParseError: string | null;
    resumeParseStatus: string | null;
    resumeRecordId: string | null;
    startedAt: string | null;
    targetRole: string | null;
    userEmail: string | null;
    userId: string;
    userImage: string | null;
    userName: string | null;
  } | null;
  returnvalue: unknown;
  state: string;
  timestamp: string | null;
  triggeredBy: {
    email: string | null;
    id: string;
    image: string | null;
    name: string | null;
  } | null;
}

interface QueueJobsResult {
  page: number;
  pageSize: number;
  records: QueueJobRecord[];
  state: string;
  total: number;
  totalPages: number;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "U";
  }
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) {
    return "—";
  }
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function stateLabel(state: string): string {
  return JOB_STATE_OPTIONS.find((option) => option.value === state)?.label ?? state;
}

function normalizeStateFilter(value: string): JobStateFilter {
  return JOB_STATE_OPTIONS.some((option) => option.value === value)
    ? (value as JobStateFilter)
    : "all";
}

function stateVariant(state: string): ComponentProps<typeof Badge>["variant"] {
  if (state === "completed") {
    return "success";
  }
  if (state === "failed") {
    return "danger";
  }
  if (state === "active") {
    return "info";
  }
  if (state === "delayed" || state === "waiting-children") {
    return "warning";
  }
  return "outline";
}

function uploadItemStatusMeta(
  status: string,
  target: string,
): { label: string; variant: ComponentProps<typeof Badge>["variant"] } {
  if (status === "pending") {
    return { label: "排队中", variant: "outline" };
  }
  if (status === "processing") {
    return { label: "处理中", variant: "info" };
  }
  if (status === "succeeded") {
    return { label: target === "resume_pool" ? "已加入" : "已入库", variant: "success" };
  }
  if (status === "failed") {
    return { label: "失败", variant: "danger" };
  }
  if (status === "duplicate_skipped") {
    return { label: "已跳过", variant: "warning" };
  }
  if (status === "cancelled") {
    return { label: "已取消", variant: "outline" };
  }
  return { label: status || "未知", variant: "outline" };
}

function resumeParseStatusMeta(status: string | null): {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
} {
  if (status === "ready") {
    return { label: "已解析", variant: "success" };
  }
  if (status === "processing") {
    return { label: "解析中", variant: "info" };
  }
  if (status === "failed") {
    return { label: "解析失败", variant: "danger" };
  }
  if (status === "queued" || status === "unparsed") {
    return { label: "未解析", variant: "outline" };
  }
  return { label: status || "—", variant: "outline" };
}

function batchStatusMeta(status: string): {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
} {
  if (status === "running") {
    return { label: "运行中", variant: "info" };
  }
  if (status === "completed") {
    return { label: "已完成", variant: "success" };
  }
  if (status === "cancelled") {
    return { label: "已取消", variant: "outline" };
  }
  if (status === "pending") {
    return { label: "待开始", variant: "outline" };
  }
  return { label: status || "未知", variant: "outline" };
}

function getJobDataSummary(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "—";
  }
  const maybeRecord = data as Record<string, unknown>;
  const itemId = typeof maybeRecord.itemId === "string" ? maybeRecord.itemId : null;
  const batchId = typeof maybeRecord.batchId === "string" ? maybeRecord.batchId : null;
  if (itemId && batchId) {
    return `${itemId} / ${batchId}`;
  }
  return itemId ?? batchId ?? "—";
}

function QueueOrganizationCell({ organization }: { organization: QueueJobRecord["organization"] }) {
  if (!organization) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{organization.name}</p>
        <p className="truncate text-muted-foreground text-xs">{organization.slug}</p>
      </div>
    </div>
  );
}

function QueueUserCell({ user }: { user: QueueJobRecord["triggeredBy"] }) {
  if (!user) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  const displayName = user.name || user.email || user.id;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar size="sm">
        {user.image ? <AvatarImage alt={displayName} src={user.image} /> : null}
        <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{displayName}</p>
        {user.email ? <p className="truncate text-muted-foreground text-xs">{user.email}</p> : null}
      </div>
    </div>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate text-sm" title={value ?? undefined}>
        {value || "—"}
      </p>
    </div>
  );
}

function UploadTaskStatusPanel({
  detail,
  job,
}: {
  detail: NonNullable<QueueJobRecord["resumeDetail"]>;
  job: QueueJobRecord;
}) {
  const itemStatus = uploadItemStatusMeta(detail.itemStatus, detail.batch.target);
  const parseStatus = resumeParseStatusMeta(detail.resumeParseStatus);
  const batchStatus = batchStatusMeta(detail.batch.status);
  const progress = `${detail.batch.processedCount} / ${detail.batch.totalCount}`;
  const errorMessage = detail.errorMessage || detail.resumeParseError || job.failedReason;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-background p-3">
          <p className="text-muted-foreground text-xs">上传任务状态</p>
          <div className="mt-2">
            <Badge variant={itemStatus.variant}>{itemStatus.label}</Badge>
          </div>
          <p className="mt-2 truncate text-muted-foreground text-xs" title={detail.itemId}>
            {detail.itemId}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-muted-foreground text-xs">解析状态</p>
          <div className="mt-2">
            <Badge variant={parseStatus.variant}>{parseStatus.label}</Badge>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            尝试 {detail.attemptCount}
            {job.attemptsStarted === null ? "" : ` / ${job.attemptsStarted}`}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <p className="text-muted-foreground text-xs">批次进度</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={batchStatus.variant}>{batchStatus.label}</Badge>
            <span className="font-medium text-sm">{progress}</span>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            成功 {detail.batch.succeededCount} · 失败 {detail.batch.failedCount}
          </p>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2">
        <DetailField label="文件名" value={detail.originalFileName} />
        <DetailField label="文件大小" value={formatBytes(detail.fileSize)} />
        <DetailField label="候选人" value={detail.candidateName} />
        <DetailField label="候选人邮箱" value={detail.candidateEmail} />
        <DetailField label="目标岗位" value={detail.targetRole} />
        <DetailField
          label="目标位置"
          value={detail.batch.target === "resume_pool" ? "简历广场" : "简历库"}
        />
      </div>

      <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-4">
        <DetailField label="入队时间" value={formatDateTime(detail.queuedAt)} />
        <DetailField label="开始时间" value={formatDateTime(detail.startedAt)} />
        <DetailField label="结束时间" value={formatDateTime(detail.finishedAt)} />
        <DetailField label="处理耗时" value={formatDuration(detail.startedAt, detail.finishedAt)} />
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="font-medium text-destructive text-xs">错误信息</p>
          <p className="mt-1 break-words text-destructive text-sm">{errorMessage}</p>
        </div>
      ) : null}
    </div>
  );
}

function RawJobFallback({ job }: { job: QueueJobRecord }) {
  return (
    <div className="min-h-0 overflow-auto rounded-lg border bg-muted/30 p-4">
      <p className="mb-3 text-muted-foreground text-sm">未匹配到具体上传任务，显示队列原始信息。</p>
      <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed">
        {formatJson({
          attemptsMade: job.attemptsMade,
          attemptsStarted: job.attemptsStarted,
          data: job.data,
          failedReason: job.failedReason,
          finishedOn: job.finishedOn,
          id: job.id,
          name: job.name,
          processedBy: job.processedBy,
          processedOn: job.processedOn,
          progress: job.progress,
          returnvalue: job.returnvalue,
          state: job.state,
          timestamp: job.timestamp,
        })}
      </pre>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold text-lg">
        {typeof value === "number" ? formatCount(value) : value}
      </p>
    </div>
  );
}

export function QueueOverview({ overview }: { overview: QueueOverviewRecord | null }) {
  if (!overview) {
    return null;
  }

  const pendingTotal =
    overview.counts.waiting +
    overview.counts.delayed +
    overview.counts.paused +
    overview.counts.prioritized +
    overview.counts["waiting-children"];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-background">
            <ListChecksIcon />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-xl">{overview.displayName}</h1>
            <p className="truncate text-muted-foreground text-sm">{overview.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={overview.redis ? "success" : "danger"}>
            <DatabaseIcon />
            {overview.redis
              ? `${overview.redis.host}:${overview.redis.port}/${overview.redis.db}`
              : "Redis 未配置"}
          </Badge>
          <Badge variant={overview.workersCount > 0 ? "success" : "warning"}>
            <ServerIcon />
            {overview.workersCount} workers
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <QueueMetric label="排队中" value={pendingTotal} />
        <QueueMetric label="等待中" value={overview.counts.waiting} />
        <QueueMetric label="处理中" value={overview.counts.active} />
        <QueueMetric label="延迟中" value={overview.counts.delayed} />
        <QueueMetric label="失败" value={overview.counts.failed} />
        <QueueMetric label="已完成" value={overview.counts.completed} />
      </div>

      {overview.workers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {overview.workers.slice(0, 8).map((worker) => (
            <Badge key={worker.id ?? worker.addr} variant="secondary">
              <ServerIcon />
              {worker.addr ?? worker.id ?? "unknown"} · idle {worker.idle ?? "?"}s
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function QueueJobDetailDialog({
  job,
  onOpenChange,
}: {
  job: QueueJobRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={job !== null}>
      <DialogContent className="max-h-[82vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>任务详情</DialogTitle>
          <DialogDescription>{job?.id}</DialogDescription>
        </DialogHeader>
        {job ? (
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-xs">组织</p>
                <div className="mt-1">
                  <QueueOrganizationCell organization={job.organization} />
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">触发用户</p>
                <div className="mt-1">
                  <QueueUserCell user={job.triggeredBy} />
                </div>
              </div>
            </div>
            <div className="min-h-0 overflow-auto">
              {job.resumeDetail ? (
                <UploadTaskStatusPanel detail={job.resumeDetail} job={job} />
              ) : (
                <RawJobFallback job={job} />
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function QueuesGrid() {
  const queryClient = useQueryClient();
  const [detailJob, setDetailJob] = useState<QueueJobRecord | null>(null);
  const overviewQuery = useQuery({
    queryFn: () =>
      rpcFetch<QueuesOverviewResult>(rpc.api.platform.queues.$get(), "加载队列概览失败"),
    queryKey: ["platform-queues"],
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });

  const queueOptions = useMemo(
    () =>
      (overviewQuery.data?.records ?? []).map((queue) => ({
        label: queue.displayName,
        value: queue.name,
      })),
    [overviewQuery.data?.records],
  );
  const selectedQueue =
    overviewQuery.data?.records.find((queue) => queue.name === DEFAULT_QUEUE_NAME) ??
    overviewQuery.data?.records[0] ??
    null;

  const fetchJobs = useMemo(
    () =>
      (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: QueueFilters;
      }): Promise<QueueJobsResult> => {
        const queueName = params.filters.queue || DEFAULT_QUEUE_NAME;
        return rpcFetch<QueueJobsResult>(
          rpc.api.platform.queues[":queueName"].jobs.$get({
            param: { queueName },
            query: {
              page: String(params.page),
              pageSize: String(params.pageSize),
              ...(params.search ? { search: params.search } : {}),
              state: normalizeStateFilter(params.filters.state),
            },
          }),
          "加载队列任务失败",
        );
      },
    [],
  );

  const grid = useDataGridState<QueueJobRecord, QueueFilters>({
    defaultPageSize: 20,
    initialFilters: DEFAULT_FILTERS,
    queryFn: fetchJobs,
    queryKeyBase: ["platform-queue-jobs"],
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });

  function refreshAll() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["platform-queues"] });
  }

  const columns = useMemo(
    () => [
      textColumn<QueueJobRecord>({
        key: "id",
        primary: true,
        secondary: (record) => record.name,
        title: "Job ID",
        truncate: "max-w-70",
      }),
      customColumn<QueueJobRecord>({
        cell: (record) => (
          <Badge variant={stateVariant(record.state)}>{stateLabel(record.state)}</Badge>
        ),
        key: "state",
        title: "状态",
      }),
      customColumn<QueueJobRecord>({
        cell: (record) => <QueueOrganizationCell organization={record.organization} />,
        key: "organization",
        title: "组织",
      }),
      customColumn<QueueJobRecord>({
        cell: (record) => <QueueUserCell user={record.triggeredBy} />,
        key: "triggeredBy",
        title: "触发用户",
      }),
      textColumn<QueueJobRecord>({
        cell: (record) => getJobDataSummary(record.data),
        key: "name",
        title: "关联数据",
        truncate: "max-w-76",
      }),
      customColumn<QueueJobRecord>({
        cell: (record) => (
          <span className="text-sm">
            {record.attemptsMade}
            {record.attemptsStarted === null ? "" : ` / ${record.attemptsStarted}`}
          </span>
        ),
        key: "attemptsMade",
        title: "尝试",
      }),
      dateColumn<QueueJobRecord>({
        emptyText: "—",
        key: "timestamp",
        title: "创建时间",
      }),
      dateColumn<QueueJobRecord>({
        emptyText: "—",
        key: "processedOn",
        title: "开始时间",
      }),
      customColumn<QueueJobRecord>({
        cell: (record) => formatDuration(record.processedOn, record.finishedOn),
        key: "duration",
        title: "耗时",
      }),
      textColumn<QueueJobRecord>({
        fallback: "—",
        key: "processedBy",
        muted: true,
        title: "Worker",
        truncate: "max-w-48",
      }),
      actionsColumn<QueueJobRecord>({
        inline: [
          {
            label: "详情",
            onClick: (record) => setDetailJob(record),
          },
        ],
      }),
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <QueueOverview overview={selectedQueue} />

      <DataGrid<QueueJobRecord>
        {...grid.bind}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ActivityIcon />
              </EmptyMedia>
              <EmptyTitle>没有队列任务</EmptyTitle>
              <EmptyDescription>当前筛选条件下没有任务记录。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "search",
            minWidth: "22rem",
            placeholder: "按 Job ID / Item ID 精确查找",
            type: "search",
          },
          {
            key: "queue",
            options:
              queueOptions.length > 0
                ? queueOptions
                : [{ label: "简历解析", value: DEFAULT_QUEUE_NAME }],
            placeholder: "选择队列",
            type: "select",
          },
          {
            key: "state",
            options: [...JOB_STATE_OPTIONS],
            placeholder: "任务状态",
            type: "select",
          },
        ]}
        getRowId={(record) => record.id}
        onRefresh={refreshAll}
      />

      <QueueJobDetailDialog job={detailJob} onOpenChange={(open) => !open && setDetailJob(null)} />
    </div>
  );
}
