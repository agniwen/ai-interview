import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HumanMeetingReviewReferences } from "./human-meeting-review-references";

/** Shown to reviewers who are not interviewers of this round; they may read but not evaluate. */
export function HumanMeetingReviewReadOnly({
  draftOnly,
  onClose,
  review,
  showClose,
}: {
  draftOnly: boolean;
  onClose: () => void;
  review: HumanInterviewReviewRecord;
  showClose: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1" scrollFade={!showClose} scrollbars="never">
        <div className="mx-auto w-full max-w-5xl p-4">
          {draftOnly ? null : <h2 className="font-medium text-lg">面试评价</h2>}
          <output className="mt-2 block text-muted-foreground text-sm">
            只有本轮面试官可以填写和提交评价。
          </output>
          <HumanMeetingReviewReferences review={review} canAdopt={false} />
        </div>
      </ScrollArea>
      {showClose ? (
        <div className="mx-auto flex w-full max-w-5xl shrink-0 justify-end border-t bg-background p-4">
          <Button onClick={onClose} variant="outline">
            关闭
          </Button>
        </div>
      ) : null}
    </section>
  );
}
