import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type DetailSkeletonMode = "interview" | "resume";

export function DetailHeaderSkeleton({ mode }: { mode: DetailSkeletonMode }) {
  return (
    <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full gap-2 sm:w-auto">
        <Skeleton className="h-9 flex-1 sm:w-20 sm:flex-none" />
        {mode === "interview" ? (
          <>
            <Skeleton className="h-9 flex-1 sm:w-24 sm:flex-none" />
            <Skeleton className="h-9 flex-1 sm:w-20 sm:flex-none" />
          </>
        ) : (
          <Skeleton className="h-9 flex-1 sm:w-24 sm:flex-none" />
        )}
      </div>
      <Skeleton className="h-9 w-full sm:w-28" />
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

export function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="min-w-0" key={index}>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-12" />
            </div>
          </div>
        ))}
      </div>
      <section className="rounded-2xl bg-muted/20 px-5 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-xl bg-background/70" />
            <Skeleton className="h-48 w-full rounded-xl bg-background/70" />
          </div>
        </div>
      </section>
    </div>
  );
}

export function RoundsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="rounded-xl bg-muted/30 px-4 py-3" key={index}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-12 w-full" />
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </div>
      ))}
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
    <div className="h-full rounded-2xl  p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="min-w-0" key={index}>
            <Skeleton className="h-3 w-12" />
            <Skeleton className="mt-2 h-5 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-2 border-border/50 border-t pt-5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
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
