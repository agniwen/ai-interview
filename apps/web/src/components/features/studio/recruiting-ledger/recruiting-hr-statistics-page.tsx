"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { IconHelpCircle, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { hrStatisticStages, hrStatisticToday } from "@app/shared/recruiting-hr-statistics";
import type {
  HrStatisticEntry,
  HrStatisticPeriod,
  HrStatisticStage,
} from "@app/shared/recruiting-hr-statistics";
import { RecruitingLedgerMultiFilters } from "./recruiting-ledger-multi-filters";
import { DatePicker } from "@/components/date-time-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchHrStatistics } from "@/lib/client/api";

const routeApi = getRouteApi("/w/$slug/studio/recruiting-ledger");
const stageNames = {
  ai_interview: "AI 初面",
  final_interview: "终试",
  hired: "已入职",
  offer_negotiation: "Offer协商",
  pending_onboarding: "待入职",
  resumes: "新增简历数",
  screening: "简历筛选",
  second_interview: "复试",
} satisfies Record<HrStatisticStage, string>;
const stageDescriptions = {
  ai_interview: "招聘记录首次进入 AI 初面；与人工复面分别统计。",
  final_interview: "招聘记录首次进入终试。",
  hired: "按已确认的实际入职日期统计。",
  offer_negotiation: "首次进入流水提供、谈薪、发 Offer、背调任一节点，只计一次。",
  pending_onboarding: "招聘记录首次进入待入职，统计进入事件而非当前待入职存量。",
  resumes: "本期首次成功入库的简历条目数，更新或重复导入不累计。",
  screening:
    "招聘记录首次进入简历筛选，比率除以同期新增简历数。迁移旧记录缺少可核验的进入时间时不计入。",
  second_interview: "招聘记录首次进入复试。",
} satisfies Record<HrStatisticStage, string>;
const periods: { label: string; value: HrStatisticPeriod }[] = [
  { label: "本周", value: "week" },
  { label: "上周", value: "last_week" },
  { label: "本月", value: "month" },
  { label: "上月", value: "last_month" },
  { label: "本季度", value: "quarter" },
  { label: "上季度", value: "last_quarter" },
];

function Help({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`${label}说明`}
            className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
            type="button"
          />
        }
      >
        <IconHelpCircle className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{text}</TooltipContent>
    </Tooltip>
  );
}

function ratio(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function change(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function windowLabel(value: { end: string; from: string; to: string }): string {
  const nextDay = new Date(`${value.to}T00:00:00+08:00`).getTime() + 86_400_000;
  if (new Date(value.end).getTime() >= nextDay) {
    return `${value.from} 至 ${value.to}`;
  }
  const cutoff = new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(new Date(value.end));
  return `${value.from} 至 ${cutoff}`;
}

interface DetailSelection {
  hrId: string | null | undefined;
  metric: HrStatisticStage;
  period: "current" | "previous";
  ratio: boolean;
}

function Details({
  entries,
  jobs,
  onOpenChange,
  recruiters,
  selection,
  slug,
}: {
  entries: HrStatisticEntry[];
  jobs: { id: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  recruiters: { id: string; label: string }[];
  selection: DetailSelection | null;
  slug: string;
}) {
  const jobNames = new Map(jobs.map((job) => [job.id, job.label]));
  const recruiterNames = new Map(recruiters.map((recruiter) => [recruiter.id, recruiter.label]));
  const metricIndex = selection ? hrStatisticStages.indexOf(selection.metric) : -1;
  const matched = (metric: HrStatisticStage) =>
    entries.filter(
      (entry) =>
        entry.metric === metric && (selection?.hrId === undefined || entry.hrId === selection.hrId),
    );
  const groups = selection
    ? [
        { label: "分子", metric: selection.metric },
        ...(selection.ratio && metricIndex > 0
          ? [{ label: "分母", metric: hrStatisticStages[metricIndex - 1] }]
          : []),
      ]
    : [];
  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(selection)}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {selection
              ? `${stageNames[selection.metric]}${selection.ratio ? "阶段比率" : "数量"}明细`
              : "明细"}
          </DialogTitle>
          <DialogDescription>
            按{selection?.period === "previous" ? "上期" : "本期"}
            首次进入时间列示；比率分别展示分子与分母。
          </DialogDescription>
        </DialogHeader>
        {groups.map(({ label, metric }) => {
          const rows = matched(metric);
          return (
            <section className="space-y-2" key={label}>
              <h3 className="text-sm font-medium">
                {selection?.ratio ? `${label} · ` : ""}
                {stageNames[metric]}（{rows.length}）
              </h3>
              {rows.length ? (
                <div className="max-h-60 overflow-y-auto rounded-md border">
                  {rows.map((entry) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                      key={`${metric}-${entry.id}`}
                    >
                      {entry.recordId ? (
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          params={{ recordId: entry.recordId, slug }}
                          search={{}}
                          to="/w/$slug/studio/resumes/$recordId"
                        >
                          {entry.candidateName}
                        </Link>
                      ) : (
                        <span>{entry.candidateName}</span>
                      )}
                      <div className="text-right text-muted-foreground text-xs">
                        <div>
                          {new Date(entry.at).toLocaleString("zh-CN", {
                            timeZone: "Asia/Shanghai",
                          })}
                        </div>
                        <div>
                          HR：{entry.hrId ? (recruiterNames.get(entry.hrId) ?? "未知") : "未分配"}
                          {entry.jobId ? ` · 岗位：${jobNames.get(entry.jobId) ?? "未知"}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">没有明细</p>
              )}
            </section>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}

// oxlint-disable-next-line complexity -- one page composes period controls, filters, two tables and drill-downs.
export function RecruitingHrStatisticsPage() {
  const today = hrStatisticToday();
  const { slug } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = useNavigate({ from: "/w/$slug/studio/recruiting-ledger" });
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(search.hrFrom ?? "");
  const [draftTo, setDraftTo] = useState(search.hrTo ?? "");
  const hasRange = search.hrPeriod !== "custom" || Boolean(search.hrFrom && search.hrTo);
  const query = useQuery({
    enabled: hasRange,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchHrStatistics(slug, {
        departmentIds: search.departmentId,
        from: search.hrFrom,
        jobIds: search.jobDescriptionId,
        period: search.hrPeriod,
        responsibleHrIds: search.responsibleHrId,
        to: search.hrTo,
      }),
    queryKey: [
      "studio-recruiting-hr-statistics",
      slug,
      search.hrPeriod,
      search.hrFrom,
      search.hrTo,
      search.departmentId,
      search.jobDescriptionId,
      search.responsibleHrId,
    ],
    staleTime: 15_000,
  });
  const { data } = query;
  const update = (values: Record<string, string | string[] | undefined>) => {
    void navigate({ search: (previous) => ({ ...previous, ...values }) });
  };
  const openRangePicker = () => {
    setDraftFrom(search.hrFrom ?? data?.current.from ?? "");
    setDraftTo(search.hrTo ?? data?.current.to ?? "");
    setRangeOpen(true);
  };
  const countButton = (count: number, metric: HrStatisticStage, hrId?: string | null) => (
    <button
      className="font-medium tabular-nums underline-offset-4 hover:underline"
      onClick={() => setSelection({ hrId, metric, period: "current", ratio: false })}
      type="button"
    >
      {count}
    </button>
  );
  const ratioButton = (
    value: number | null,
    metric: HrStatisticStage,
    hrId?: string | null,
    period: "current" | "previous" = "current",
  ) =>
    value === null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <button
        className="tabular-nums text-primary underline-offset-4 hover:underline"
        onClick={() => setSelection({ hrId, metric, period, ratio: true })}
        type="button"
      >
        {ratio(value)}
      </button>
    );
  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {periods.map((period) => (
              <Button
                key={period.value}
                onClick={() =>
                  update({ hrFrom: undefined, hrPeriod: period.value, hrTo: undefined })
                }
                size="sm"
                variant={search.hrPeriod === period.value ? "secondary" : "outline"}
              >
                {period.label}
              </Button>
            ))}
            <Popover
              onOpenChange={(open) => (open ? openRangePicker() : setRangeOpen(false))}
              open={rangeOpen}
            >
              <PopoverTrigger
                render={
                  <Button
                    size="sm"
                    variant={search.hrPeriod === "custom" ? "secondary" : "outline"}
                  />
                }
              >
                自定义
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <div className="flex flex-col gap-4">
                  <PopoverHeader>
                    <PopoverTitle>选择统计时间</PopoverTitle>
                    <PopoverDescription>选择开始和结束日期，应用后更新统计。</PopoverDescription>
                  </PopoverHeader>
                  <FieldGroup className="gap-4">
                    <Field>
                      <FieldLabel htmlFor="hr-statistics-from">开始日期</FieldLabel>
                      <DatePicker
                        id="hr-statistics-from"
                        max={draftTo && draftTo < today ? draftTo : today}
                        onValueChange={setDraftFrom}
                        value={draftFrom}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="hr-statistics-to">结束日期</FieldLabel>
                      <DatePicker
                        id="hr-statistics-to"
                        min={draftFrom || undefined}
                        onValueChange={setDraftTo}
                        value={draftTo}
                      />
                    </Field>
                  </FieldGroup>
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => setRangeOpen(false)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      取消
                    </Button>
                    <Button
                      disabled={
                        !(draftFrom && draftTo && draftFrom <= draftTo && draftFrom <= today)
                      }
                      onClick={() => {
                        update({ hrFrom: draftFrom, hrPeriod: "custom", hrTo: draftTo });
                        setRangeOpen(false);
                      }}
                      size="sm"
                      type="button"
                    >
                      应用
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RecruitingLedgerMultiFilters
              departments={data?.facets.departments ?? []}
              filterKeys={["departmentId", "jobDescriptionId", "responsibleHrId"]}
              jobs={data?.facets.jobs ?? []}
              mode="records"
              onChange={(key, value) => update({ [key]: value })}
              recruiters={data?.facets.recruiters ?? []}
              value={{
                departmentId: search.departmentId,
                jobDescriptionId: search.jobDescriptionId,
                responsibleHrId: search.responsibleHrId,
              }}
            />
            <Button
              aria-label="刷新 HR 统计"
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
        </div>
        {data ? (
          <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-sm">
            本期：{windowLabel(data.current)}　对比：{windowLabel(data.previous)}
            {data.comparison === "same_progress" ? "（按相同进度）" : ""}
            {query.isPlaceholderData ? "　正在更新统计…" : ""}
            <Help
              label="对比时间"
              text="完整自然周、月、季度分别对比前一个自然周、月、季度；进行中的周期按相同进度比较，其他自定义范围对比紧邻的等长区间。"
            />
          </p>
        ) : null}
        {query.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {query.error instanceof Error ? query.error.message : "加载 HR 统计失败"}
          </p>
        ) : null}
        {hasRange ? null : (
          <p className="text-muted-foreground text-sm">请选择开始和结束日期后应用。</p>
        )}
        {hasRange && query.isPending ? (
          <p className="text-muted-foreground text-sm">正在加载统计…</p>
        ) : null}
        {data ? (
          <>
            <section className="space-y-2" aria-label="团队汇总">
              <h2 className="font-semibold text-base">
                {data.limitedVisibility ? "可见范围合计" : "团队汇总"}
              </h2>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>指标／阶段</TableHead>
                      <TableHead className="text-right">
                        本期数量
                        <Help
                          label="本期数量"
                          text="新增简历按首次入库时间计数；其他阶段按招聘记录首次进入该阶段的时间计数，重复进入不累计。"
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        阶段比率
                        <Help
                          label="阶段比率"
                          text="简历筛选次数除以同期新增简历数；其他阶段次数除以同期上一阶段次数。"
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        上期阶段比率
                        <Help label="上期阶段比率" text="在上期范围内独立计算相同的阶段比率。" />
                      </TableHead>
                      <TableHead className="text-right">
                        变化（百分点）
                        <Help label="变化" text="本期阶段比率减去上期阶段比率，单位为百分点。" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.team.map((row) => (
                      <TableRow key={row.stage}>
                        <TableCell className="font-medium">
                          {stageNames[row.stage]}
                          <Help label={stageNames[row.stage]} text={stageDescriptions[row.stage]} />
                        </TableCell>
                        <TableCell className="text-right">
                          {countButton(row.count, row.stage)}
                        </TableCell>
                        <TableCell className="text-right">
                          {ratioButton(row.ratio, row.stage)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ratioButton(row.previousRatio, row.stage, undefined, "previous")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {change(row.change)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
            <section className="space-y-2" aria-label="HR 明细">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-base">HR 明细</h2>
                <p className="text-muted-foreground text-xs">
                  上行：数量
                  <Help label="数量" text="本期首次入库或首次进入阶段的数量。" />
                  　下行：阶段比率
                  <Help
                    label="HR 阶段比率"
                    text="用该 HR 本期相邻两项的数量计算；新增简历数不计算比率。"
                  />
                </p>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[1040px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-20 bg-background">负责 HR</TableHead>
                      {hrStatisticStages.map((stage) => (
                        <TableHead className="text-right" key={stage}>
                          {stageNames[stage]}
                          <Help label={stageNames[stage]} text={stageDescriptions[stage]} />
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      ...data.hr,
                      {
                        counts: data.team.map((row) => row.count),
                        hrId: undefined,
                        name: data.limitedVisibility ? "可见范围合计" : "团队合计",
                        ratios: data.team.map((row) => row.ratio),
                      },
                    ].map((row) => (
                      <TableRow key={row.hrId ?? row.name}>
                        <TableCell className="sticky left-0 z-10 bg-background font-medium">
                          {row.name}
                        </TableCell>
                        {hrStatisticStages.map((stage, index) => (
                          <TableCell className="text-right" key={stage}>
                            <div>{countButton(row.counts[index], stage, row.hrId)}</div>
                            <div className="text-xs">
                              {index === 0 ? null : ratioButton(row.ratios[index], stage, row.hrId)}
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-muted-foreground text-xs">
                旧数据缺少进入时负责人记录的，按当前负责 HR
                回填；发生过转交时历史归属可能变化。旧事件缺岗位／部门快照时按当前关联筛选。迁移旧记录缺少可核验的阶段进入时间时不计入。跨期阶段比率可能超过
                100%。
              </p>
            </section>
          </>
        ) : null}
        <Details
          entries={
            selection?.period === "previous" ? (data?.previousDetails ?? []) : (data?.details ?? [])
          }
          jobs={data?.facets.jobs ?? []}
          onOpenChange={(open) => {
            if (!open) {
              setSelection(null);
            }
          }}
          recruiters={data?.facets.recruiters ?? []}
          selection={selection}
          slug={slug}
        />
      </div>
    </TooltipProvider>
  );
}
