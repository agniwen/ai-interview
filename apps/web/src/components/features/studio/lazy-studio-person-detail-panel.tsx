"use client";

import { lazy, Suspense } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  DetailTitleSkeleton,
  DetailHeaderSkeleton,
  DetailBodySkeleton,
  InterviewResultFramesSkeleton,
} from "./studio-person-detail-skeletons";
import type { StudioPersonDetailPanel as StudioPersonDetailPanelType } from "./studio-person-detail-controller";

type StudioPersonDetailPanelProps = ComponentProps<typeof StudioPersonDetailPanelType>;

const StudioPersonDetailPanel = lazy(async () => {
  const detailModule = await import("./studio-person-detail-controller");
  return { default: detailModule.StudioPersonDetailPanel };
});

export function StudioPersonDetailPanelFallback({
  mode = "resume",
}: {
  mode?: "resume" | "interview";
}) {
  return (
    <output
      aria-busy="true"
      aria-label="候选人详情正在加载"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex min-w-0 flex-col gap-2 border-b">
        <DetailTitleSkeleton />
        <DetailHeaderSkeleton mode={mode} />
      </div>
      {mode === "interview" ? (
        <InterviewResultFramesSkeleton />
      ) : (
        <DetailBodySkeleton mode={mode} />
      )}
    </output>
  );
}

export function LazyStudioPersonDetailPanel({
  fallback,
  ...props
}: StudioPersonDetailPanelProps & { fallback?: ReactNode }) {
  return (
    <Suspense
      fallback={
        fallback === undefined ? <StudioPersonDetailPanelFallback mode={props.mode} /> : fallback
      }
    >
      <StudioPersonDetailPanel {...props} />
    </Suspense>
  );
}
