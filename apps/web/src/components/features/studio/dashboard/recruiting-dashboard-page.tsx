"use client";

import {
  IconAlertTriangle,
  IconArrowRight,
  IconBriefcase,
  IconChartFunnel,
  IconCircleCheck,
  IconCircleX,
  IconFileDescription,
  IconInfoCircle,
  IconUsers,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type {
  DashboardActionSeverity,
  RecruitingDashboardMetrics,
} from "@app/shared/studio-dashboard";
import { cn } from "@app/shared/utils";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";
import { PageHeader } from "@/components/features/studio/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardActivityCard } from "./dashboard-activity-card";
import { DASHBOARD_COLORS } from "./dashboard-colors";
import { DashboardMetricDefinitionsDialog } from "./dashboard-metric-definitions-dialog";
import { getDashboardFunnelRows } from "./dashboard-funnel";
import { getDashboardJobSearch, getDashboardResumeSearch } from "./dashboard-navigation";
import {
  getRecruiterDisplayRows,
  getVacancyMetric,
  sortVisibleDashboardActions,
} from "./dashboard-presentation";

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatPercent(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "0%";
}

function MetricCard({
  accent,
  description,
  icon: Icon,
  label,
  search,
  slug,
  target,
  value,
}: {
  accent: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  search?: SearchParamsRecord;
  slug: string;
  target: "jobs" | "resumes";
  value: string;
}) {
  const card = (
    <Card className="h-full transition-colors hover:border-primary/30 hover:bg-muted/20">
      <CardContent className="flex min-h-28 flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-3">
          <span className={cn("flex size-8 items-center justify-center rounded-lg", accent)}>
            <Icon className="size-4" />
          </span>
          <IconArrowRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
        </div>
        <div className="mt-4">
          <div className="font-mono font-semibold text-2xl leading-none tabular-nums">{value}</div>
          <div className="mt-2 min-w-0">
            <span className="block truncate font-medium text-sm">{label}</span>
            <span className="mt-1 block truncate text-muted-foreground text-xs">{description}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  const className =
    "group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return target === "resumes" ? (
    <Link className={className} params={{ slug }} search={search} to="/w/$slug/studio/resumes">
      {card}
    </Link>
  ) : (
    <Link className={className} params={{ slug }} to="/w/$slug/studio/job-descriptions">
      {card}
    </Link>
  );
}

function FunnelCard({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const total = metrics.cumulativeFunnel.resumesAdded;
  const rows = getDashboardFunnelRows(metrics.cumulativeFunnel);
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">转化漏斗</CardTitle>
            <p className="mt-1 text-muted-foreground text-xs">
              累计到达人数；右侧为本环节人数 ÷ 上一环节人数
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs">
            不含已归档
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5">
        {rows.map((stage) => {
          const stageCount = stage.count;
          const width =
            total > 0 ? Math.max((stageCount / total) * 100, stageCount > 0 ? 3 : 0) : 0;
          return (
            <div
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem_3rem] items-center gap-2 sm:grid-cols-[5rem_minmax(0,1fr)_3rem_3.5rem] sm:gap-3"
              key={stage.key}
            >
              <span className="text-sm">{stage.label}</span>
              <div className="h-7 overflow-hidden rounded-md bg-muted/70">
                <div
                  className={cn("h-full rounded-md", stage.color)}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-right font-mono font-medium text-sm tabular-nums">
                {formatNumber(stageCount)}
              </span>
              <span
                className="text-right text-muted-foreground text-xs tabular-nums"
                title={`${formatNumber(stageCount)} ÷ ${formatNumber(stage.conversionBase)}`}
              >
                {stage.conversion}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function actionCountClassName(severity: DashboardActionSeverity) {
  if (severity === "danger") {
    return "bg-destructive/10 text-destructive";
  }
  if (severity === "warning") {
    return "bg-warning/10 text-warning-foreground";
  }
  return "bg-info/10 text-info-foreground";
}

function RiskCard({ metrics, slug }: { metrics: RecruitingDashboardMetrics; slug: string }) {
  const actions = sortVisibleDashboardActions(metrics.actions);
  const gaps = metrics.vacancies.filter((row) => row.gap > 0).slice(0, 3);
  const vacancyMetric = getVacancyMetric(metrics.summary);
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">风险与待办</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5">
        <section>
          <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
            <IconAlertTriangle className="size-4 text-warning-foreground" />
            招聘待办
          </div>
          <div className="-mx-2 flex flex-col gap-1">
            {actions.length > 0 ? (
              actions.map((item) => {
                const content = (
                  <>
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      <span className="mt-0.5 block text-muted-foreground text-xs">
                        {item.description}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 font-mono font-medium text-xs tabular-nums",
                        actionCountClassName(item.severity),
                      )}
                    >
                      {item.count}
                    </span>
                  </>
                );
                const className =
                  "flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm";
                return item.key === "notification_failed" ? (
                  <div className={className} key={item.key}>
                    {content}
                  </div>
                ) : (
                  <Link
                    className={`${className} transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                    key={item.key}
                    params={{ slug }}
                    search={getDashboardResumeSearch(item.key)}
                    to="/w/$slug/studio/resumes"
                  >
                    {content}
                  </Link>
                );
              })
            ) : (
              <div className="px-2 py-4 text-muted-foreground text-sm">暂无招聘待办</div>
            )}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
            <IconBriefcase className="size-4 text-warning-foreground" />
            岗位缺口
          </div>
          <div className="-mx-2 flex flex-col gap-1">
            {gaps.length > 0 ? (
              gaps.map((job) => (
                <Link
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={job.id}
                  params={{ slug }}
                  search={getDashboardJobSearch(job.id)}
                  to="/w/$slug/studio/job-descriptions"
                >
                  <span className="min-w-0">
                    <span className="block leading-relaxed wrap-anywhere">{job.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {job.departmentName ?? "未设置部门"}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-warning-foreground text-xs">
                    缺口 {job.gap}
                  </span>
                </Link>
              ))
            ) : (
              <div className="px-2 py-4 text-muted-foreground text-sm">
                {metrics.summary.unconfiguredHeadcount > 0 ? "缺口数据待完善" : "暂无岗位缺口"}
              </div>
            )}
          </div>
          {metrics.summary.unconfiguredHeadcount > 0 ? (
            <p className="mt-2 text-muted-foreground text-xs">{vacancyMetric.description}</p>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

function RecruiterProgressCard({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const rows = getRecruiterDisplayRows(metrics.recruiterProgress);
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">HR 招聘进展</CardTitle>
            <p className="mt-1 text-muted-foreground text-xs">按招聘记录创建人汇总</p>
          </div>
          <IconUsers className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table aria-label="HR 招聘进展" className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/30 text-muted-foreground text-xs">
            <tr>
              <th className="px-5 py-3 text-left font-medium">创建人 HR</th>
              <th className="px-4 py-3 text-right font-medium">招聘记录数</th>
              <th className="px-4 py-3 text-right font-medium">面试中</th>
              <th className="px-4 py-3 text-right font-medium">Offer／待入职</th>
              <th className="px-5 py-3 text-right font-medium">已入职</th>
              <th className="px-5 py-3 text-right font-medium">待处理候选人</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr
                  className="transition-colors hover:bg-muted/20"
                  key={row.userId ?? "unassigned"}
                >
                  <td aria-label={`创建人 ${row.userName}`} className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar label={row.userName} seed={row.userId ?? undefined} size="sm">
                        {row.userImage ? (
                          <AvatarImage alt={row.userName} src={row.userImage} />
                        ) : null}
                        <AvatarFallback>{row.userName.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.userName}</span>
                        {row.accountHint ? (
                          <span className="block truncate text-muted-foreground text-xs">
                            {row.accountHint}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  {[
                    row.total,
                    row.interviewing,
                    row.offerOnboarding,
                    row.hired,
                    row.pendingActions ?? 0,
                  ].map((value, index) => (
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums" key={index}>
                      {formatNumber(value)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>
                  暂无创建人数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ResultsCard({ metrics }: { metrics: RecruitingDashboardMetrics }) {
  const aiTotal =
    metrics.resume.conversion.withInterview + metrics.resume.conversion.withoutInterview;
  const offerTotal = metrics.offerStatuses.reduce((sum, row) => sum + row.count, 0);
  const acceptedOffers = metrics.offerStatuses.find((row) => row.status === "accepted")?.count ?? 0;
  const rows = [
    {
      label: "AI 发起率",
      value: formatPercent(metrics.resume.conversion.withInterview, aiTotal),
    },
    { label: "AI 完成", value: formatNumber(metrics.summary.aiCompleted30d) },
    { label: "Offer 发出", value: formatNumber(metrics.summary.offersSent30d) },
  ];
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">AI 与 Offer 效果</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-5">
        <div className="grid grid-cols-3 gap-4">
          {rows.map((row) => (
            <div className="min-w-0" key={row.label}>
              <div className="truncate text-muted-foreground text-xs">{row.label}</div>
              <div className="mt-2 font-mono font-semibold text-xl tabular-nums">{row.value}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Offer 状态</span>
            <span className="text-muted-foreground text-xs">共 {offerTotal} 个</span>
          </div>
          <div className="pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <IconCircleCheck className="size-4 text-success-foreground" />
                已接受
              </span>
              <span className="font-mono font-semibold tabular-nums">{acceptedOffers}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", DASHBOARD_COLORS.hired.background)}
                style={{ width: formatPercent(acceptedOffers, offerTotal) }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecruitingDashboardPage({
  metrics,
  slug,
}: {
  metrics: RecruitingDashboardMetrics;
  slug: string;
}) {
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  const vacancyMetric = getVacancyMetric(metrics.summary);
  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 md:gap-6">
      <PageHeader
        actionRender={
          <Button onClick={() => setDefinitionsOpen(true)} size="sm" variant="outline">
            <IconInfoCircle />
            指标说明
          </Button>
        }
        title="数据看板"
      />
      <div className="-mt-3 text-muted-foreground text-sm">整体招聘进展与风险预警</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          accent={DASHBOARD_COLORS.resumes.accent}
          description="招聘中"
          icon={IconBriefcase}
          label="在招岗位"
          slug={slug}
          target="jobs"
          value={formatNumber(metrics.summary.activeJobs)}
        />
        <MetricCard
          accent={DASHBOARD_COLORS.ai.accent}
          description="招聘流程中"
          icon={IconUsers}
          label="推进中"
          search={getDashboardResumeSearch("progressing")}
          slug={slug}
          target="resumes"
          value={formatNumber(metrics.summary.progressing)}
        />
        <MetricCard
          accent={DASHBOARD_COLORS.offer.accent}
          description="定薪至入职"
          icon={IconFileDescription}
          label="Offer／待入职"
          search={getDashboardResumeSearch("offer_onboarding")}
          slug={slug}
          target="resumes"
          value={formatNumber(metrics.summary.offerOnboarding)}
        />
        <MetricCard
          accent={DASHBOARD_COLORS.hired.accent}
          description="累计"
          icon={IconCircleCheck}
          label="已入职"
          search={getDashboardResumeSearch("hired")}
          slug={slug}
          target="resumes"
          value={formatNumber(metrics.summary.hired)}
        />
        <MetricCard
          accent="bg-destructive/10 text-destructive"
          description="淘汰或撤回"
          icon={IconCircleX}
          label="负向结案"
          search={getDashboardResumeSearch("negative_closed")}
          slug={slug}
          target="resumes"
          value={formatNumber(metrics.summary.negativeClosed)}
        />
        <MetricCard
          accent="bg-warning/10 text-warning-foreground"
          description={vacancyMetric.description}
          icon={IconChartFunnel}
          label="岗位缺口"
          slug={slug}
          target="jobs"
          value={vacancyMetric.value}
        />
      </div>
      <FunnelCard metrics={metrics} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RiskCard metrics={metrics} slug={slug} />
        <ResultsCard metrics={metrics} />
      </div>
      <RecruiterProgressCard metrics={metrics} />
      <DashboardActivityCard activity={metrics.activity} />
      <DashboardMetricDefinitionsDialog open={definitionsOpen} onOpenChange={setDefinitionsOpen} />
    </div>
  );
}
