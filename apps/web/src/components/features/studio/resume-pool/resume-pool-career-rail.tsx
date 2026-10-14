"use client";

import type { ResumeProfile } from "@app/db-schema/interview/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandidateCareerSummary } from "../candidate-career-summary";

/** 人才库记录没有招聘活动，侧栏只保留与招聘台详情一致的履历概要。 */
export function ResumePoolCareerRail({
  onWorkExperienceSelect,
  profile,
}: {
  onWorkExperienceSelect: (companyName: string) => void;
  profile: ResumeProfile | null;
}) {
  return (
    <Tabs className="max-w-full gap-4" defaultValue="career-summary">
      <TabsList className="w-full" variant="underline">
        <TabsTrigger className="flex-1" value="career-summary">
          履历概要
        </TabsTrigger>
      </TabsList>
      <TabsContent value="career-summary">
        <ScrollArea className="max-h-[70vh]" scrollFade>
          <div className="pr-2">
            <CandidateCareerSummary
              onWorkExperienceSelect={onWorkExperienceSelect}
              profile={profile}
            />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
