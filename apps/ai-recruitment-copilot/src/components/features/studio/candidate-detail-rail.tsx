"use client";

import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { CandidateTimelineResponse } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandidateCareerSummary } from "./candidate-career-summary";
import { CandidateTimeline } from "./candidate-timeline";

export function CandidateDetailRailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex max-w-full flex-col gap-4", className)} aria-hidden="true">
      <div className="grid grid-cols-2 gap-1">
        <div className="flex flex-col items-center gap-2 pt-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-0.5 w-full" />
        </div>
        <div className="flex items-start justify-center pt-2">
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      {[3, 2].map((rows, sectionIndex) => (
        <section className="flex flex-col gap-3" key={sectionIndex}>
          <Skeleton className="h-5 w-20" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div className="flex min-w-0 flex-col gap-2" key={rowIndex}>
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function CandidateDetailRail({
  className,
  isTimelineLoading,
  onWorkExperienceSelect,
  profile,
  timeline,
  useInternalScroll,
}: {
  className?: string;
  isTimelineLoading: boolean;
  onWorkExperienceSelect: (companyName: string) => void;
  profile: ResumeProfile | null;
  timeline: CandidateTimelineResponse | null | undefined;
  useInternalScroll: boolean;
}) {
  return (
    <Tabs
      className={cn("max-w-full gap-4", useInternalScroll && "xl:h-full xl:min-h-0", className)}
      defaultValue="career-summary"
    >
      <TabsList className="w-full" variant="underline">
        <TabsTrigger className="flex-1" value="career-summary">
          履历概要
        </TabsTrigger>
        <TabsTrigger className="flex-1" value="activity">
          活动记录
        </TabsTrigger>
      </TabsList>
      <TabsContent
        className={cn(useInternalScroll && "xl:min-h-0 xl:overflow-y-auto xl:pr-1")}
        value="career-summary"
      >
        <CandidateCareerSummary onWorkExperienceSelect={onWorkExperienceSelect} profile={profile} />
      </TabsContent>
      <TabsContent
        className={cn(useInternalScroll && "xl:min-h-0 xl:overflow-hidden")}
        value="activity"
      >
        <CandidateTimeline
          className={useInternalScroll ? "xl:h-full" : undefined}
          data={timeline}
          density="rail"
          isLoading={isTimelineLoading}
          scrollMode={useInternalScroll ? "internal" : "page"}
          showHeading={false}
        />
      </TabsContent>
    </Tabs>
  );
}
