import type { ReactNode } from "react";
import { DetailBodySkeleton, DetailHeaderSkeleton } from "./studio-person-detail-skeletons";
import { StudioDateGroupHeaderSkeleton } from "./studio-date-group-virtual-list";
import { ResumeLibraryCardSkeleton } from "./resumes/resume-library-card-skeleton";
import { ResumeLibraryMetricsSkeleton } from "./resumes/resume-library-metrics-skeleton";
import { StudioSummaryCardsSkeleton } from "./studio-summary-cards";
import { JobDescriptionChartsSkeleton } from "./job-descriptions/job-description-charts-skeleton";
import { ProfilePageContentSkeleton } from "./profile/profile-page-skeleton";
import { DashboardPanelsSkeleton } from "./dashboard-page-skeleton";
import { DataGridContentSkeleton } from "@/components/data-grid";
import { Skeleton } from "@/components/ui/skeleton";

function PageShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <output
      aria-busy="true"
      aria-label={`${label}加载中`}
      className="mx-auto flex w-full max-w-[96rem] flex-col gap-6"
    >
      {children}
    </output>
  );
}

function HeaderSkeleton({
  action = false,
  actionFullWidth = false,
}: {
  action?: boolean;
  actionFullWidth?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {action ? <Skeleton className={actionFullWidth ? "h-9 w-full sm:w-24" : "h-9 w-24"} /> : null}
    </div>
  );
}

function TabsSkeleton({ count }: { count: 2 | 6 }) {
  return (
    <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted p-0.5 sm:flex sm:w-fit sm:flex-wrap">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          className={count === 6 ? "h-10 w-full sm:w-28" : "h-9 w-full sm:w-36"}
          key={index}
        />
      ))}
    </div>
  );
}

function ToolbarSkeleton({
  filterCount = 2,
  primaryAction = true,
}: {
  filterCount?: number;
  primaryAction?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-slot="list-toolbar-skeleton">
      {filterCount > 2 ? (
        <Skeleton className="h-9 w-28 rounded-lg" data-slot="filter-control-skeleton" />
      ) : (
        Array.from({ length: filterCount }, (_, index) => (
          <Skeleton
            className="h-9 w-full rounded-lg sm:w-60"
            data-slot="filter-control-skeleton"
            key={index}
          />
        ))
      )}
      <div
        className="flex min-w-0 flex-wrap items-center gap-2"
        data-slot="toolbar-actions-skeleton"
      >
        <Skeleton className="h-9 w-28 rounded-lg" data-slot="clear-filter-skeleton" />
        <Skeleton className="h-9 w-20 rounded-lg" data-slot="refresh-skeleton" />
        {primaryAction ? <Skeleton className="h-9 w-28 rounded-lg" /> : null}
      </div>
    </div>
  );
}

function RecruitingListSkeleton() {
  return (
    <div className="grid">
      <StudioDateGroupHeaderSkeleton />
      {Array.from({ length: 4 }).map((_, index) => (
        <ResumeLibraryCardSkeleton key={index} />
      ))}
    </div>
  );
}

function ResumePoolCardsSkeleton() {
  return (
    <div className="grid gap-3">
      <StudioDateGroupHeaderSkeleton />
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton className="h-[218px] rounded-xl max-lg:h-[246px] max-md:h-[286px]" key={index} />
      ))}
    </div>
  );
}

export function RecruitingPageSkeleton() {
  return (
    <PageShell label="招聘台">
      <HeaderSkeleton />
      <ResumeLibraryMetricsSkeleton />
      <TabsSkeleton count={6} />
      <ToolbarSkeleton filterCount={4} />
      <RecruitingListSkeleton />
    </PageShell>
  );
}

export function ResumePoolPageSkeleton() {
  return (
    <PageShell label="人才库">
      <HeaderSkeleton />
      <TabsSkeleton count={2} />
      <ToolbarSkeleton filterCount={4} />
      <ResumePoolCardsSkeleton />
    </PageShell>
  );
}

export function StudioTablePageSkeleton({
  columnCount = 5,
  filterCount = 2,
  label = "数据列表",
  summary = false,
}: {
  columnCount?: number;
  filterCount?: number;
  label?: string;
  summary?: boolean;
}) {
  return (
    <PageShell label={label}>
      <HeaderSkeleton />
      <div className="flex flex-col gap-4" data-slot="data-grid-shell-skeleton">
        {summary ? <StudioSummaryCardsSkeleton /> : null}
        <ToolbarSkeleton filterCount={filterCount} />
        <DataGridContentSkeleton columnCount={columnCount} />
      </div>
    </PageShell>
  );
}

export function JobDescriptionsPageSkeleton() {
  return (
    <PageShell label="岗位设置">
      <HeaderSkeleton />
      <JobDescriptionChartsSkeleton />
      <div className="flex flex-col gap-4" data-slot="data-grid-shell-skeleton">
        <ToolbarSkeleton filterCount={3} />
        <DataGridContentSkeleton columnCount={9} />
      </div>
    </PageShell>
  );
}

export function DashboardPageSkeleton() {
  return (
    <PageShell label="数据看板">
      <HeaderSkeleton />
      <StudioSummaryCardsSkeleton />
      <DashboardPanelsSkeleton />
    </PageShell>
  );
}

export function ProfilePageSkeleton() {
  return (
    <PageShell label="个人中心">
      <ProfilePageContentSkeleton />
    </PageShell>
  );
}

export function MembersPageSkeleton() {
  return (
    <PageShell label="工作区管理">
      <HeaderSkeleton />
      <TabsSkeleton count={2} />
      <ToolbarSkeleton filterCount={2} />
      <DataGridContentSkeleton columnCount={5} rowCount={4} />
    </PageShell>
  );
}

export function PermissionsPageSkeleton() {
  return (
    <PageShell label="权限管理">
      <HeaderSkeleton action actionFullWidth />
      <div className="overflow-hidden rounded-lg border border-border/70">
        <div className="min-w-[72rem]">
          <div className="grid grid-cols-[17rem_repeat(10,5rem)] border-b bg-muted/40">
            <div className="row-span-2 border-r p-3">
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="col-span-10 m-3 h-4 w-28 justify-self-center" />
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton className="m-3 h-3 w-12" key={index} />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, rowIndex) => (
            <div
              className="grid grid-cols-[17rem_repeat(10,5rem)] border-b last:border-b-0"
              key={rowIndex}
            >
              <div className="space-y-2 border-r p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              {Array.from({ length: 10 }).map((__, cellIndex) => (
                <div
                  className="flex items-center justify-center border-r last:border-r-0"
                  key={cellIndex}
                >
                  <Skeleton className="size-4" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export function GlobalConfigPageSkeleton() {
  return (
    <PageShell label="上下文设置">
      <HeaderSkeleton action />
      <div className="space-y-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="space-y-2" key={index}>
            <Skeleton className="h-3 w-28" />
            <Skeleton className={index < 2 ? "h-9 w-full" : "h-44 w-full"} />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function InterviewDetailPageSkeleton() {
  return (
    <PageShell label="面试详情">
      <Skeleton className="h-8 w-20" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <DetailHeaderSkeleton mode="interview" />
      <DetailBodySkeleton mode="interview" />
    </PageShell>
  );
}
