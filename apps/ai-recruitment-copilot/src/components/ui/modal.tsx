"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/shared/utils";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";
type HeaderLayout = "stack" | "row";

// 不同尺寸映射到 Tailwind max-width 类，"full" 对应详情类弹窗的近全屏样态。
// Size → max-width class mapping; "full" mirrors the detail-dialog near-fullscreen layout.
const SIZE_CLASS: Record<ModalSize, string> = {
  "2xl": "sm:max-w-5xl",
  full: "sm:w-[min(96vw,1440px)] sm:max-w-none",
  lg: "sm:max-w-2xl",
  md: "sm:max-w-lg",
  sm: "sm:max-w-md",
  xl: "sm:max-w-3xl",
};

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 固定在底部的 footer，不传则不渲染。Sticky footer; omit to render none. */
  footer?: React.ReactNode;
  /** 在 title/description 之后渲染的扩展内容（如 Tabs、工具栏）。Header extras (Tabs, toolbars) below title/description. */
  headerExtra?: React.ReactNode;
  /** "stack" 把 headerExtra 放在 title 下方；"row" 放在 title 右侧（用于工具栏）。 */
  headerLayout?: HeaderLayout;
  /** 可滚动的主体区域。 */
  children: React.ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  /** 为 false 时屏蔽 ESC、点击遮罩关闭与移动端下滑关闭，调用方需自己提供关闭路径。 */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
}

export function Modal(props: ModalProps) {
  const isMobile = useIsMobile();
  return isMobile ? <DrawerModal {...props} /> : <DialogModal {...props} />;
}

function DialogModal({
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
  const blockWhenLocked = (event: Event) => {
    if (!dismissible) {
      event.preventDefault();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 backdrop-blur-xs bg-background/60",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            // 外层只承担居中定位与 zoom 动画；不放 overflow-hidden 与背景，
            // 让 Popover 等 position:fixed 子节点不会被裁切（Content 自身的 transform
            // 仍是其包含块，但没有 overflow 所以子节点能视觉溢出可见）。
            // / Outer wrapper handles only centering + zoom animation.
            // Visual frame (background, border, overflow-hidden) lives on the inner div,
            // so position:fixed descendants (popovers) escape the visual frame even though
            // their containing block is still this transformed Content.
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-[calc(100%-2rem)] outline-none duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            SIZE_CLASS[size],
          )}
          onEscapeKeyDown={blockWhenLocked}
          onPointerDownOutside={blockWhenLocked}
          onInteractOutside={blockWhenLocked}
        >
          <div
            className={cn(
              "relative flex max-h-[90vh] flex-col overflow-hidden rounded-3xl border bg-background shadow-lg",
              className,
            )}
          >
            <ModalHeader
              title={title}
              description={description}
              headerExtra={headerExtra}
              headerLayout={headerLayout}
              isMobile={false}
              className={cn("border-b px-6 pt-5 pb-4", headerClassName)}
            />
            {showCloseButton ? (
              <DialogPrimitive.Close
                className={cn(
                  "absolute right-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity",
                  "hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  "disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
                  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                )}
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            ) : null}
            <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", bodyClassName)}>
              {children}
            </div>
            {footer ? (
              <div
                className={cn(
                  "flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-6 py-4",
                  "sm:flex-row sm:justify-end",
                  footerClassName,
                )}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DrawerModal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  headerExtra,
  headerLayout = "stack",
  children,
  dismissible = true,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
}: ModalProps) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 backdrop-blur-xs bg-background/60",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
        />
        {/*
          外层 Drawer.Content 只承担定位/拖拽/动画，避免和 overflow-hidden 同处一节点
          导致 Popover 等 position:fixed 子节点被裁切。视觉边框放在内层。
          / Outer Drawer.Content carries position + drag handlers only; the inner div
          owns the visual frame so popover descendants can visually overflow.
        */}
        <DrawerPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[90vh] flex-col outline-none",
          )}
        >
          <div
            className={cn(
              "relative flex h-full max-h-[90vh] flex-col overflow-hidden rounded-t-3xl border-t bg-background",
              className,
            )}
          >
            {/* drag handle / 拖拽指示条 */}
            <div
              aria-hidden="true"
              className="mx-auto mt-3 h-1.5 w-24 shrink-0 rounded-full bg-muted"
            />
            <ModalHeader
              title={title}
              description={description}
              headerExtra={headerExtra}
              headerLayout={headerLayout}
              isMobile={true}
              className={cn("border-b px-4 pt-3 pb-3", headerClassName)}
            />
            <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4", bodyClassName)}>
              {children}
            </div>
            {footer ? (
              <div
                className={cn(
                  "flex shrink-0 flex-row items-stretch gap-2 border-t bg-background px-4 pt-3",
                  "pb-[calc(env(safe-area-inset-bottom)+1rem)] [&>*]:flex-1",
                  footerClassName,
                )}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

function ModalHeader({
  title,
  description,
  headerExtra,
  headerLayout,
  isMobile,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  headerExtra?: React.ReactNode;
  headerLayout: HeaderLayout;
  isMobile: boolean;
  className?: string;
}) {
  // Radix 必须用 Title/Description 才能正确连上 ARIA 关系。
  // Radix's Title/Description primitives wire ARIA labelledby/describedby for us.
  const TitleEl = isMobile ? DrawerPrimitive.Title : DialogPrimitive.Title;
  const DescEl = isMobile ? DrawerPrimitive.Description : DialogPrimitive.Description;
  const titleNode = (
    <TitleEl className="text-lg font-semibold leading-none text-foreground">{title}</TitleEl>
  );
  const descriptionNode = description ? (
    <DescEl className="text-sm text-muted-foreground">{description}</DescEl>
  ) : null;

  if (headerLayout === "row") {
    return (
      <div className={cn("flex shrink-0 flex-row items-center justify-between gap-4", className)}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {titleNode}
          {descriptionNode}
        </div>
        {headerExtra ? <div className="flex shrink-0 items-center">{headerExtra}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn("flex shrink-0 flex-col gap-1.5 text-left", className)}>
      {titleNode}
      {descriptionNode}
      {headerExtra}
    </div>
  );
}
