"use client";
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Nonmodal flow region handles scoped Escape without trapping background focus. */

import { useEffect, useState, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { m, useReducedMotion } from "motion/react";
import { IconArrowLeft } from "@tabler/icons-react";
import { Modal } from "@/components/ui/modal";
import type { ModalProps } from "@/components/ui/modal";
import { Button, ButtonSizeProvider } from "@/components/ui/button";
import { cn } from "@app/shared/utils";
import { DOCK_LAYOUT_DURATION, useCandidateActionDock } from "./candidate-action-dock";
import type { CandidateActionId } from "./action-flow-state";

interface ActionFlowSurfaceProps extends ModalProps {
  flowId: CandidateActionId;
  busy?: boolean;
  error?: string | null;
  onBack?: () => void;
  stepLabel?: string;
}

function panelMotion(active: boolean, exiting: boolean, reduceMotion: boolean | null) {
  const visible = active && !exiting;
  let duration = DOCK_LAYOUT_DURATION * 0.8;
  if (exiting) {
    duration = 0.1;
  }
  if (reduceMotion) {
    duration = 0;
  }
  return {
    animate: { opacity: visible ? 1 : 0, y: visible || reduceMotion ? 0 : 8 },
    initial: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 },
    transition: {
      delay: reduceMotion || exiting || !active ? 0 : DOCK_LAYOUT_DURATION * 0.2,
      duration,
    },
  };
}

/** The same fields and submit handler can be hosted in a Dock or a standalone modal. */
export function ActionFlowSurface({
  flowId,
  busy = false,
  error,
  onBack,
  stepLabel,
  ...props
}: ActionFlowSurfaceProps) {
  const dock = useCandidateActionDock();
  const dispatch = dock?.dispatch;
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const active = props.open && dock?.active === flowId;
  const [exiting, setExiting] = useState(false);
  const [previousActive, setPreviousActive] = useState(active);
  if (previousActive !== active) {
    setPreviousActive(active);
    setExiting(false);
  }
  useEffect(() => {
    if (!props.open || !dispatch) {
      return;
    }
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ id: flowId, type: "enter" });
    return () => {
      dispatch({ id: flowId, type: "leave" });
      requestAnimationFrame(() => {
        if (!document.querySelector("[data-action-flow]:not([hidden])")) {
          triggerRef.current?.focus({ preventScroll: true });
        }
      });
    };
  }, [props.open, dispatch, flowId]);
  useEffect(() => {
    if (!active || !dock?.target) {
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [active, dock?.target, stepLabel]);

  if (!dock) {
    return (
      <Modal {...props} dismissible={!busy && props.dismissible !== false}>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {props.children}
      </Modal>
    );
  }
  if (!props.open || !dock.target) {
    return null;
  }
  const finishLeave = () => {
    dock.dispatch({ id: flowId, type: "leave" });
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  const leave = () => {
    if (busy || props.dismissible === false) {
      return;
    }
    if (onBack) {
      onBack();
      return;
    }
    if (reduceMotion) {
      finishLeave();
    } else {
      setExiting(true);
    }
  };
  return createPortal(
    <ButtonSizeProvider size="sm">
      <section
        tabIndex={-1}
        hidden={!active}
        aria-labelledby={titleId}
        aria-busy={busy}
        data-action-flow={flowId}
        className="w-[min(32rem,calc(100vw-2rem-2px))] text-[13px] [&_[data-slot=label]]:text-xs [&_[data-slot=field-label]]:text-xs [&_[data-slot=input]]:h-11 md:[&_[data-slot=input]]:h-8 [&_[data-slot=input]]:md:text-[13px] [&_[data-slot=textarea]]:md:text-[13px] [&_[data-slot=select-trigger]]:h-11 md:[&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:text-[13px]"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) {
            return;
          }
          // Events from portalled selectors bubble through React; leave them to their owner.
          if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
            return;
          }
          event.stopPropagation();
          leave();
        }}
      >
        <m.div
          layout="position"
          layoutAnchor={{ x: 0.5, y: 1 }}
          style={{
            maxHeight: "calc(var(--dock-viewport-height, 100dvh) - 6rem)",
            originX: 0.5,
            originY: 1,
          }}
          {...panelMotion(active, exiting, reduceMotion)}
          onAnimationComplete={() => {
            if (active && exiting) {
              finishLeave();
            }
          }}
          className="flex flex-col"
        >
          <header className="shrink-0 px-4 pt-3 pb-2 max-md:[&_button]:h-11 max-md:[&_button]:text-sm">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || props.dismissible === false}
                onClick={leave}
              >
                <IconArrowLeft className="size-4" />
                {onBack ? "上一步" : "返回操作"}
              </Button>
              <span className="truncate text-xs text-muted-foreground">{dock.candidateName}</span>
            </div>
            <h2
              ref={titleRef}
              id={titleId}
              tabIndex={-1}
              className="text-sm leading-5 font-medium outline-none"
            >
              {props.title}
            </h2>
            {props.description ? (
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {props.description}
              </div>
            ) : null}
            {stepLabel ? <p className="mt-2 text-xs text-muted-foreground">{stepLabel}</p> : null}
            {props.headerExtra}
          </header>
          <m.div
            layoutScroll
            className={cn(
              "min-h-0 overflow-y-auto overscroll-contain px-4 py-2",
              props.bodyClassName,
            )}
          >
            {error ? (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <fieldset disabled={busy} className="grid min-w-0 gap-3 border-0 p-0">
              {props.children}
            </fieldset>
          </m.div>
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/40 px-4 py-2.5 max-md:[&_button]:h-11 max-md:[&_button]:text-sm">
            {props.footer}
          </footer>
        </m.div>
      </section>
    </ButtonSizeProvider>,
    dock.target,
  );
}
