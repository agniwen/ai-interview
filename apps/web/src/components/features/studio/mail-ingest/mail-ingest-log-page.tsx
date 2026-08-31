import { listTextQuery } from "@arc/shared/list-text-filters";
import { IconArrowLeft, IconInbox } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  customColumn,
  DataGrid,
  dateColumn,
  useDataGridState,
} from "@/components/features/data-grid";
import type { DataGridFetchParams, DataGridFetchResult } from "@/components/features/data-grid";
import { PageHeader } from "@/components/features/studio/page-header";
import { useStudioHeaderOverride } from "@/components/features/studio/studio-header-context";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { serializeDateRange } from "./mail-ingest-log-drawer";

interface MailMessageAttachment {
  fileName: string;
  hasDuplicate: boolean;
  resumeParseError: string | null;
  resumeParseStatus: string | null;
}

interface MailMessageRecord {
  attachmentCount: number | null;
  attachments: MailMessageAttachment[];
  boundJobDescriptionName: string | null;
  errorMessage: string | null;
  fromAddress: string | null;
  id: string;
  jdBindStatus: string | null;
  poolSummary: string | null;
  receivedAt: string | null;
  resumeAttachmentCount: number | null;
  skipReason: string | null;
  status: "failed" | "processing" | "queued" | "skipped";
  subject: string | null;
}

interface MessageFilters extends Record<string, string> {
  receivedFrom: string;
  receivedTo: string;
  status: string;
}

const STATUS_LABELS = {
  failed: "失败",
  processing: "处理中",
  queued: "已入队",
  skipped: "已跳过",
} as const;

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value }));
const mailMessageStatusSchema = z.enum(["failed", "processing", "queued", "skipped"]);
const mailIngestRouteParamsSchema = z.object({ id: z.string(), slug: z.string() });
const JD_BIND_LABELS = {
  ambiguous: "多个匹配",
  bound: "已绑定",
  fallback: "兜底绑定",
  unmatched: "未匹配",
} as const;
const POOL_SUMMARY_LABELS = {
  all_failed: "全部失败",
  all_pooled: "全部入池",
  parsing: "解析中",
  partial_failed: "部分失败",
} as const;

function isJdBindStatus(value: string): value is keyof typeof JD_BIND_LABELS {
  return value in JD_BIND_LABELS;
}

function isPoolSummary(value: string): value is keyof typeof POOL_SUMMARY_LABELS {
  return value in POOL_SUMMARY_LABELS;
}

interface MailIngestDateRange {
  receivedFrom?: string;
  receivedTo?: string;
}

interface MailIngestMessagesQuery extends MailIngestDateRange {
  keyword?: string;
  page: string;
  pageSize: string;
  status?: MailMessageRecord["status"];
}

function statusVariant(status: MailMessageRecord["status"]) {
  if (status === "failed") {
    return "destructive";
  }
  if (status === "skipped") {
    return "outline";
  }
  if (status === "processing") {
    return "secondary";
  }
  return "default";
}

export function MailIngestLogPage() {
  const { id, slug } = mailIngestRouteParamsSchema.parse(useParams({ strict: false }));
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const headerOverride = useMemo(
    () => (
      <div className="flex min-w-0 items-center gap-2">
        <Button
          className="-ml-1 h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
          onClick={async () => {
            try {
              await navigate({ params: { slug }, to: "/w/$slug/studio/mail-ingest-accounts" });
            } catch {
              toast.error("返回邮箱监听失败");
            }
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconArrowLeft />
          <span className="hidden sm:inline">返回邮箱监听</span>
        </Button>
      </div>
    ),
    [navigate, slug],
  );
  useStudioHeaderOverride(headerOverride);

  const accountQuery = useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio["mail-ingest-accounts"].managed[":id"].$get({
          param: { id, slug },
        }),
        "加载邮箱监听配置失败",
      ),
    queryKey: ["managed-mail-ingest-account", slug, id],
  });

  async function fetchMessages(
    params: DataGridFetchParams<MessageFilters>,
  ): Promise<DataGridFetchResult<MailMessageRecord>> {
    const range = serializeDateRange(
      params.filters.receivedFrom || null,
      params.filters.receivedTo || null,
    );
    const query: MailIngestMessagesQuery = {
      ...listTextQuery(params),
      page: String(params.page),
      pageSize: String(params.pageSize),
      ...range,
    };
    if (params.search) {
      query.keyword = params.search;
    }
    const status = mailMessageStatusSchema.safeParse(params.filters.status);
    if (status.success) {
      query.status = status.data;
    }
    const result = await rpcFetch(
      rpc.api.w[":slug"].studio["mail-ingest-accounts"].managed[":id"].messages.$get({
        param: { id, slug },
        query,
      }),
      "加载入库记录失败",
    );
    return {
      ...result,
      totalPages: Math.max(1, Math.ceil(result.total / params.pageSize)),
    };
  }

  const grid = useDataGridState<MailMessageRecord, MessageFilters>({
    defaultPageSize: 20,
    initialFilters: { receivedFrom: "", receivedTo: "", status: "" },
    queryFn: fetchMessages,
    queryKeyBase: ["mail-ingest-messages", slug, id],
  });

  function applyDate(key: "receivedFrom" | "receivedTo", value: string) {
    const nextFrom = key === "receivedFrom" ? value : grid.filters.receivedFrom;
    const nextTo = key === "receivedTo" ? value : grid.filters.receivedTo;
    try {
      serializeDateRange(nextFrom || null, nextTo || null);
      grid.bind.onFilterChange(key, value);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "日期不合法");
    }
  }

  const columns = useMemo(
    () => [
      dateColumn<MailMessageRecord>({ emptyText: "—", key: "receivedAt", title: "收到时间" }),
      customColumn<MailMessageRecord>({
        cell: (record) => (
          <Badge variant={statusVariant(record.status)}>{STATUS_LABELS[record.status]}</Badge>
        ),
        key: "status",
        title: "状态",
      }),
      customColumn<MailMessageRecord>({
        cell: (record) => (
          <div className="flex min-w-40 flex-col gap-1">
            <span>
              {record.boundJobDescriptionName ??
                (record.jdBindStatus && isJdBindStatus(record.jdBindStatus)
                  ? JD_BIND_LABELS[record.jdBindStatus]
                  : "—")}
            </span>
            {record.boundJobDescriptionName && record.jdBindStatus ? (
              <span className="text-muted-foreground text-xs">
                {isJdBindStatus(record.jdBindStatus)
                  ? JD_BIND_LABELS[record.jdBindStatus]
                  : record.jdBindStatus}
              </span>
            ) : null}
          </div>
        ),
        key: "jdBinding",
        title: "JD 绑定",
      }),
      customColumn<MailMessageRecord>({
        cell: (record) => (
          <div className="flex min-w-44 flex-col gap-1">
            <span>
              {`${record.resumeAttachmentCount ?? "—"}/${record.attachmentCount ?? "—"}`}
              {record.poolSummary
                ? ` · ${isPoolSummary(record.poolSummary) ? POOL_SUMMARY_LABELS[record.poolSummary] : record.poolSummary}`
                : ""}
            </span>
            {record.attachments.length > 0 ? (
              <Button
                className="w-fit px-0"
                onClick={() => setExpanded((current) => (current === record.id ? null : record.id))}
                size="xs"
                variant="link"
              >
                {expanded === record.id ? "收起附件" : `查看附件（${record.attachments.length}）`}
              </Button>
            ) : null}
            {expanded === record.id ? (
              <ul className="flex flex-col gap-1 text-xs">
                {record.attachments.map((attachment) => (
                  <li key={attachment.fileName}>
                    {attachment.fileName}
                    {attachment.resumeParseStatus ? ` · ${attachment.resumeParseStatus}` : ""}
                    {attachment.resumeParseError ? ` · ${attachment.resumeParseError}` : ""}
                    {attachment.hasDuplicate ? " · 疑似重复" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ),
        key: "attachments",
        title: "附件（简历/总）",
      }),
      customColumn<MailMessageRecord>({
        cell: (record) => (
          <div className="flex min-w-60 max-w-96 flex-col gap-1">
            <span className="truncate">{record.subject ?? "（无主题）"}</span>
            {record.errorMessage || record.skipReason ? (
              <span
                className={
                  record.errorMessage ? "text-destructive text-xs" : "text-muted-foreground text-xs"
                }
              >
                {record.errorMessage ?? record.skipReason}
              </span>
            ) : null}
          </div>
        ),
        key: "subject",
        title: "主题",
      }),
      customColumn<MailMessageRecord>({
        cell: (record) => record.fromAddress ?? "—",
        key: "fromAddress",
        title: "发件人",
      }),
    ],
    [expanded],
  );

  const account = accountQuery.data;
  if (accountQuery.isLoading) {
    return <StudioTablePageSkeleton columnCount={6} filterCount={4} label="入库记录" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader
        description={account?.account.emailAddress ?? "查看邮件入库与解析结果"}
        title="入库记录"
      />

      {account?.account.lastError ? (
        <Alert variant="destructive">
          <AlertTitle>最近轮询异常</AlertTitle>
          <AlertDescription>{account.account.lastError}</AlertDescription>
        </Alert>
      ) : null}

      {account ? (
        <p className="text-muted-foreground text-sm">
          {`上轮收到 ${account.lastRunReceived ?? 0} · 标题不符 ${account.lastRunSubjectSkipped ?? 0} · 命中 ${account.lastRunMatched ?? 0} · 入队 ${account.lastRunQueued ?? 0} · 失败 ${account.lastRunFailed ?? 0}`}
        </p>
      ) : null}

      <DataGrid<MailMessageRecord>
        {...grid.bind}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconInbox />
              </EmptyMedia>
              <EmptyTitle>
                {grid.bind.canResetFilters ? "没有匹配的入库记录" : "暂无入库记录"}
              </EmptyTitle>
              <EmptyDescription>
                {grid.bind.canResetFilters ? "调整筛选条件后重试。" : "该邮箱尚未收到可入库邮件。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "textFilters" as const,
            resource: "mailLogs" as const,
            type: "text-filters" as const,
          },
          {
            key: "status",
            label: "状态",
            options: STATUS_OPTIONS,
            placeholder: "全部状态",
            type: "select",
          },
          {
            boundary: "from",
            key: "receivedFrom",
            label: "收到时间（起始）",
            max: grid.filters.receivedTo,
            type: "date",
          },
          {
            boundary: "to",
            key: "receivedTo",
            label: "收到时间（截止）",
            min: grid.filters.receivedFrom,
            type: "date",
          },
        ]}
        onFilterChange={(key, value) => {
          if (key === "receivedFrom" || key === "receivedTo") {
            applyDate(key, value);
          } else {
            grid.bind.onFilterChange(key, value);
          }
        }}
        getRowId={(record) => record.id}
      />
    </div>
  );
}
