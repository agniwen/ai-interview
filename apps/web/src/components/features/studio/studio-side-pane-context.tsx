"use client";

import { createMagicPortal } from "foxact/magic-portal";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const [PanePortalProvider, PanePortalTarget, PanePortalContent] =
  createMagicPortal("StudioSidePane");
export { PanePortalTarget as StudioSidePaneTarget };
export const STUDIO_SIDE_PANE_ID = "studio-side-pane";
export const STUDIO_SIDE_PANE_TITLE_ID = "studio-side-pane-title";

interface SidePaneController {
  activeId: string | null;
  isClosing: boolean;
  finishClosing: () => void;
  open: (id: string) => void;
  close: () => void;
  dismiss: (id: string) => void;
  getReturnFocus: () => HTMLElement | null;
}
const StudioSidePaneContext = createContext<SidePaneController | null>(null);

export function StudioSidePaneProvider({
  children,
  scopeKey,
}: {
  children: ReactNode;
  scopeKey: string;
}) {
  const [state, setState] = useState<{
    scopeKey: string;
    activeId: string | null;
    isClosing: boolean;
    revision: number;
  }>({
    activeId: null,
    isClosing: false,
    revision: 0,
    scopeKey,
  });
  const returnFocus = useRef<HTMLElement | null>(null);
  if (state.scopeKey !== scopeKey) {
    setState({ activeId: null, isClosing: false, revision: state.revision + 1, scopeKey });
  }
  const activeId = state.scopeKey === scopeKey ? state.activeId : null;
  const open = useCallback(
    (id: string) => {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setState((previous) => ({
        activeId: id,
        isClosing: false,
        revision: previous.revision + 1,
        scopeKey,
      }));
    },
    [scopeKey],
  );
  const getReturnFocus = useCallback(
    () => (returnFocus.current?.isConnected ? returnFocus.current : null),
    [],
  );
  const close = useCallback(() => {
    const animate =
      window.matchMedia?.("(max-width: 1023px)").matches &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setState((previous) => {
      if (previous.isClosing || previous.activeId === null) {
        return previous;
      }
      return {
        ...previous,
        activeId: animate ? previous.activeId : null,
        isClosing: Boolean(animate),
        revision: previous.revision + 1,
      };
    });
    if (!animate) {
      getReturnFocus()?.focus({ preventScroll: true });
    }
  }, [getReturnFocus]);
  const { revision } = state;
  const finishClosing = useCallback(() => {
    setState((previous) =>
      previous.isClosing && previous.revision === revision
        ? { ...previous, activeId: null, isClosing: false }
        : previous,
    );
  }, [revision]);
  // Owner cleanup must not close a pane that has since replaced it.
  const dismiss = useCallback((id: string) => {
    setState((previous) =>
      previous.activeId === id ? { ...previous, activeId: null, isClosing: false } : previous,
    );
  }, []);
  return (
    <StudioSidePaneContext.Provider
      value={{
        activeId,
        close,
        dismiss,
        finishClosing,
        getReturnFocus,
        isClosing: state.isClosing,
        open,
      }}
    >
      <PanePortalProvider>{children}</PanePortalProvider>
    </StudioSidePaneContext.Provider>
  );
}

export function useStudioSidePaneController() {
  const context = useContext(StudioSidePaneContext);
  if (!context) {
    throw new Error("Studio side panes require StudioSidePaneProvider");
  }
  return context;
}

/** IDs are unique among mounted owners. Keep content mounted next to its trigger. */
export function useStudioSidePane(id: string) {
  const controller = useStudioSidePaneController();
  const isOpen = controller.activeId === id && !controller.isClosing;
  return {
    close: () => {
      if (isOpen) {
        controller.close();
      }
    },
    isOpen,
    open: () => controller.open(id),
    triggerProps: {
      "aria-controls": isOpen ? STUDIO_SIDE_PANE_ID : undefined,
      "aria-expanded": isOpen,
      onClick: () => (isOpen ? controller.close() : controller.open(id)),
    },
  };
}

/** Portal children retain the caller's React context and only mount while selected. */
export function StudioSidePaneContent({ id, children }: { id: string; children: ReactNode }) {
  const { activeId, dismiss } = useStudioSidePaneController();
  useEffect(() => () => dismiss(id), [dismiss, id]);
  return activeId === id ? <PanePortalContent>{children}</PanePortalContent> : null;
}
