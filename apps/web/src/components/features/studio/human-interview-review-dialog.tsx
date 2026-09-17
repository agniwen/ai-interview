import { HumanMeetingReview } from "@/components/features/human-interview/human-meeting-review";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function HumanInterviewReviewDialog({
  slug,
  candidateId,
  candidateName,
  roundId,
  roundLabel,
  onClose,
  onSaved,
}: {
  slug: string;
  candidateId: string;
  candidateName: string;
  roundId: string;
  roundLabel?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const basePath = `/api/w/${encodeURIComponent(slug)}/studio/interviews/${encodeURIComponent(candidateId)}/human-interview-rounds/review/${encodeURIComponent(roundId)}`;
  return (
    <HumanMeetingReview
      active
      basePath={basePath}
      onClose={onClose}
      onSaved={onSaved}
      renderShell={(content, requestClose) => (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              requestClose();
            }
          }}
        >
          <DialogContent className="flex max-h-[85dvh] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
            <DialogHeader className="shrink-0 pr-6 md:px-4 md:pt-4 md:pr-10">
              <DialogTitle>
                面试评价 · {candidateName}
                {roundLabel ? ` · ${roundLabel}` : ""}
              </DialogTitle>
              <DialogDescription>
                保存为草稿，或选择通过 / 不通过后提交。关闭后仍停留在候选人详情。
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col max-md:-mx-4">{content}</div>
          </DialogContent>
        </Dialog>
      )}
    />
  );
}
