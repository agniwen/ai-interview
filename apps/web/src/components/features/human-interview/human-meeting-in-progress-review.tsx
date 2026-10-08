import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { HumanMeetingReview } from "./human-meeting-review";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

export function HumanMeetingInProgressReview({
  inviteToken,
  expanded,
  container,
  onClose,
}: {
  inviteToken: string;
  expanded: boolean;
  container: HTMLElement;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open) {
      return;
    }
    // Keep the form mounted until Vaul's 500 ms exit transition finishes.
    const timer = window.setTimeout(onClose, 500);
    return () => window.clearTimeout(timer);
  }, [onClose, open]);
  return (
    <HumanMeetingReview
      active={open}
      draftOnly
      selectPortalContainer={panel}
      inviteToken={inviteToken}
      onClose={() => setOpen(false)}
      renderShell={(content, requestClose) => (
        <Drawer
          open={open && expanded}
          container={container}
          modal={false}
          direction="bottom"
          autoFocus
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              requestClose();
            }
          }}
        >
          <DrawerContent
            ref={setPanel}
            data-slot="meeting-review-panel"
            className="!absolute !bottom-3 !mt-0 mx-auto h-[min(44rem,calc(100%-1.75rem))] !max-h-none w-[min(48rem,calc(100%-2rem))] overflow-hidden !rounded-xl border shadow-lg"
            onInteractOutside={(event) => event.preventDefault()}
            hideHandle
          >
            <DrawerHeader className="flex-row items-start justify-between gap-3 border-b">
              <div className="flex flex-col gap-1 text-left">
                <DrawerTitle>面试评价</DrawerTitle>
                <DrawerDescription>
                  面试中可填写并保存草稿，结束后继续完善并提交。
                </DrawerDescription>
              </div>
              <Button aria-label="关闭评价" size="icon-sm" variant="ghost" onClick={requestClose}>
                <IconX />
              </Button>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col" data-vaul-no-drag>
              {content}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    />
  );
}
