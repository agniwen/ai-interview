"use client";

import { createContext, useContext, useReducer, useState, useEffect, useRef } from "react";
import type { ReactNode, Dispatch } from "react";
import { LazyMotion, MotionContext, domMax, m, useReducedMotion } from "motion/react";
import { cn } from "@app/shared/utils";
import { DETAIL_PAGE_FLOATING_ACTION_CLASS } from "../studio-person-detail-model";
import { dockReducer } from "./action-flow-state";
import type { DockEvent, CandidateActionId } from "./action-flow-state";

export const DOCK_LAYOUT_DURATION = 0.32;

interface DockContextValue {
  active: CandidateActionId | null;
  dispatch: Dispatch<DockEvent>;
  target: HTMLDivElement | null;
  candidateName: string;
}
const DockContext = createContext<DockContextValue | null>(null);
export function useCandidateActionDock() {
  return useContext(DockContext);
}

/** Correct toolbar scale without making portalled flows inherit its hidden geometry. */
function DockToolbar({ active, children }: { active: boolean; children: ReactNode }) {
  const shellMotion = useContext(MotionContext);
  return (
    <m.div
      hidden={active}
      layout="position"
      layoutAnchor={{ x: 0.5, y: 1 }}
      style={{ originX: 0.5, originY: 1 }}
      data-slot="candidate-dock-toolbar"
    >
      <div
        className="p-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 md:p-1"
        style={{ animationDuration: `${DOCK_LAYOUT_DURATION}s` }}
      >
        <MotionContext.Provider value={shellMotion}>{children}</MotionContext.Provider>
      </div>
    </m.div>
  );
}

/** Keep the toolbar mounted: its flows own drafts even while their triggers are hidden. */
export function CandidateActionDock({
  children,
  candidateName,
}: {
  children: ReactNode;
  candidateName: string;
}) {
  const [state, dispatch] = useReducer(dockReducer, { active: null });
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state.feedback) {
      return;
    }
    const timer = window.setTimeout(() => dispatch({ type: "clear-feedback" }), 1800);
    return () => window.clearTimeout(timer);
  }, [state.feedback]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const update = () => {
      const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      rootRef.current?.style.setProperty("--dock-keyboard-inset", `${keyboardInset}px`);
      rootRef.current?.style.setProperty("--dock-viewport-height", `${viewport.height}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return (
    <LazyMotion features={domMax}>
      <DockContext.Provider value={{ ...state, candidateName, dispatch, target }}>
        <m.div
          ref={rootRef}
          layoutRoot
          className="pointer-events-none fixed inset-x-4 z-40 flex justify-center"
          style={{
            bottom: "calc(2.5rem + env(safe-area-inset-bottom) + var(--dock-keyboard-inset, 0px))",
          }}
        >
          <m.div
            layout={!reduceMotion}
            layoutAnchor={{ x: 0.5, y: 1 }}
            style={{ originX: 0.5, originY: 1 }}
            transition={{
              layout: { duration: DOCK_LAYOUT_DURATION, ease: [0.22, 1, 0.36, 1], type: "tween" },
            }}
            className={cn(
              "pointer-events-auto w-full max-w-full overflow-hidden rounded-xl md:w-auto md:rounded-md",
              DETAIL_PAGE_FLOATING_ACTION_CLASS,
            )}
            data-slot="candidate-action-dock"
            data-expanded={Boolean(state.active)}
          >
            {state.feedback ? (
              <output className="block px-3 pt-2 text-xs text-primary-link">
                {state.feedback}
              </output>
            ) : null}
            <DockToolbar active={state.active !== null}>{children}</DockToolbar>
            <div ref={setTarget} />
          </m.div>
        </m.div>
      </DockContext.Provider>
    </LazyMotion>
  );
}

/** Open is a draft lifetime; suspending the Dock does not reset the business form. */
export function useCandidateActionFlow(id: CandidateActionId) {
  const dock = useCandidateActionDock();
  const [open, setLocalOpen] = useState(false);
  function setOpen(next: boolean) {
    setLocalOpen(next);
    dock?.dispatch({ id, type: next ? "enter" : "leave" });
  }
  return { open, setOpen };
}

/** Freeze optimistic concurrency at first edit; background refresh must not authorize stale input. */
export function useActionRecordVersion(open: boolean, version: number | undefined) {
  const [snapshot, setSnapshot] = useState<number | undefined>();
  if (!open && snapshot !== undefined) {
    setSnapshot(undefined);
  }
  if (open && snapshot === undefined && version !== undefined) {
    setSnapshot(version);
  }
  return snapshot ?? version;
}

export function useActionFlowCompletion(id: CandidateActionId) {
  const dock = useCandidateActionDock();
  return (message: string) => dock?.dispatch({ id, message, type: "complete" });
}
