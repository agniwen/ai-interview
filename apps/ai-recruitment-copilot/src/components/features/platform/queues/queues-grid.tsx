"use client";

import { ActivityIcon, DatabaseIcon, ListChecksIcon, ServerIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  processedBy: string | null;
  processedOn: string | null;
  progress: unknown;
  returnvalue: unknown;
  state: string;
  timestamp: string | null;
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

function QueueOverview({ overview }: { overview: QueueOverviewRecord | null }) {
  if (!overview) {
    return null;
  }

  const pendingTotal =
    overview.counts.waiting +
    overview.counts.active +
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
        <QueueMetric label="待处理" value={pendingTotal} />
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

function QueueJobDetailDialog({
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
          <div className="min-h-0 overflow-auto rounded-lg border bg-muted/30 p-4">
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
