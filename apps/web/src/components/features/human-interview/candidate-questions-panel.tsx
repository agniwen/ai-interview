import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ScrollArea } from "@/components/ui/scroll-area";

export function CandidateQuestionsPanel({
  id,
  isMobile,
  open,
  onClose,
  children,
}: {
  id: string;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeButton = (
    <Button aria-label="关闭面试题" onClick={onClose} size="icon-sm" variant="ghost">
      <IconX />
    </Button>
  );
  if (isMobile) {
    return (
      <Modal
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
        title="面试题"
        headerLayout="row"
        headerExtra={closeButton}
        className="h-[85dvh]"
        bodyClassName="overflow-hidden p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <div id={id} className="h-full min-h-0" data-vaul-no-drag>
          <ScrollArea className="h-full" scrollFade scrollbars="leave">
            {children}
          </ScrollArea>
        </div>
      </Modal>
    );
  }
  return (
    <section
      aria-label="面试题"
      id={id}
      inert={!open}
      aria-hidden={!open}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden pr-3"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-6 pb-1">
        <h2 className="font-semibold text-base">面试题</h2>
        {closeButton}
      </div>
      <ScrollArea className="min-h-0 flex-1" scrollFade scrollbars="leave">
        {children}
      </ScrollArea>
    </section>
  );
}
