"use client";

import { IconX } from "@tabler/icons-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { ButtonSizeProvider } from "@/components/ui/button";
import {
  cossModalMotionClass,
  cossModalOverlayMotionClass,
  cossModalSurfaceClass,
} from "@/components/ui/coss-style";
import {
  type ModalPlacement,
  sideModalMotionClass,
  sideModalPositionClass,
  useModalPlacement,
} from "@/components/ui/modal-placement";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@app/shared/utils";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
type HeaderLayout = "stack" | "row";

// 不同尺寸映射到 Tailwind max-width 类，"full" 对应详情类弹窗的近全屏样态。
// Size → max-width class mapping; "full" mirrors the detail-dialog near-fullscreen layout.
const SIZE_CLASS: Record<ModalSize, string> = {
  "2xl": "sm:max-w-5xl",
  "3xl": "sm:w-[min(96vw,1200px)] sm:max-w-none",
  full: "sm:w-[min(96vw,1440px)] sm:max-w-none",
  lg: "sm:max-w-2xl",
  md: "sm:max-w-lg",
  sm: "sm:max-w-md",
  xl: "sm:max-w-3xl",
};

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
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
  /** 叠在内容之上、相对弹窗定位的层（如悬浮操作栏），不随主体滚动。Overlay positioned within the modal surface. */
  overlay?: React.ReactNode;
  size?: ModalSize;
  /** 桌面端呈现位置；默认继承 ModalPlacementProvider，未设置时居中。 */
  placement?: ModalPlacement;
  fullScreen?: boolean;
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
  onOpenChangeComplete,
  title,
  description,
  footer,
  headerExtra,
  headerLayout = "stack",
  children,
  size = "md",
  placement,
  fullScreen = false,
  showCloseButton = true,
  dismissible = true,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  overlay,
}: ModalProps) {
  const isSide = useModalPlacement(placement) === "side" && !fullScreen;
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  // Base UI 只在 open 从 false 变为 true 时播放入场过渡；挂载时即为打开态的弹窗
  // （例如调用方随 key 重新挂载）先以关闭态提交一次，保证入场动画照常播放。
  // / Base UI only runs the enter transition on a false → true change, so a modal
  // mounted already open first commits closed to keep its enter animation.
  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => {
    setHasMounted(true);
  }, []);
  const handleOpenChange: DialogPrimitive.Root.Props["onOpenChange"] = (nextOpen, details) => {
    if (
      !dismissible &&
      !nextOpen &&
      (details.reason === "escape-key" || details.reason === "outside-press")
    ) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <DialogPrimitive.Root
      disablePointerDismissal={!dismissible}
      open={open && hasMounted}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-background/60 backdrop-blur-xs",
            cossModalOverlayMotionClass,
          )}
        />
        <DialogPrimitive.Popup
          ref={popupRef}
          initialFocus={popupRef}
          tabIndex={-1}
          className={cn(
            // 外层只承担居中定位与 zoom 动画；不放 overflow-hidden 与背景，
            // 让 Popover 等 position:fixed 子节点不会被裁切（Content 自身的 transform
            // 仍是其包含块，但没有 overflow 所以子节点能视觉溢出可见）。
            // / Outer wrapper handles only centering + zoom animation.
            // Visual frame (background, border, overflow-hidden) lives on the inner div,
            // so position:fixed descendants (popovers) escape the visual frame even though
            // their containing block is still this transformed Content.
            isSide
              ? [sideModalPositionClass, sideModalMotionClass]
              : [
                  "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
                  "w-full max-w-[calc(100%-2rem)] outline-none",
                  cossModalMotionClass,
                ],
            SIZE_CLASS[size],
            fullScreen &&
              "inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 sm:w-screen",
          )}
        >
          <div
            className={cn(
              cossModalSurfaceClass,
              "flex max-h-[90vh] flex-col overflow-hidden rounded-xl",
              isSide && "rounded-none border-y-0 border-r-0 shadow-none",
              fullScreen && "h-dvh max-h-dvh rounded-none border-0",
              className,
              // 抽屉始终铺满视口高度，覆盖调用方为居中弹窗设置的高度上限。
              // / Side drawers always fill the viewport height, overriding centered max-heights.
              isSide && "h-full max-h-none sm:max-h-none",
            )}
          >
            <ModalHeader
              title={title}
              description={description}
              headerExtra={headerExtra}
              headerLayout={headerLayout}
              isMobile={false}
              titleSize={isSide ? "lg" : "md"}
              // 上下留白放在固定的头尾而非滚动主体里，滚动时内容不会贴住标题和按钮。
              // Spacing lives on the fixed header/footer, not the scroll body,
              // so scrolled content never touches the title or the actions.
              className={cn(isSide ? "px-5 pt-5 pb-4" : "px-4 pt-3 pb-3", headerClassName)}
            />
            {showCloseButton ? (
              <DialogPrimitive.Close
                data-slot="modal-close"
                className={cn(
                  "absolute flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
                  isSide ? "top-5 right-4" : "top-3 right-3",
                  "hover:bg-accent hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none data-popup-open:bg-accent data-popup-open:text-muted-foreground",
                  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                )}
              >
                <IconX />
                <span className="sr-only">关闭</span>
              </DialogPrimitive.Close>
            ) : null}
            <div
              data-slot="modal-body"
              className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                isSide ? "px-5 py-1" : "px-4 py-1",
                bodyClassName,
              )}
            >
              {children}
            </div>
            {footer ? (
              <div
                className={cn(
                  "flex shrink-0 flex-col-reverse gap-2 bg-background",
                  isSide ? "px-5 pt-4 pb-5" : "px-4 pt-3 pb-4",
                  "sm:flex-row sm:justify-end",
                  footerClassName,
                )}
              >
                <ButtonSizeProvider size="default">{footer}</ButtonSizeProvider>
              </div>
            ) : null}
            {overlay}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DrawerModal({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  footer,
  headerExtra,
  headerLayout = "stack",
  children,
  dismissible = true,
  fullScreen = false,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  overlay,
}: ModalProps) {
  const previousOpenRef = React.useRef(open);

  React.useEffect(() => {
    if (previousOpenRef.current === open) {
      return;
    }

    previousOpenRef.current = open;

    if (open) {
      onOpenChangeComplete?.(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onOpenChangeComplete?.(false);
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [open, onOpenChangeComplete]);

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 backdrop-blur-xs bg-background/60 duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)]",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-[var(--duration-quick)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "motion-reduce:animate-none",
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
            fullScreen && "inset-0 mt-0 h-dvh max-h-dvh",
          )}
        >
          <div
            className={cn(
              cossModalSurfaceClass,
              "flex h-full max-h-[90vh] flex-col overflow-hidden rounded-t-3xl",
              fullScreen && "h-dvh max-h-dvh rounded-none border-0",
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
              titleSize="lg"
              className={cn("px-4 pt-3 pb-3", headerClassName)}
            />
            <div
              data-slot="modal-body"
              className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-1", bodyClassName)}
            >
              {children}
            </div>
            {footer ? (
              <div
                className={cn(
                  "flex shrink-0 flex-row items-stretch gap-2 bg-background px-4 pt-3",
                  "pb-[calc(env(safe-area-inset-bottom)+1rem)] [&>*]:flex-1",
                  footerClassName,
                )}
              >
                <ButtonSizeProvider size="default">{footer}</ButtonSizeProvider>
              </div>
            ) : null}
            {overlay}
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
  titleSize,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  headerExtra?: React.ReactNode;
  headerLayout: HeaderLayout;
  isMobile: boolean;
  /** "md" 用于居中弹窗，"lg" 用于抽屉。"md" for centered dialogs, "lg" for drawers. */
  titleSize: "md" | "lg";
  className?: string;
}) {
  // Title/Description primitives wire ARIA labelledby/describedby for us.
  const TitleEl = isMobile ? DrawerPrimitive.Title : DialogPrimitive.Title;
  const DescEl = isMobile ? DrawerPrimitive.Description : DialogPrimitive.Description;
  const titleNode = (
    <TitleEl
      className={cn(
        "font-medium leading-6 text-foreground",
        titleSize === "lg" ? "text-lg" : "text-[0.9375rem]",
      )}
    >
      {title}
    </TitleEl>
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
