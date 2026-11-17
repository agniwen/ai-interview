import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { HumanMeetingFloatingPanel } from "./human-meeting-floating-panel";

export function HumanMeetingToolPanel({
  desktopClassName,
  id,
  title,
  closeLabel,
  slot,
  open,
  onClose,
  children,
}: {
  desktopClassName?: string;
  id?: string;
  title: string;
  closeLabel: string;
  slot: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isMobile || !open || !viewport) {
      return;
    }
    const updateBounds = () => {
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }
      drawer.style.top = `${viewport.offsetTop}px`;
      drawer.style.height = `${viewport.height}px`;
    };
    updateBounds();
    viewport.addEventListener("resize", updateBounds);
    viewport.addEventListener("scroll", updateBounds);
    return () => {
      viewport.removeEventListener("resize", updateBounds);
      viewport.removeEventListener("scroll", updateBounds);
    };
  }, [isMobile, open]);
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
        <Button aria-label={closeLabel} onClick={onClose} size="icon-sm" variant="ghost">
          <IconX />
        </Button>
        {isMobile ? (
          <DrawerTitle className="text-sm font-medium">{title}</DrawerTitle>
        ) : (
          <h2 className="text-sm font-medium">{title}</h2>
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
      <Drawer
        open={open}
        onOpenChange={(nextOpen) => !nextOpen && onClose()}
        direction="bottom"
        repositionInputs={false}
      >
        <DrawerContent
          className="!inset-x-0 !bottom-auto !mt-0 h-dvh !max-h-none !w-screen !max-w-none !rounded-none !border-0 top-0"
          data-slot={slot}
          id={id}
          hideHandle
          ref={drawerRef}
        >
          {content}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <HumanMeetingFloatingPanel
      className={desktopClassName}
      open={open}
      ref={panelRef}
      tabIndex={-1}
      aria-label={title}
      data-slot={slot}
      id={id}
    >
      {content}
    </HumanMeetingFloatingPanel>
  );
}
