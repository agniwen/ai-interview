"use client";

import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudioPersonDetailPanel as StudioPersonDetailPanelType } from "./studio-person-detail-controller";

type StudioPersonDetailPanelProps = ComponentProps<typeof StudioPersonDetailPanelType>;

const StudioPersonDetailPanel = lazy(async () => {
  const detailModule = await import("./studio-person-detail-controller");
  return { default: detailModule.StudioPersonDetailPanel };
});

function StudioPersonDetailPanelFallback() {
  return (
    <output aria-busy="true" aria-label="候选人详情正在加载" className="block space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </output>
  );
}

export function LazyStudioPersonDetailPanel(props: StudioPersonDetailPanelProps) {
  return (
    <Suspense fallback={<StudioPersonDetailPanelFallback />}>
      <StudioPersonDetailPanel {...props} />
    </Suspense>
  );
}
