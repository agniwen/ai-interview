"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  STUDIO_SIDE_PANE_ID,
  STUDIO_SIDE_PANE_TITLE_ID,
  StudioSidePaneTarget,
  useStudioSidePaneController,
} from "./studio-side-pane-context";

function subscribeToLayout(onChange: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const getDesktopSnapshot = () => window.matchMedia("(min-width: 1024px)").matches;
const getServerSnapshot = () => true;

export function StudioSidePaneFrame({
  desktop,
  onClose: close,
  children,
  getReturnFocus,
  open = true,
  onClosed,
}: {
  open?: boolean;
  onClosed?: () => void;
  desktop: boolean;
  onClose: () => void;
  children: ReactNode;
  getReturnFocus?: () => HTMLElement | null;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  const focusPane = useCallback((node: HTMLElement | null) => {
    paneRef.current = node;
    node?.focus();
  }, []);
  useEffect(() => {
    const pane = paneRef.current;
    if (!desktop || !pane) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.stopPropagation();
        close();
      }
    };
    pane.addEventListener("keydown", handleKeyDown);
    return () => pane.removeEventListener("keydown", handleKeyDown);
  }, [close, desktop]);
  if (!desktop) {
    return (
      <Drawer
        direction="right"
        open={open}
        onAnimationEnd={(isOpen) => {
          if (!isOpen) {
            onClosed?.();
          }
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            close();
          }
        }}
      >
        <DrawerContent
          id={STUDIO_SIDE_PANE_ID}
          aria-describedby={undefined}
          aria-labelledby={STUDIO_SIDE_PANE_TITLE_ID}
          className="h-dvh gap-0 overflow-hidden shadow-extra-large data-[vaul-drawer-direction=right]:w-[min(26rem,calc(100vw-1rem))] data-[vaul-drawer-direction=right]:rounded-l-2xl data-[vaul-drawer-direction=right]:border-0 data-[vaul-drawer-direction=right]:sm:max-w-none"
          hideHandle
          onCloseAutoFocus={(event) => {
            const target = getReturnFocus?.();
            if (target) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
        >
          <DrawerTitle className="sr-only">侧边面板</DrawerTitle>
          {children}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <aside
      id={STUDIO_SIDE_PANE_ID}
      aria-labelledby={STUDIO_SIDE_PANE_TITLE_ID}
      tabIndex={-1}
      ref={focusPane}
      className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-2xl bg-background shadow-default outline-none dark:shadow-none dark:ring-[0.5px] dark:ring-border xl:w-96 2xl:w-[26rem]"
    >
      {children}
    </aside>
  );
}

export function StudioSidePane() {
  const { activeId, isClosing, finishClosing, close, getReturnFocus } =
    useStudioSidePaneController();
  const desktop = useSyncExternalStore(subscribeToLayout, getDesktopSnapshot, getServerSnapshot);
  useEffect(() => {
    if (desktop && isClosing) {
      finishClosing();
    }
  }, [desktop, isClosing, finishClosing]);
  if (activeId === null) {
    return null;
  }
  return (
    <StudioSidePaneFrame
      desktop={desktop}
      open={!isClosing}
      onClosed={finishClosing}
      onClose={close}
      getReturnFocus={getReturnFocus}
    >
      <StudioSidePaneTarget className="flex min-h-0 flex-1 flex-col" />
    </StudioSidePaneFrame>
  );
}
