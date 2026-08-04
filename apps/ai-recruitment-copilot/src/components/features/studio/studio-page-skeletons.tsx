import type { ReactNode } from "react";
import { DetailBodySkeleton, DetailHeaderSkeleton } from "./studio-person-detail-skeletons";
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
          className={count === 6 ? "h-12 w-full sm:w-32" : "h-9 w-full sm:w-36"}
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
    <div className="flex flex-wrap items-start gap-3">
      <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap">
        {Array.from({ length: filterCount }).map((_, index) => (
          <Skeleton
            className={index === 0 ? "h-9 min-w-0 sm:w-60" : "h-9 min-w-0 sm:w-44"}
            key={index}
          />
        ))}
      </div>
      <div className="flex min-w-fit shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <Skeleton className="size-9" />
        <Skeleton className="size-9" />
        {primaryAction ? <Skeleton className="h-9 w-28" /> : null}
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div className="min-w-[48rem]">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_5rem] gap-4 border-b bg-muted/30 px-4 py-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton className="h-3 w-4/5" key={index} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            className="grid grid-cols-[1.4fr_1fr_1fr_1fr_5rem] gap-4 border-b border-border/60 px-4 py-4 last:border-b-0"
            key={rowIndex}
          >
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SummarySkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className={
        count === 4 ? "grid grid-cols-2 gap-4 xl:grid-cols-4" : "grid gap-4 lg:grid-cols-3"
      }
    >
      {Array.from({ length: count }).map((_, index) => (
        <div className="space-y-3 rounded-xl border border-border/70 p-4" key={index}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

function ChartGridSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="overflow-hidden rounded-xl border border-border/70" key={index}>
          <div className="grid border-b sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(5.75rem,7rem))]">
            <div className="space-y-2 p-4 sm:p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36 max-w-full" />
            </div>
            {Array.from({ length: 2 }).map((__, metricIndex) => (
              <div
                className="space-y-2 border-t px-4 py-3 sm:border-t-0 sm:border-l"
                key={metricIndex}
              >
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="p-4">
            <Skeleton className="h-36 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecruitingListSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton className="h-44 w-full rounded-2xl" key={index} />
      ))}
    </div>
  );
}

function ResumePoolCardsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="flex min-h-56 flex-col gap-4 rounded-xl border p-5" key={index}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((__, lineIndex) => (
              <Skeleton className="h-3 w-4/5" key={lineIndex} />
            ))}
          </div>
          <Skeleton className="h-14 w-full" />
          <div className="mt-auto flex gap-2">
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecruitingPageSkeleton() {
  return (
    <PageShell label="招聘台">
      <HeaderSkeleton />
      <ChartGridSkeleton />
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
  filterCount = 1,
  label = "数据列表",
  summary = false,
}: {
  filterCount?: number;
  label?: string;
  summary?: boolean;
}) {
  return (
    <PageShell label={label}>
      <HeaderSkeleton />
      {summary ? <SummarySkeleton count={4} /> : null}
      <ToolbarSkeleton filterCount={filterCount} />
      <TableSkeleton />
    </PageShell>
  );
}

export function JobDescriptionsPageSkeleton() {
  return (
    <PageShell label="岗位设置">
      <HeaderSkeleton />
      <ChartGridSkeleton />
      <ToolbarSkeleton filterCount={3} />
      <TableSkeleton />
    </PageShell>
  );
}

export function DashboardPageSkeleton() {
  return (
    <PageShell label="数据看板">
      <HeaderSkeleton />
      <SummarySkeleton count={4} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </PageShell>
  );
}

export function ProfilePageSkeleton() {
  return (
    <PageShell label="个人中心">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <HeaderSkeleton />
        <div className="flex flex-col items-center gap-3 py-2">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </PageShell>
  );
}

export function MembersPageSkeleton() {
  return (
    <PageShell label="工作区管理">
      <HeaderSkeleton />
      <TabsSkeleton count={2} />
      <ToolbarSkeleton filterCount={1} />
      <TableSkeleton rows={4} />
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
