import type { ReactNode } from "react";
import { Frame, FrameHeader, FramePanel } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";

type DetailSkeletonMode = "interview" | "resume";

export function DetailTitleSkeleton({ showId = false }: { showId?: boolean }) {
  return (
    <span aria-hidden="true" className="flex min-w-0 items-center gap-3">
      <Skeleton className="size-14 shrink-0 rounded-full" />
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex items-center gap-2">
          <Skeleton className="h-7 w-28" />
          {showId ? <Skeleton className="h-4 w-24" /> : null}
        </span>
        <Skeleton className="h-4 w-36 max-w-full" />
      </span>
    </span>
  );
}

export function DetailHeaderSkeleton({ mode }: { mode: DetailSkeletonMode }) {
  return (
    <div
      aria-hidden="true"
      className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="order-2 flex min-w-0 overflow-hidden pt-1 sm:order-1 sm:flex-1">
        {["overview", "evaluation", "interview"].map((tab, index) => (
          <div
            className="relative flex h-[38px] w-[6em] shrink-0 items-center justify-center"
            key={tab}
          >
            <Skeleton className="h-4 w-12" />
            {index === 0 ? (
              <Skeleton className="absolute inset-x-0 bottom-0 h-0.5 rounded-none" />
            ) : null}
          </div>
        ))}
      </div>
      <div className="order-1 flex shrink-0 gap-2 sm:order-2 sm:pb-1.5">
        <Skeleton className="h-8 flex-1 sm:w-24 sm:flex-none" />
        {mode === "resume" ? <Skeleton className="h-8 flex-1 sm:w-24 sm:flex-none" /> : null}
      </div>
    </div>
  );
}

export function DetailBodySkeleton({ mode }: { mode: DetailSkeletonMode }) {
  return (
    <div className="flex flex-col gap-8">
      {mode === "resume" ? (
        <section className="rounded-2xl bg-muted/20 p-5">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-8 w-32" />
            </div>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="flex flex-col gap-2" key={index}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border/50 pt-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl bg-muted/20 p-5">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-5 w-24" />
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="flex flex-col gap-2" key={index}>
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="space-y-3 border-t border-border/50 pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-7 w-28" />
              </div>
              <Skeleton className="h-16 w-full" />
            </div>
          </section>
        </>
      )}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>
    </div>
  );
}

export function FormsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="border-t border-border/50 pt-5" key={index}>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-8/12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InterviewResultOverviewSkeleton() {
  return (
    <Frame className="h-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-6 w-20" />
      </FrameHeader>
      <FramePanel className="flex-1">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="min-w-0" key={index}>
              <Skeleton className="h-3 w-12" />
              <Skeleton className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-2 border-border/50 border-t pt-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </FramePanel>
    </Frame>
  );
}

export function InterviewResultFramesSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <InterviewResultOverviewSkeleton />
      {["候选人信息", "表单题", "沟通题"].map((title) => (
        <Frame className="h-full" key={title}>
          <FrameHeader className="flex-row items-center justify-between gap-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-6 w-16" />
          </FrameHeader>
          <FramePanel className="flex min-h-48 flex-col gap-3">
            <Skeleton className="h-4 w-5/12" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-9/12" />
            <Skeleton className="h-4 w-7/12" />
          </FramePanel>
        </Frame>
      ))}
    </div>
  );
}

export function SummaryMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate font-medium text-sm leading-6">{value}</p>
    </div>
  );
}
