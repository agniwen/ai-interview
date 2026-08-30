"use client";

import { createContext, useContext, useState } from "react";
import type { HTMLAttributes, PropsWithChildren } from "react";
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

export function StudioContentRouteOverlay({ children }: PropsWithChildren) {
  const target = useContext(StudioContentOverlayTargetContext);

  if (!target) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-auto size-full bg-background">
      <ScrollArea className="size-full">
        <div className="flex min-h-full flex-col gap-4 px-4 pt-[calc(var(--header-height)+1rem)] pb-4 md:gap-6 md:px-6 md:pt-[calc(var(--header-height)+1.5rem)] md:pb-6">
          {children}
        </div>
      </ScrollArea>
    </div>,
    target,
  );
}
