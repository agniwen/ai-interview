import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { HumanMeetingFloatingPanel } from "./human-meeting-floating-panel";

export function HumanMeetingTranscriptPanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || isMobile) {
      return;
    }
    const previousFocus = document.activeElement;
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, [isMobile, onClose, open]);

  const content = (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <Button aria-label="关闭字幕" onClick={onClose} size="icon-sm" variant="ghost">
          <IconX />
        </Button>
        {isMobile ? (
          <DrawerTitle className="text-sm font-medium">实时字幕</DrawerTitle>
        ) : (
          <h2 className="text-sm font-medium">实时字幕</h2>
        )}
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
        data-vaul-no-drag
      >
        {children}
      </div>
    </>
  );
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()} direction="bottom">
        <DrawerContent
          className="!inset-x-0 !bottom-auto !mt-0 h-dvh !max-h-none !w-screen !max-w-none !rounded-none !border-0 top-0"
          data-slot="meeting-transcript-panel"
          hideHandle
        >
          {content}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <HumanMeetingFloatingPanel
      open={open}
      ref={panelRef}
      tabIndex={-1}
      aria-label="实时字幕"
      data-slot="meeting-transcript-panel"
    >
      {content}
    </HumanMeetingFloatingPanel>
  );
}
