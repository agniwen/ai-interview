"use client";

import { createContext, useContext, useState } from "react";
import type { HTMLAttributes, PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";
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
        <div style={{ paddingTop: TITLE_BAR_HEIGHT_PX }}>{children}</div>
      </ScrollArea>
    </div>,
    target,
  );
}
