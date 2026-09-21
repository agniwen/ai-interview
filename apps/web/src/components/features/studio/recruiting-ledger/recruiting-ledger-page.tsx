"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useState } from "react";
import { toast } from "sonner";
import { recruitingLedgerRecommendationOptions } from "@app/shared/studio-recruiting-ledger";
import type {
  RecruitingLedgerHumanRound,
  RecruitingLedgerJobSummary,
  RecruitingLedgerRecord,
} from "@app/shared/studio-recruiting-ledger";
import { IconCalendar, IconExternalLink, IconRefresh, IconSearch } from "@tabler/icons-react";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  RecruitingPointsTooltip,
  recruitingPriorityMeta,
} from "@/components/features/studio/recruiting-ledger/recruiting-points-tooltip";
import { RecruitingBoardTabs } from "@/components/features/studio/resumes/recruiting-board-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchRecruitingLedger, updateRecruitingLedgerInformationSync } from "@/lib/client/api";

const routeApi = getRouteApi("/w/$slug/studio/recruiting-ledger");
const recommendationLabels = new Map(
  recruitingLedgerRecommendationOptions.map((option) => [option.value, option.label]),
);

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function formatSalary(value: number | null, currency: string): string {
  if (value === null) {
    return "—";
  }
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${value.toLocaleString("zh-CN")}`;
}

function humanRoundConclusion(round: RecruitingLedgerHumanRound) {
  if (round.outcome === "pass") {
    return { label: "通过", variant: "success" as const };
  }
  if (round.outcome === "fail") {
    return { label: "不通过", variant: "danger" as const };
  }
  if (round.outcome === "inconclusive") {
    return { label: "待定", variant: "warning" as const };
  }
  if (round.status === "completed") {
    return { label: "待确认", variant: "warning" as const };
  }
  if (round.status === "cancelled") {
    return { label: "已取消", variant: "outline" as const };
  }
  return { label: "待进行", variant: "info" as const };
}

function HumanRoundCell({ round }: { round: RecruitingLedgerHumanRound | null }) {
  if (!round) {
    return <span className="text-muted-foreground">—</span>;
  }
  const conclusion = humanRoundConclusion(round);
  return (
    <div className="min-w-36 space-y-1 leading-tight">
      <div className="flex items-center gap-1.5">
        <div className="font-medium text-xs">{round.label}</div>
        <Badge variant={conclusion.variant}>{conclusion.label}</Badge>
      </div>
      <div className="text-muted-foreground text-xs">{formatDate(round.scheduledAt)}</div>
      {round.interviewerNames.length > 0 ? (
        <div className="max-w-48 truncate text-muted-foreground text-xs">
          {round.interviewerNames.join("、")}
        </div>
      ) : null}
    </div>
  );
}

function calendarDate(value?: string): Date | undefined {
  return value ? new Date(`${value}T12:00:00`) : undefined;
}

function calendarKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateRangeLabel(from?: string, to?: string) {
  if (!(from && to)) {
    return "全部日期";
  }
  return from === to ? from : `${from} 至 ${to}`;
}

function DateRangeFilter({
  from,
  label,
  onChange,
  to,
}: {
  from?: string;
  label: string;
  onChange: (from?: string, to?: string) => void;
  to?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: calendarDate(from),
    to: calendarDate(to),
  }));
  const rangeLabel = dateRangeLabel(from, to);
  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setDraft({ from: calendarDate(from), to: calendarDate(to) });
        }
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button className="font-normal" variant={from && to ? "secondary" : "outline"}>
            <IconCalendar className="size-4" />
            {label}：{rangeLabel}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar locale={zhCN} mode="range" onSelect={setDraft} selected={draft} />
        <div className="flex justify-end gap-2 border-t p-2">
          <Button
            onClick={() => {
              onChange();
              setOpen(false);
            }}
            size="sm"
            variant="ghost"
          >
            清除
          </Button>
          <Button
            disabled={!(draft?.from && draft.to)}
            onClick={() => {
              if (!(draft?.from && draft.to)) {
                return;
              }
              onChange(calendarKey(draft.from), calendarKey(draft.to));
              setOpen(false);
            }}
            size="sm"
          >
            应用
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function recommendationVariant(level: RecruitingLedgerRecord["qualitativeRecommendationLevel"]) {
  if (level === "highly_recommended" || level === "recommended") {
    return "success" as const;
  }
  if (level === "not_recommended") {
    return "danger" as const;
  }
  return "outline" as const;
}

function JobSummaryMetrics({ rows }: { rows: RecruitingLedgerJobSummary[] }) {
  const configuredRows = rows.filter((row) => row.headcount !== null);
  const hasUnconfiguredDemand = configuredRows.length !== rows.length;
  const totalDemand = configuredRows.reduce((sum, row) => sum + (row.headcount ?? 0), 0);
  const totalGap = configuredRows.reduce((sum, row) => sum + (row.gap ?? 0), 0);
  const formatIncompleteTotal = (value: number) => {
    if (configuredRows.length === 0 && rows.length > 0) {
      return "—";
    }
    return hasUnconfiguredDemand ? `${value}+` : value;
  };
  const metrics = [
    { className: "", label: "在招岗位", value: rows.length },
    {
      className: "",
      label: "总需求",
      value: formatIncompleteTotal(totalDemand),
    },
    {
      className: "text-emerald-600",
      label: "已确定",
      value: rows.reduce((sum, row) => sum + row.confirmed, 0),
    },
    {
      className: "text-rose-600",
      label: "总缺口",
      value: formatIncompleteTotal(totalGap),
    },
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div className="rounded-xl border bg-card px-4 py-3 text-center" key={metric.label}>
          <div className={`font-semibold text-2xl tabular-nums ${metric.className}`}>
            {metric.value}
          </div>
          <div className="mt-1 text-muted-foreground text-xs">{metric.label}</div>
        </div>
      ))}
    </div>
  );
}

function jobSummaryStatus(row: RecruitingLedgerJobSummary) {
  if (row.headcount === null) {
    return { className: "text-muted-foreground", label: "尚未设置招聘需求人数" };
  }
  if (row.gap !== null && row.gap > 0) {
    return {
      className: "text-rose-600 dark:text-rose-400",
      label: `还差 ${row.gap} 人，建议继续补充候选人`,
    };
  }
  return {
    className: "text-emerald-600 dark:text-emerald-400",
    label: "✓ 招聘目标已达成",
  };
}

function JobSummaryCard({
  onSelect,
  row,
}: {
  onSelect: (jobId: string) => void;
  row: RecruitingLedgerJobSummary;
}) {
  const priority = row.jobPriority ? recruitingPriorityMeta[row.jobPriority] : null;
  const completion =
    row.headcount === null
      ? null
      : Math.min(100, Math.round((row.confirmed / row.headcount) * 100));
  const hasGap = row.gap !== null && row.gap > 0;
  const status = jobSummaryStatus(row);
  return (
    <button
      className={`rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        hasGap ? "border-rose-300/70 dark:border-rose-800/70" : "hover:border-primary/30"
      }`}
      onClick={() => onSelect(row.id)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{row.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{row.departmentName ?? "未设置部门"}</Badge>
            {priority ? <Badge variant={priority.variant}>{priority.label}</Badge> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasGap ? <Badge variant="danger">缺口 {row.gap}</Badge> : null}
          {row.headcount === null ? <Badge variant="outline">未设需求</Badge> : null}
          <span className="text-muted-foreground text-xs">{row.headcount ?? "—"} 人</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          ["需求", row.headcount ?? "—"],
          ["已确定", row.confirmed],
          ["推进中", row.active],
          ["缺口", row.gap ?? "—"],
        ].map(([label, value]) => (
          <div className="rounded-lg bg-muted/60 px-2 py-2" key={label}>
            <div className="font-mono font-medium tabular-nums">{value}</div>
            <div className="mt-1 text-muted-foreground text-xs">{label}</div>
          </div>
        ))}
      </div>

      {completion === null ? null : (
        <>
          <progress className="sr-only" max={100} value={completion}>
            招聘目标完成 {completion}%
          </progress>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${completion}%` }}
            />
          </div>
        </>
      )}
      <div className={`mt-3 text-xs ${status.className}`}>{status.label}</div>
      <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
        <span className="text-muted-foreground">
          权重 {row.jobWeight ?? "—"} ·{" "}
          <RecruitingPointsTooltip
            hiredCount={row.hired}
            jobPriority={row.jobPriority}
            jobWeight={row.jobWeight}
            points={row.recruitingPoints}
            trigger={
              <span className="cursor-help underline decoration-dotted underline-offset-4" />
            }
          >
            招聘积分 {row.recruitingPoints.toFixed(1)}
          </RecruitingPointsTooltip>
        </span>
        <span className="text-primary">查看候选人明细 →</span>
      </div>
    </button>
  );
}

function JobSummaryGrid({
  onSelect,
  rows,
}: {
  onSelect: (jobId: string) => void;
  rows: RecruitingLedgerJobSummary[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground text-sm">
        当前筛选条件下没有岗位数据
      </div>
    );
  }
  const groups = new Map<string, RecruitingLedgerJobSummary[]>();
  for (const row of rows) {
    const departmentName = row.departmentName ?? "未设置部门";
    groups.set(departmentName, [...(groups.get(departmentName) ?? []), row]);
  }
  return (
    <div className="space-y-5">
      <JobSummaryMetrics rows={rows} />
      {[...groups].map(([departmentName, departmentRows]) => (
        <section className="space-y-2" key={departmentName}>
          <div className="flex items-center gap-2 text-sm">
            <h2 className="font-medium">{departmentName}</h2>
            <span className="text-muted-foreground">{departmentRows.length} 个岗位</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {departmentRows.map((row) => (
              <JobSummaryCard key={row.id} onSelect={onSelect} row={row} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// oxlint-disable-next-line complexity -- read-only filters and ledger cells are composed here.
export function RecruitingLedgerPage() {
  const { slug } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = useNavigate({ from: "/w/$slug/studio/recruiting-ledger" });
  const queryClient = useQueryClient();
  const query = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchRecruitingLedger(slug, {
        boardView: search.stage,
        createdFrom: search.createdFrom,
        createdTo: search.createdTo,
        departmentIds: search.departmentId ? [search.departmentId] : undefined,
        jobDescriptionIds: search.jobDescriptionId ? [search.jobDescriptionId] : undefined,
        joiningFrom: search.joiningFrom,
        joiningTo: search.joiningTo,
        page: search.page,
        pageSize: 20,
        recommendationLevels: search.recommendationLevel ? [search.recommendationLevel] : undefined,
        responsibleHrIds: search.responsibleHrId ? [search.responsibleHrId] : undefined,
        search: search.search,
        sortBy: search.sortBy,
        sortOrder: search.sortOrder,
      }),
    queryKey: ["studio-recruiting-ledger", slug, search],
    staleTime: 15_000,
  });
  const informationSyncMutation = useMutation({
    mutationFn: ({ recordId, synced }: { recordId: string; synced: boolean }) =>
      updateRecruitingLedgerInformationSync(slug, recordId, synced),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "更新信息同步状态失败"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["studio-recruiting-ledger", slug] });
    },
  });
  const records = query.data?.records ?? [];
  const jobSummary = query.data?.jobSummary ?? [];
  const hasUnconfiguredDemand = jobSummary.some((row) => row.headcount === null);

  function updateSearch(updates: Record<string, string | number | undefined>) {
    void navigate({
      search: (previous) => ({ ...previous, ...updates, page: updates.page ?? 1 }),
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader
        actionRender={
          <Tabs
            aria-label="台账展示方式"
            onValueChange={(value) => updateSearch({ view: value })}
            value={search.view}
          >
            <TabsList>
              <TabsTrigger value="records">候选人明细</TabsTrigger>
              <TabsTrigger value="jobs">按岗位汇总</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        description="按当前招聘台阶段实时汇总候选人、AI 评价、真人面试与 Offer 信息；除信息同步标签外，其余内容只读。"
        title="招聘台账"
      />

      <RecruitingBoardTabs onChange={(stage) => updateSearch({ stage })} value={search.stage} />

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex min-w-64 flex-1 gap-2 sm:max-w-md"
            key={search.search ?? ""}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = String(form.get("search") ?? "").trim();
              updateSearch({ search: value || undefined });
            }}
          >
            <Input
              defaultValue={search.search ?? ""}
              name="search"
              placeholder="搜索候选人或岗位"
            />
            <Button aria-label="搜索" size="icon" type="submit" variant="outline">
              <IconSearch className="size-4" />
            </Button>
          </form>

          <NativeSelect
            aria-label="部门"
            onChange={(event) => updateSearch({ departmentId: event.target.value || undefined })}
            value={search.departmentId ?? ""}
          >
            <NativeSelectOption value="">全部部门</NativeSelectOption>
            {query.data?.facets.departments.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            aria-label="岗位"
            onChange={(event) =>
              updateSearch({ jobDescriptionId: event.target.value || undefined })
            }
            value={search.jobDescriptionId ?? ""}
          >
            <NativeSelectOption value="">全部岗位</NativeSelectOption>
            {query.data?.facets.jobs.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            aria-label="负责 HR"
            onChange={(event) => updateSearch({ responsibleHrId: event.target.value || undefined })}
            value={search.responsibleHrId ?? ""}
          >
            <NativeSelectOption value="">全部 HR</NativeSelectOption>
            {query.data?.facets.recruiters.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            aria-label="AI 评价"
            onChange={(event) =>
              updateSearch({ recommendationLevel: event.target.value || undefined })
            }
            value={search.recommendationLevel ?? ""}
          >
            <NativeSelectOption value="">全部 AI 评价</NativeSelectOption>
            {recruitingLedgerRecommendationOptions.map((item) => (
              <NativeSelectOption key={item.value} value={item.value}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <DateRangeFilter
            from={search.createdFrom}
            label="创建时间"
            onChange={(createdFrom, createdTo) => updateSearch({ createdFrom, createdTo })}
            to={search.createdTo}
          />

          <DateRangeFilter
            from={search.joiningFrom}
            label="入职日期"
            onChange={(joiningFrom, joiningTo) => updateSearch({ joiningFrom, joiningTo })}
            to={search.joiningTo}
          />

          {search.view === "records" ? (
            <NativeSelect
              aria-label="排序方式"
              onChange={(event) => updateSearch({ sortBy: event.target.value })}
              value={search.sortBy}
            >
              <NativeSelectOption value="createdAt">排序：创建时间</NativeSelectOption>
              <NativeSelectOption value="joiningDate">排序：入职时间</NativeSelectOption>
              <NativeSelectOption value="updatedAt">排序：更新时间</NativeSelectOption>
              <NativeSelectOption value="candidateName">排序：姓名</NativeSelectOption>
            </NativeSelect>
          ) : null}

          <Button
            aria-label="刷新台账"
            disabled={query.isFetching}
            onClick={async () => {
              await query.refetch();
            }}
            size="icon"
            variant="outline"
          >
            <IconRefresh className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          已确定包含待入职和已入职候选人；推进中不重复计算待入职候选人。
        </p>
        <p className="text-muted-foreground text-xs">
          招聘积分仅在候选人已入职后计算：岗位权重 × 优先级系数（高 1.5 / 中 1.0 / 低 0.8），保留 1
          位小数；其他状态均为 0。
        </p>
        {search.view === "jobs" && hasUnconfiguredDemand ? (
          <p className="text-muted-foreground text-xs" role="note">
            带“+”表示当前为最低已知值：部分在招岗位尚未设置需求人数，因此总需求和总缺口暂无法精确统计。
          </p>
        ) : null}

        {query.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive text-sm">
            {query.error instanceof Error ? query.error.message : "加载台账失败"}
          </div>
        ) : null}
        {!query.isError && search.view === "jobs" ? (
          <JobSummaryGrid
            onSelect={(jobId) =>
              updateSearch({ jobDescriptionId: jobId, page: 1, view: "records" })
            }
            rows={jobSummary}
          />
        ) : null}
        {!query.isError && search.view === "records" ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 min-w-32">姓名</TableHead>
                  <TableHead>岗位</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>汇报上级</TableHead>
                  <TableHead>负责 HR</TableHead>
                  <TableHead>匹配度</TableHead>
                  <TableHead>招聘进度</TableHead>
                  <TableHead>真人一面</TableHead>
                  <TableHead>真人二面</TableHead>
                  <TableHead>试用期工资</TableHead>
                  <TableHead>转正工资</TableHead>
                  <TableHead>出国工资</TableHead>
                  <TableHead>入职日期</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>招聘周期</TableHead>
                  <TableHead>招聘积分</TableHead>
                  <TableHead>信息同步</TableHead>
                  <TableHead>评价表</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length > 0 ? (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          params={{ recordId: record.id, slug }}
                          search={{}}
                          to="/w/$slug/studio/resumes/$recordId"
                        >
                          {record.candidateName}
                        </Link>
                      </TableCell>
                      <TableCell>{record.jobName ?? "—"}</TableCell>
                      <TableCell>{record.departmentName ?? "—"}</TableCell>
                      <TableCell>{record.reportingManagerName ?? "—"}</TableCell>
                      <TableCell>{record.responsibleHrName ?? "—"}</TableCell>
                      <TableCell>
                        {record.qualitativeRecommendationLevel ? (
                          <Badge
                            variant={recommendationVariant(record.qualitativeRecommendationLevel)}
                          >
                            {recommendationLabels.get(record.qualitativeRecommendationLevel)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.progressTone}>{record.progressLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <HumanRoundCell round={record.firstHumanRound} />
                      </TableCell>
                      <TableCell>
                        <HumanRoundCell round={record.secondHumanRound} />
                      </TableCell>
                      <TableCell>
                        {formatSalary(record.probationSalary, record.salaryCurrency)}
                      </TableCell>
                      <TableCell>
                        {formatSalary(record.regularSalary, record.salaryCurrency)}
                      </TableCell>
                      <TableCell>
                        {formatSalary(record.overseasSalary, record.salaryCurrency)}
                      </TableCell>
                      <TableCell>{formatDate(record.joiningDate)}</TableCell>
                      <TableCell>{formatDate(record.createdAt)}</TableCell>
                      <TableCell>{record.cycleDays} 天</TableCell>
                      <TableCell className="font-mono tabular-nums">
                        <RecruitingPointsTooltip
                          isHired={record.outcome === "hired"}
                          jobPriority={record.jobPriority}
                          jobWeight={record.jobWeight}
                          points={record.recruitingPoints}
                          trigger={
                            <button
                              aria-label="查看招聘积分计算过程"
                              className="cursor-help underline decoration-dotted underline-offset-4"
                              type="button"
                            />
                          }
                        >
                          {record.recruitingPoints.toFixed(1)}
                        </RecruitingPointsTooltip>
                      </TableCell>
                      <TableCell>
                        <Badge
                          aria-disabled={
                            informationSyncMutation.isPending &&
                            informationSyncMutation.variables?.recordId === record.id
                          }
                          aria-pressed={record.informationSyncStatus === "synced"}
                          className="cursor-pointer select-none hover:opacity-80"
                          onClick={() => {
                            if (
                              informationSyncMutation.isPending &&
                              informationSyncMutation.variables?.recordId === record.id
                            ) {
                              return;
                            }
                            informationSyncMutation.mutate({
                              recordId: record.id,
                              synced: record.informationSyncStatus !== "synced",
                            });
                          }}
                          render={
                            <button
                              aria-label={`${record.candidateName}信息同步状态：${
                                record.informationSyncStatus === "synced" ? "已同步" : "未同步"
                              }，点击切换`}
                              type="button"
                            />
                          }
                          variant={
                            record.informationSyncStatus === "synced" ? "success" : "outline"
                          }
                        >
                          {record.informationSyncStatus === "synced" ? "已同步" : "未同步"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.documentUrl ? (
                          <Button
                            nativeButton={false}
                            render={
                              <a
                                aria-label="查看面试评价表"
                                href={record.documentUrl}
                                rel="noreferrer"
                                target="_blank"
                              />
                            }
                            size="sm"
                            variant="link"
                          >
                            查看
                            <IconExternalLink className="size-3.5" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="h-32 text-center text-muted-foreground" colSpan={18}>
                      {query.isLoading ? "正在加载台账…" : "当前筛选条件下没有候选人"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {search.view === "records" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              共 {query.data?.total ?? 0} 条，第 {query.data?.page ?? search.page} /{" "}
              {Math.max(query.data?.totalPages ?? 1, 1)} 页
            </span>
            <div className="flex gap-2">
              <Button
                disabled={search.page <= 1 || query.isFetching}
                onClick={() => updateSearch({ page: Math.max(1, search.page - 1) })}
                size="sm"
                variant="outline"
              >
                上一页
              </Button>
              <Button
                disabled={
                  query.isFetching || search.page >= Math.max(query.data?.totalPages ?? 1, 1)
                }
                onClick={() => updateSearch({ page: search.page + 1 })}
                size="sm"
                variant="outline"
              >
                下一页
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
