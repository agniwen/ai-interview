"use client";

import { createContext, useContext, useState } from "react";
import type { HTMLAttributes, PropsWithChildren, ReactNode, TransitionEvent } from "react";
import { createPortal } from "react-dom";
import { ScrollArea } from "@/components/ui/scroll-area";

const StudioContentOverlayTargetContext = createContext<HTMLElement | null>(null);
const ignoreStudioContentOverlayTarget = (target: HTMLElement | null) => {
  void target;
};
const StudioContentOverlaySetTargetContext = createContext<(target: HTMLElement | null) => void>(
  ignoreStudioContentOverlayTarget,
);

export function StudioContentOverlayProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  return (
    <StudioContentOverlayTargetContext.Provider value={target}>
      <StudioContentOverlaySetTargetContext.Provider value={setTarget}>
        {children}
      </StudioContentOverlaySetTargetContext.Provider>
    </StudioContentOverlayTargetContext.Provider>
  );
}

export function StudioContentOverlayTarget(props: HTMLAttributes<HTMLDivElement>) {
  const setTarget = useContext(StudioContentOverlaySetTargetContext);

  return <div data-slot="studio-content-overlay-root" {...props} ref={setTarget} />;
}

interface StudioContentRouteOverlayProps {
  children: (controls: { requestClose: () => void }) => ReactNode;
  onClose?: () => void;
}

export function StudioContentRouteOverlay({ children, onClose }: StudioContentRouteOverlayProps) {
  const target = useContext(StudioContentOverlayTargetContext);
  const [closing, setClosing] = useState(false);

  if (!target) {
    return null;
  }

  const completeClose = () => {
    onClose?.();
  };
  const requestClose = () => {
    if (closing) {
      return;
    }
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      completeClose();
      return;
    }
    setClosing(true);
  };
  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (closing && event.currentTarget === event.target && event.propertyName === "opacity") {
      completeClose();
    }
  };

  return createPortal(
    <div
      className={
        "pointer-events-auto size-full translate-x-0 bg-background opacity-100 blur-none " +
        "transition-[opacity,translate,filter] duration-[var(--duration-fast)] " +
        "ease-[var(--ease-smooth-out)] will-change-[opacity,translate,filter] " +
        "starting:translate-x-(--distance-base) starting:opacity-0 starting:blur-(--blur-medium) " +
        "data-[state=closing]:pointer-events-none data-[state=closing]:translate-x-(--distance-base) " +
        "data-[state=closing]:opacity-0 data-[state=closing]:blur-(--blur-medium) " +
        "motion-reduce:transition-none"
      }
      data-slot="studio-content-overlay"
      data-state={closing ? "closing" : "open"}
      onTransitionCancel={handleTransitionEnd}
      onTransitionEnd={handleTransitionEnd}
    >
      <ScrollArea className="size-full">
        <div className="flex min-h-full flex-col gap-4 px-4 pt-[calc(var(--header-height)+1rem)] pb-4 md:gap-6 md:px-6 md:pt-[calc(var(--header-height)+1.5rem)] md:pb-6">
          {children({ requestClose })}
        </div>
      </ScrollArea>
    </div>,
    target,
  );
}
