import {
  StudioListCardEvaluationSkeletonLines,
  StudioListCardProfileSnapshotSkeleton,
} from "@/components/features/studio/studio-list-card-evaluation";
import {
  STUDIO_LIST_CARD_ACTIONS_CELL_CLASS,
  STUDIO_LIST_CARD_BODY_GRID_CLASS,
  STUDIO_LIST_CARD_META_ROW_CLASS,
  STUDIO_LIST_CARD_PROFILE_CELL_CLASS,
  STUDIO_LIST_CARD_TITLE_ROW_CLASS,
  StudioListCardProfileStripSkeleton,
} from "@/components/features/studio/studio-list-card-profile";
import { Card, CardPanel } from "@/components/ui/card";
import { cn } from "@app/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { STUDIO_RECORD_ROW_DIVIDER_CLASS } from "@/components/features/studio/studio-date-group-virtual-list";

export function ResumePoolCardSkeleton() {
  return (
    <div
      className={cn(
        "relative h-[418px] py-1.5 md:h-[502px] xl:h-[368px]",
        STUDIO_RECORD_ROW_DIVIDER_CLASS,
      )}
      data-slot="resume-pool-card-skeleton"
    >
      <Card className="h-full overflow-hidden rounded-lg border-0 bg-transparent shadow-none">
        <CardPanel className="flex h-full min-h-0 p-4">
          <div className={STUDIO_LIST_CARD_BODY_GRID_CLASS}>
            <div className="flex min-w-0 items-center gap-3 xl:col-span-2">
              <Skeleton className="mb-2 size-12 shrink-0 rounded-full" />
              <div className={STUDIO_LIST_CARD_TITLE_ROW_CLASS}>
                <Skeleton className="h-5 w-36 max-w-full xl:basis-auto" />
                <div className="basis-full xl:hidden" />
                <Skeleton className="h-6 w-24 rounded-[8px]" />
              </div>
            </div>
            <div className="min-w-0">
              <div className={STUDIO_LIST_CARD_META_ROW_CLASS}>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="h-4 w-20" />
              </div>
              <StudioListCardProfileStripSkeleton className="mt-3 hidden md:grid xl:hidden" />
              <StudioListCardEvaluationSkeletonLines />
            </div>
            <div className={STUDIO_LIST_CARD_PROFILE_CELL_CLASS}>
              <StudioListCardProfileSnapshotSkeleton />
            </div>
            <div className={STUDIO_LIST_CARD_ACTIONS_CELL_CLASS}>
              <div className="flex items-center gap-1">
                {["w-14", "w-14", "w-16"].map((width) => (
                  <Skeleton className={cn("h-8", width)} key={width} />
                ))}
              </div>
            </div>
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}
