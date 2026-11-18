import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HumanMeetingReview } from "./human-meeting-review";

export function HumanMeetingPrejoinReview({
  inviteToken,
  onClose,
}: {
  inviteToken: string;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  return (
    <HumanMeetingReview
      active
      draftOnly
      inviteToken={inviteToken}
      selectPortalContainer={panel}
      onClose={onClose}
      renderShell={(content, requestClose) => (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              requestClose();
            }
          }}
        >
          <DialogContent className="flex h-[min(44rem,85dvh)] min-h-0 flex-col overflow-hidden sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>面试评价</DialogTitle>
              <DialogDescription>草稿自动保存，面试结束后可提交评价。</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col" ref={setPanel}>
              {content}
            </div>
          </DialogContent>
        </Dialog>
      )}
    />
  );
}
