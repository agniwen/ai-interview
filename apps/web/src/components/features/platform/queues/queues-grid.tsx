"use client";

import {
  IconActivity,
  IconBuilding,
  IconDatabase,
  IconListCheck,
  IconServer,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
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
} from "@/components/features/data-grid";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { formatBytes } from "@app/shared/utils/format";
import {
  batchStatusMeta,
  formatCount,
  formatDuration,
  getInitials,
  getJobDataSummary,
  isQueueJobData,
  normalizeParseStatusFilter,
  normalizeStateFilter,
  normalizeUploadStatusFilter,
  resumeParseStatusMeta,
  stateLabel,
  stateVariant,
  uploadItemStatusMeta,
} from "./queues-grid-model";
import type { JobStateFilter, ParseStatusFilter, UploadStatusFilter } from "./queues-grid-model";

const DEFAULT_QUEUE_NAME = "resume-parse";
const PLATFORM_QUEUE_OPTIONS = [
  { label: "简历解析", value: "resume-parse" },
  { label: "AI分析", value: "resume-review-generation" },
] as const;
const DEFAULT_FILTERS = {
  parseStatus: "all",
  queue: DEFAULT_QUEUE_NAME,
  state: "all",
  uploadStatus: "all",
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

const UPLOAD_STATUS_FILTER_OPTIONS = [
  { label: "全部上传状态", value: "all" },
  { label: "排队中", value: "pending" },
  { label: "处理中", value: "processing" },
  { label: "已完成", value: "succeeded" },
  { label: "失败", value: "failed" },
  { label: "已跳过", value: "duplicate_skipped" },
  { label: "已取消", value: "cancelled" },
] as const;

const PARSE_STATUS_FILTER_OPTIONS = [
  { label: "全部解析状态", value: "all" },
  { label: "待解析", value: "queued" },
  { label: "未解析", value: "unparsed" },
  { label: "解析中", value: "processing" },
  { label: "已解析", value: "ready" },
  { label: "解析失败", value: "failed" },
] as const;

type QueueFilters = typeof DEFAULT_FILTERS;

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

interface QueueJobsRequest {
  query: {
    page: string;
    pageSize: string;
    parseStatus: ParseStatusFilter;
    search?: string;
    state: JobStateFilter;
    uploadStatus: UploadStatusFilter;
  };
  queueName: string;
}

export interface QueuesGridDependencies {
  fetchJobs: (request: QueueJobsRequest) => Promise<QueueJobsResult>;
  fetchOverview: () => Promise<QueuesOverviewResult>;
}

const defaultQueuesGridDependencies: QueuesGridDependencies = {
  fetchJobs: ({ query, queueName }) =>
    rpcFetch(
      rpc.api.platform.queues[":queueName"].jobs.$get({
        param: { queueName },
        query,
      }),
      "加载队列任务失败",
    ),
  fetchOverview: () => rpcFetch(rpc.api.platform.queues.$get(), "加载队列概览失败"),
};

export function createQueueJobsFetcher(fetchJobs: QueuesGridDependencies["fetchJobs"]) {
  return (params: {
    search: string;
    page: number;
    pageSize: number;
    filters: QueueFilters;
  }): Promise<QueueJobsResult> => {
    const queueName = params.filters.queue || DEFAULT_QUEUE_NAME;
    const query = params.search
      ? {
          page: String(params.page),
          pageSize: String(params.pageSize),
          parseStatus: normalizeParseStatusFilter(params.filters.parseStatus),
          search: params.search,
          state: normalizeStateFilter(params.filters.state),
          uploadStatus: normalizeUploadStatusFilter(params.filters.uploadStatus),
        }
      : {
          page: String(params.page),
          pageSize: String(params.pageSize),
          parseStatus: normalizeParseStatusFilter(params.filters.parseStatus),
          state: normalizeStateFilter(params.filters.state),
          uploadStatus: normalizeUploadStatusFilter(params.filters.uploadStatus),
        };
    return fetchJobs({ query, queueName });
  };
}

function QueueOrganizationCell({ organization }: { organization: QueueJobRecord["organization"] }) {
  if (!organization) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <IconBuilding className="size-4 shrink-0 text-muted-foreground" />
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
      <Avatar label={`${displayName}的头像`} seed={`queue-user:${user.email || user.id}`} size="sm">
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

function DetailField({ label, title, value }: { label: string; title?: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate text-sm" title={title}>
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
          value={detail.batch.target === "resume_pool" ? "人才库" : "招聘台"}
        />
      </div>

      <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-4">
        <DetailField
          label="入队时间"
          value={<LocalDateTimeText format="compact-zh" value={detail.queuedAt} />}
        />
        <DetailField
          label="开始时间"
          value={<LocalDateTimeText format="compact-zh" value={detail.startedAt} />}
        />
        <DetailField
          label="结束时间"
          value={<LocalDateTimeText format="compact-zh" value={detail.finishedAt} />}
        />
        <DetailField label="处理耗时" value={formatDuration(detail.startedAt, detail.finishedAt)} />
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="font-medium text-destructive text-xs">错误信息</p>
          <p className="mt-1 wrap-break-word text-destructive text-sm">{errorMessage}</p>
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
        {JSON.stringify(
          {
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
          },
          null,
          2,
        ) ?? "null"}
      </pre>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold text-lg">{formatCount(value)}</p>
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
            <IconListCheck />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-xl">{overview.displayName}</h1>
            <p className="truncate text-muted-foreground text-sm">{overview.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={overview.redis ? "success" : "danger"}>
            <IconDatabase />
            {overview.redis
              ? `${overview.redis.host}:${overview.redis.port}/${overview.redis.db}`
              : "Redis 未配置"}
          </Badge>
          <Badge variant={overview.workersCount > 0 ? "success" : "warning"}>
            <IconServer />
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
              <IconServer />
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

export function QueuesGrid({
  dependencies = defaultQueuesGridDependencies,
}: {
  dependencies?: QueuesGridDependencies;
}) {
  const queryClient = useQueryClient();
  const [detailJob, setDetailJob] = useState<QueueJobRecord | null>(null);
  const overviewQuery = useQuery({
    queryFn: dependencies.fetchOverview,
    queryKey: ["platform-queues"],
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });

  const queueOptions = useMemo(() => {
    const records = overviewQuery.data?.records ?? [];
    if (records.length === 0) {
      return [...PLATFORM_QUEUE_OPTIONS];
    }
    const seen = new Set<string>();
    return [
      ...records.map((queue) => {
        seen.add(queue.name);
        return {
          label: queue.displayName,
          value: queue.name,
        };
      }),
      ...PLATFORM_QUEUE_OPTIONS.filter((queue) => !seen.has(queue.value)),
    ];
  }, [overviewQuery.data?.records]);

  const fetchJobs = useMemo(() => createQueueJobsFetcher(dependencies.fetchJobs), [dependencies]);

  const grid = useDataGridState<QueueJobRecord, QueueFilters>({
    defaultPageSize: 20,
    initialFilters: DEFAULT_FILTERS,
    keywordSearch: true,
    queryFn: fetchJobs,
    queryKeyBase: ["platform-queue-jobs"],
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });
  const selectedQueueName = grid.filters.queue || DEFAULT_QUEUE_NAME;
  const selectedQueue =
    overviewQuery.data?.records.find((queue) => queue.name === selectedQueueName) ??
    overviewQuery.data?.records.find((queue) => queue.name === DEFAULT_QUEUE_NAME) ??
    overviewQuery.data?.records[0] ??
    null;
  const isResumeParseQueue = selectedQueueName === DEFAULT_QUEUE_NAME;

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
        cell: (record) =>
          record.resumeDetail?.originalFileName ? (
            <span className="block max-w-64 truncate" title={record.resumeDetail.originalFileName}>
              {record.resumeDetail.originalFileName}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        key: "originalFileName",
        size: 220,
        title: "文件名",
      }),
      customColumn<QueueJobRecord>({
        cell: (record) => (
          <Badge variant={stateVariant(record.state)}>{stateLabel(record.state)}</Badge>
        ),
        key: "state",
        title: "状态",
      }),
      ...(isResumeParseQueue
        ? [
            customColumn<QueueJobRecord>({
              cell: (record) => {
                if (!record.resumeDetail) {
                  return <span className="text-muted-foreground">—</span>;
                }
                const status = uploadItemStatusMeta(
                  record.resumeDetail.itemStatus,
                  record.resumeDetail.batch.target,
                );
                return <Badge variant={status.variant}>{status.label}</Badge>;
              },
              key: "uploadTaskStatus",
              title: "上传任务状态",
            }),
            customColumn<QueueJobRecord>({
              cell: (record) => {
                const status = resumeParseStatusMeta(
                  record.resumeDetail?.resumeParseStatus ?? null,
                );
                return <Badge variant={status.variant}>{status.label}</Badge>;
              },
              key: "resumeParseStatus",
              title: "解析状态",
            }),
          ]
        : []),
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
        cell: (record) => getJobDataSummary(isQueueJobData(record.data) ? record.data : null),
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
    [isResumeParseQueue],
  );

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        activationMode="manual"
        onValueChange={(value) => grid.setFilter("queue", value)}
        value={selectedQueueName}
      >
        <TabsList>
          {queueOptions.map((queue) => (
            <TabsTrigger key={queue.value} value={queue.value}>
              {queue.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <QueueOverview overview={selectedQueue} />

      <DataGrid<QueueJobRecord>
        {...grid.bind}
        columnPinning={{ end: ["actions"] }}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconActivity />
              </EmptyMedia>
              <EmptyTitle>没有队列任务</EmptyTitle>
              <EmptyDescription>当前筛选条件下没有任务记录。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "search",
            label: "任务 ID",
            minWidth: "22rem",
            operator: { label: "是", value: "is" },
            placeholder: "按任务 ID 精确查找",
            type: "search",
          },
          {
            key: "state",
            options: [...JOB_STATE_OPTIONS],
            placeholder: "任务状态",
            type: "select",
            unfilteredValue: "all",
          },
          ...(isResumeParseQueue
            ? [
                {
                  key: "uploadStatus",
                  options: [...UPLOAD_STATUS_FILTER_OPTIONS],
                  placeholder: "上传任务状态",
                  type: "select" as const,
                  unfilteredValue: "all",
                },
                {
                  key: "parseStatus",
                  options: [...PARSE_STATUS_FILTER_OPTIONS],
                  placeholder: "解析状态",
                  type: "select" as const,
                  unfilteredValue: "all",
                },
              ]
            : []),
        ]}
        getRowId={(record) => record.id}
        onRefresh={refreshAll}
      />

      <QueueJobDetailDialog job={detailJob} onOpenChange={(open) => !open && setDetailJob(null)} />
    </div>
  );
}
