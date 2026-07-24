// 不使用 keepPreviousData（见 remount 契约）
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-time-picker";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

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

const PAGE_SIZE = 20;
type StatusFilter = "" | "failed" | "processing" | "queued" | "skipped";
const STATUS_OPTIONS: StatusFilter[] = ["", "queued", "skipped", "failed", "processing"];
const STATUS_LABELS: Record<Exclude<StatusFilter, "">, string> = {
  failed: "失败",
  processing: "处理中",
  queued: "已入队",
  skipped: "已跳过",
};
const JD_BIND_LABELS: Record<string, string> = {
  ambiguous: "多个匹配",
  bound: "已绑定",
  fallback: "兜底绑定",
  unmatched: "未匹配",
};
const POOL_SUMMARY_LABELS: Record<string, string> = {
  all_failed: "全部失败",
  all_pooled: "全部入池",
  parsing: "解析中",
  partial_failed: "部分失败",
};

export function serializeDateRange(
  from: string | null,
  to: string | null,
): { receivedFrom?: string; receivedTo?: string } {
  const out: { receivedFrom?: string; receivedTo?: string } = {};
  let fromDate: Date | null = null;
  let toDate: Date | null = null;
  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    fromDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    out.receivedFrom = fromDate.toISOString();
  }
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    toDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    out.receivedTo = toDate.toISOString();
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("起始日期不能晚于结束日期");
  }
  return out;
}

export interface MailIngestLogAccount {
  emailAddress: string;
  id: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
}

export function renderRunSummary(account: {
  lastCheckedAt: string | null;
  lastError: string | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
}): { error: string | null; label: string; showCounts: boolean } {
  if (account.lastCheckedAt === null) {
    return { error: null, label: "尚未轮询", showCounts: false };
  }
  const allZero =
    !account.lastRunReceived &&
    !account.lastRunSubjectSkipped &&
    !account.lastRunMatched &&
    !account.lastRunQueued &&
    !account.lastRunFailed;
  if (account.lastError && allZero) {
    return {
      error: account.lastError,
      label: "最近轮询失败，暂无成功快照",
      showCounts: false,
    };
  }
  return { error: account.lastError, label: "上轮快照", showCounts: true };
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  const min = Math.round(diffMs / 60_000);
  if (Math.abs(min) < 60) {
    return rtf.format(-min, "minute");
  }
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) {
    return rtf.format(-hr, "hour");
  }
  return rtf.format(-Math.round(hr / 24), "day");
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

function renderJdBinding(rec: MailMessageRecord): ReactNode {
  const statusTag = rec.jdBindStatus
    ? (JD_BIND_LABELS[rec.jdBindStatus] ?? rec.jdBindStatus)
    : null;
  if (rec.boundJobDescriptionName) {
    return (
      <>
        {rec.boundJobDescriptionName}
        {statusTag ? <span className="ml-1 text-muted-foreground text-xs">{statusTag}</span> : null}
      </>
    );
  }
  // 无绑定 JD：新邮件显示未匹配/多个匹配等原因；改造前邮件（jdBindStatus 为 null）显示 —
  return statusTag ?? "—";
}

function MailIngestLogMessages({ account, slug }: { account: MailIngestLogAccount; slug: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("");
  const [keyword, setKeyword] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const hasFilters = Boolean(status || keyword || from || to);

  function resetToFirstPage() {
    setPage(1);
  }

  const query = useQuery({
    enabled: !dateError,
    queryFn: () => {
      const range = serializeDateRange(from, to);
      return rpcFetch<{ records: MailMessageRecord[]; total: number }>(
        rpc.api.w[":slug"].studio["mail-ingest-accounts"].managed[":id"].messages.$get({
          param: { id: account.id, slug },
          query: {
            page: String(page),
            pageSize: String(PAGE_SIZE),
            ...(status ? { status } : {}),
            ...(keyword ? { keyword } : {}),
            ...(range.receivedFrom ? { receivedFrom: range.receivedFrom } : {}),
            ...(range.receivedTo ? { receivedTo: range.receivedTo } : {}),
          },
        }),
        "加载入库记录失败",
      );
    },
    queryKey: ["mail-ingest-messages", slug, account.id, { from, keyword, status, to }, page],
  });

  function applyDates(nextFrom: string | null, nextTo: string | null) {
    try {
      serializeDateRange(nextFrom, nextTo);
      setDateError(null);
    } catch (error) {
      setDateError(error instanceof Error ? error.message : "日期不合法");
    }
    setFrom(nextFrom);
    setTo(nextTo);
    resetToFirstPage();
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mail-ingest-messages", slug, account.id] }),
      queryClient.invalidateQueries({ queryKey: ["managed-mail-ingest-accounts", slug] }),
    ]);
  }

  // 错误 toast 放 effect，避免在 render body 里每次渲染都触发（内联重试见下方三态分支）
  useEffect(() => {
    if (query.isError) {
      toast.error(query.error instanceof Error ? query.error.message : "加载入库记录失败");
    }
  }, [query.isError, query.error]);

  const records = query.data?.records ?? [];
  const total = query.data?.total ?? 0;

  let messagesContent: ReactNode;
  if (query.isLoading) {
    messagesContent = (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div className="h-8 animate-pulse rounded bg-muted" key={i} />
        ))}
      </div>
    );
  } else if (query.isError) {
    messagesContent = (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">加载入库记录失败</p>
        <button onClick={() => query.refetch()} type="button">
          重试
        </button>
      </div>
    );
  } else if (records.length === 0) {
    messagesContent = dateError ? null : (
      <p className="text-muted-foreground text-sm">
        {hasFilters ? "当前筛选条件下无匹配邮件" : "该邮箱暂无入库记录"}
      </p>
    );
  } else {
    messagesContent = (
      <table className="w-full text-left text-sm [&_td]:py-1.5 [&_td]:pr-6 [&_td]:align-top [&_th]:pr-6 [&_th]:pb-2 [&_th]:font-medium">
        <thead>
          <tr className="text-muted-foreground">
            <th>收到时间</th>
            <th>状态</th>
            <th>JD绑定</th>
            <th>附件(简历/总)</th>
            <th>主题</th>
            <th>发件人</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => (
            <Fragment key={rec.id}>
              <tr>
                <td>{rec.receivedAt ? new Date(rec.receivedAt).toLocaleString() : "—"}</td>
                <td>
                  <Badge variant={statusVariant(rec.status)}>{STATUS_LABELS[rec.status]}</Badge>
                </td>
                <td>{renderJdBinding(rec)}</td>
                <td>
                  {`${rec.resumeAttachmentCount ?? "—"}/${rec.attachmentCount ?? "—"}`}
                  {rec.poolSummary ? (
                    <span className="ml-1 text-muted-foreground text-xs">
                      {POOL_SUMMARY_LABELS[rec.poolSummary] ?? rec.poolSummary}
                    </span>
                  ) : null}
                  {rec.attachments.length > 0 ? (
                    <button
                      aria-label="展开附件"
                      className="ml-1 text-xs underline"
                      onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                      type="button"
                    >
                      {expanded === rec.id ? "收起" : "展开"}
                    </button>
                  ) : null}
                </td>
                <td>{rec.subject ?? "（无主题）"}</td>
                <td>{rec.fromAddress ?? "—"}</td>
              </tr>
              {rec.status === "failed" && rec.errorMessage ? (
                <tr>
                  <td className="text-destructive" colSpan={6}>
                    {rec.errorMessage}
                  </td>
                </tr>
              ) : null}
              {rec.status === "skipped" && rec.skipReason ? (
                <tr>
                  <td className="text-muted-foreground" colSpan={6}>
                    {rec.skipReason}
                  </td>
                </tr>
              ) : null}
              {expanded === rec.id ? (
                <tr aria-label="附件详情">
                  <td colSpan={6}>
                    <ul className="space-y-1">
                      {rec.attachments.map((att) => (
                        <li key={att.fileName}>
                          {att.fileName}
                          {att.resumeParseStatus ? ` · ${att.resumeParseStatus}` : ""}
                          {att.resumeParseError ? (
                            <span className="text-destructive"> · {att.resumeParseError}</span>
                          ) : null}
                          {att.hasDuplicate ? (
                            <span className="text-muted-foreground"> · 疑似重复</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section className="space-y-3">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            className={status === opt ? "font-semibold underline" : "text-muted-foreground"}
            key={opt || "all"}
            onClick={() => {
              setStatus(opt);
              resetToFirstPage();
            }}
            type="button"
          >
            {opt === "" ? "全部" : STATUS_LABELS[opt]}
          </button>
        ))}
        <input
          aria-label="关键词"
          className="rounded border px-2 py-1 text-sm"
          onChange={(e) => {
            setKeyword(e.target.value);
            resetToFirstPage();
          }}
          placeholder="主题或发件人"
          value={keyword}
        />
        <DatePicker
          aria-label="起始日期"
          className="h-8 text-sm"
          onValueChange={(value) => applyDates(value || null, to)}
          placeholder="起始日期"
          value={from ?? ""}
        />
        <DatePicker
          aria-label="结束日期"
          className="h-8 text-sm"
          onValueChange={(value) => applyDates(from, value || null)}
          placeholder="结束日期"
          value={to ?? ""}
        />
        {hasFilters ? (
          <button
            onClick={() => {
              setStatus("");
              setKeyword("");
              setFrom(null);
              setTo(null);
              setDateError(null);
              resetToFirstPage();
            }}
            type="button"
          >
            清除筛选
          </button>
        ) : null}
        <button onClick={refresh} type="button">
          刷新
        </button>
      </div>
      {dateError ? <p className="text-destructive text-xs">{dateError}</p> : null}

      {/* 三态：加载 / 错误 / 内容 */}
      {messagesContent}

      {/* 分页 */}
      <div className="flex items-center justify-between">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} type="button">
          上一页
        </button>
        <span className="text-muted-foreground text-xs">{`共 ${total} 封`}</span>
        <button
          disabled={page * PAGE_SIZE >= total}
          onClick={() => setPage((p) => p + 1)}
          type="button"
        >
          下一页
        </button>
      </div>
    </section>
  );
}

export function MailIngestLogDrawer({
  account,
  onOpenChange,
  open,
  slug,
}: {
  account: MailIngestLogAccount | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slug: string;
}) {
  const summary = account ? renderRunSummary(account) : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[88vw]">
        <SheetHeader className="border-border border-b px-6 pt-6 pb-4">
          <SheetTitle>入库记录</SheetTitle>
          <SheetDescription>{account?.emailAddress ?? null}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-6">
          {account && summary ? (
            <section className="space-y-1">
              <p className="font-medium text-sm">{summary.label}</p>
              {summary.showCounts ? (
                <p className="text-muted-foreground text-sm">
                  {`收到${account.lastRunReceived ?? 0} · 标题不符${account.lastRunSubjectSkipped ?? 0} · 命中${account.lastRunMatched ?? 0} · 入队${account.lastRunQueued ?? 0} · 失败${account.lastRunFailed ?? 0}`}
                </p>
              ) : null}
              {account.lastCheckedAt ? (
                <p className="text-muted-foreground text-xs">
                  {`最近检查：${formatRelative(account.lastCheckedAt)}`}
                </p>
              ) : null}
              {summary.error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {summary.error}
                </p>
              ) : null}
            </section>
          ) : null}
          {account ? <MailIngestLogMessages account={account} slug={slug} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
