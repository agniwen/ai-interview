"use client";

import type { ReactNode } from "react";
import {
  Modal as HeroModal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from "@heroui/react";
import { cn } from "@/lib/utils";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";
type HeaderLayout = "stack" | "row";

// Hero UI Modal sizes: sm | md | lg | full | cover. We keep the project's
// 6-step scale and map to the closest Hero UI size where available.
const SIZE_TO_HERO: Record<ModalSize, "sm" | "md" | "lg" | "full"> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "lg",
  "2xl": "lg",
  full: "full",
};

const SIZE_DIALOG_CLASS: Record<ModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
  "2xl": "sm:max-w-5xl",
  full: "sm:w-[min(96vw,1440px)] sm:max-w-none",
};

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Sticky footer; omit to render none. */
  footer?: ReactNode;
  /** Header extras (Tabs, toolbars) below title/description. */
  headerExtra?: ReactNode;
  /** "stack" places headerExtra below the title; "row" puts it to the right. */
  headerLayout?: HeaderLayout;
  /** Scrollable body. */
  children: ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  /** When false, disables ESC + overlay-click + mobile drag-down close. */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  headerExtra,
  headerLayout = "stack",
  children,
  size = "md",
  showCloseButton = true,
  dismissible = true,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
}: ModalProps) {
  return (
    <HeroModal isOpen={open} onOpenChange={onOpenChange}>
      <ModalBackdrop isDismissable={dismissible}>
        <ModalContainer size={SIZE_TO_HERO[size]}>
          <ModalDialog
            className={cn(
              "flex max-h-[90vh] flex-col overflow-hidden",
              SIZE_DIALOG_CLASS[size],
              className,
            )}
          >
            <InnerHeader
              title={title}
              description={description}
              headerExtra={headerExtra}
              headerLayout={headerLayout}
              showCloseButton={showCloseButton}
              className={headerClassName}
            />
            <ModalBody className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", bodyClassName)}>
              {children}
            </ModalBody>
            {footer ? (
              <ModalFooter
                className={cn(
                  "flex shrink-0 flex-col-reverse gap-2 border-t border-separator px-6 py-4",
                  "sm:flex-row sm:justify-end",
                  footerClassName,
                )}
              >
                {footer}
              </ModalFooter>
            ) : null}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </HeroModal>
  );
}

function InnerHeader({
  title,
  description,
  headerExtra,
  headerLayout,
  showCloseButton: _showCloseButton,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  headerExtra?: ReactNode;
  headerLayout: HeaderLayout;
  showCloseButton: boolean;
  className?: string;
}) {
  const titleNode = (
    <ModalHeading className="text-lg leading-none font-semibold text-foreground">
      {title}
    </ModalHeading>
  );
  const descriptionNode = description ? <p className="text-sm text-muted">{description}</p> : null;

  if (headerLayout === "row") {
    return (
      <ModalHeader
        className={cn(
          "flex shrink-0 flex-row items-center justify-between gap-4 border-b border-separator px-6 pt-5 pb-4",
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {titleNode}
          {descriptionNode}
        </div>
        {headerExtra ? <div className="flex shrink-0 items-center">{headerExtra}</div> : null}
      </ModalHeader>
    );
  }

  return (
    <ModalHeader
      className={cn(
        "flex shrink-0 flex-col gap-1.5 border-b border-separator px-6 pt-5 pb-4 text-left",
        className,
      )}
    >
      {titleNode}
      {descriptionNode}
      {headerExtra}
    </ModalHeader>
  );
}
