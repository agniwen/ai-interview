"use client";

import type { RecruitingBoardView } from "@app/shared/recruiting-board";
import { summarizeActiveRecruitingJobs } from "@app/shared/studio-recruiting-ledger";
import type { RecruitingLedgerJobSummary } from "@app/shared/studio-recruiting-ledger";
import {
  RecruitingPointsTooltip,
  recruitingPriorityMeta,
} from "@/components/features/studio/recruiting-ledger/recruiting-points-tooltip";
import { Badge } from "@/components/ui/badge";

const jobProcessStages = [
  { key: "screening", label: "筛选", view: "screening:all" },
  { key: "interview", label: "面试", view: "interview:all" },
  { key: "offer", label: "Offer", view: "offer:all" },
  { key: "onboarding", label: "待入职", view: "onboarding:all" },
  { key: "closed", label: "已结束", view: "closed:all" },
] as const satisfies readonly {
  key: keyof RecruitingLedgerJobSummary["processDistribution"];
  label: string;
  view: RecruitingBoardView;
}[];

function JobSummaryMetrics({ rows }: { rows: RecruitingLedgerJobSummary[] }) {
  const summary = summarizeActiveRecruitingJobs(rows);
  const hasUnconfiguredDemand = summary.unconfiguredJobs > 0;
  const formatIncompleteTotal = (value: number) => {
    if (summary.configuredJobs === 0 && summary.activeJobs > 0) {
      return "—";
    }
    return hasUnconfiguredDemand ? `${value}+` : value;
  };
  const metrics = [
    { className: "", label: "在招岗位", value: summary.activeJobs },
    { className: "", label: "总需求", value: formatIncompleteTotal(summary.totalDemand) },
    { className: "text-emerald-600", label: "已确定", value: summary.confirmed },
    { className: "text-rose-600", label: "总缺口", value: formatIncompleteTotal(summary.totalGap) },
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
  if (row.recruitingStatus === "paused") {
    return {
      className: "text-amber-600 dark:text-amber-400",
      label: "已暂停招聘，存量候选人继续推进",
    };
  }
  if (row.recruitingStatus === "stopped") {
    return { className: "text-muted-foreground", label: "已停止招聘" };
  }
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
  onSelectStage,
  row,
}: {
  onSelect: (jobId: string) => void;
  onSelectStage: (jobId: string, stage: RecruitingBoardView) => void;
  row: RecruitingLedgerJobSummary;
}) {
  const priority = row.jobPriority ? recruitingPriorityMeta[row.jobPriority] : null;
  const completion =
    row.headcount === null
      ? null
      : Math.min(100, Math.round((row.confirmed / row.headcount) * 100));
  const hasGap = row.recruitingStatus === "active" && row.gap !== null && row.gap > 0;
  const status = jobSummaryStatus(row);
  const recruitingStatus = {
    active: { label: "招聘中", variant: "success" },
    paused: { label: "已暂停", variant: "warning" },
    stopped: { label: "已停止", variant: "secondary" },
  } as const;
  return (
    <article
      className={`rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/20 ${
        hasGap ? "border-rose-300/70 dark:border-rose-800/70" : "hover:border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{row.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{row.departmentName ?? "未设置部门"}</Badge>
            {priority ? <Badge variant={priority.variant}>{priority.label}</Badge> : null}
            <Badge variant={recruitingStatus[row.recruitingStatus].variant}>
              {recruitingStatus[row.recruitingStatus].label}
            </Badge>
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
      <div className="mt-3 border-t pt-3">
        <div className="mb-2 text-muted-foreground text-xs">流程分布</div>
        <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs">
          {jobProcessStages.map((stage) => (
            <button
              aria-label={`查看${row.name}的${stage.label}候选人，共 ${row.processDistribution[stage.key]} 人`}
              className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              key={stage.key}
              onClick={() => onSelectStage(row.id, stage.view)}
              type="button"
            >
              {stage.label} <span className="font-mono">{row.processDistribution[stage.key]}</span>
            </button>
          ))}
        </div>
      </div>
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
        <button
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => onSelect(row.id)}
          type="button"
        >
          查看全部候选人 →
        </button>
      </div>
    </article>
  );
}

export function JobSummaryGrid({
  onSelect,
  onSelectStage,
  rows,
}: {
  onSelect: (jobId: string) => void;
  onSelectStage: (jobId: string, stage: RecruitingBoardView) => void;
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
              <JobSummaryCard
                key={row.id}
                onSelect={onSelect}
                onSelectStage={onSelectStage}
                row={row}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
