"use client";

import { IconX } from "@tabler/icons-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { Button, ButtonSizeProvider } from "@/components/ui/button";
import {
  cossModalMotionClass,
  cossModalOverlayMotionClass,
  cossModalSurfaceClass,
} from "@/components/ui/coss-style";
import {
  type ModalPlacement,
  ModalPlacementProvider,
  sideModalMotionClass,
  sideModalPositionClass,
  useModalPlacement,
} from "@/components/ui/modal-placement";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@app/shared/utils";

interface ResponsiveDialogContextValue {
  isMobile: boolean;
}
const ResponsiveDialogContext = React.createContext<ResponsiveDialogContextValue>({
  isMobile: false,
});

function useResponsiveDialog() {
  return React.useContext(ResponsiveDialogContext);
}

function Dialog(props: DialogPrimitive.Root.Props) {
  const isMobile = useIsMobile();
  const contextValue = React.useMemo(() => ({ isMobile }), [isMobile]);

  return (
    <ResponsiveDialogContext.Provider value={contextValue}>
      {isMobile ? (
        <DrawerPrimitive.Root
          data-slot="dialog"
          {...(props as React.ComponentProps<typeof DrawerPrimitive.Root>)}
        />
      ) : (
        <DialogPrimitive.Root data-slot="dialog" {...props} />
      )}
    </ResponsiveDialogContext.Provider>
  );
}

function DialogTrigger({ render, ...props }: DialogPrimitive.Trigger.Props) {
  const { isMobile } = useResponsiveDialog();

  if (isMobile && React.isValidElement(render)) {
    return (
      <DrawerPrimitive.Trigger
        asChild
        data-slot="dialog-trigger"
        {...(props as React.ComponentProps<typeof DrawerPrimitive.Trigger>)}
      >
        {render}
      </DrawerPrimitive.Trigger>
    );
  }

  return isMobile ? (
    <DrawerPrimitive.Trigger
      data-slot="dialog-trigger"
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Trigger>)}
    />
  ) : (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" render={render} {...props} />
  );
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  const { isMobile } = useResponsiveDialog();

  return isMobile ? (
    <DrawerPrimitive.Portal
      data-slot="dialog-portal"
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Portal>)}
    />
  ) : (
    <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
  );
}

function DialogClose({ render, ...props }: DialogPrimitive.Close.Props) {
  const { isMobile } = useResponsiveDialog();

  if (isMobile && React.isValidElement(render)) {
    return (
      <DrawerPrimitive.Close
        asChild
        data-slot="dialog-close"
        {...(props as React.ComponentProps<typeof DrawerPrimitive.Close>)}
      >
        {render}
      </DrawerPrimitive.Close>
    );
  }

  return isMobile ? (
    <DrawerPrimitive.Close
      data-slot="dialog-close"
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Close>)}
    />
  ) : (
    <DialogPrimitive.Close data-slot="dialog-close" render={render} {...props} />
  );
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  const { isMobile } = useResponsiveDialog();
  const overlayClassName = cn(
    "fixed inset-0 z-50 bg-background/80 backdrop-blur-xs",
    isMobile
      ? "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-[state=closed]:duration-[var(--duration-quick)] motion-reduce:animate-none"
      : cossModalOverlayMotionClass,
    className,
  );

  return isMobile ? (
    <DrawerPrimitive.Overlay
      data-slot="dialog-overlay"
      className={overlayClassName}
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Overlay>)}
    />
  ) : (
    <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={overlayClassName} {...props} />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  initialFocus,
  placement,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  /** 桌面端呈现位置；默认继承 ModalPlacementProvider，未设置时居中。 */
  placement?: ModalPlacement;
}) {
  const { isMobile } = useResponsiveDialog();
  const isSide = useModalPlacement(placement) === "side";
  const popupRef = React.useRef<HTMLDivElement | null>(null);

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal data-slot="dialog-portal">
        <DrawerPrimitive.Overlay
          data-slot="dialog-overlay"
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 backdrop-blur-xs bg-background/80 duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-[state=closed]:duration-[var(--duration-quick)] motion-reduce:animate-none"
        />
        <DrawerPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            // 外层 drawer 不再吃 padding；内容区单独做滚动，确保 footer 始终可达
            // / Outer drawer drops its padding; the inner scroll wrapper owns it
            // so the sticky footer can extend edge-to-edge and stay reachable.
            cossModalSurfaceClass,
            "group/drawer-content fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[85vh] flex-col overflow-hidden rounded-t-lg outline-none",
            className,
          )}
          {...(props as unknown as React.ComponentProps<typeof DrawerPrimitive.Content>)}
        >
          <div className="mx-auto mt-4 h-2 w-25 shrink-0 rounded-full bg-muted" />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4">
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-background/80 backdrop-blur-xs",
          cossModalOverlayMotionClass,
        )}
      />
      <DialogPrimitive.Popup
        ref={popupRef}
        data-slot="dialog-content"
        initialFocus={initialFocus ?? popupRef}
        tabIndex={-1}
        className={
          isSide
            ? cn(
                cossModalSurfaceClass,
                sideModalPositionClass,
                sideModalMotionClass,
                "grid content-start gap-4 overflow-y-auto border-y-0 border-r-0 p-5 shadow-none sm:max-w-lg",
                className,
                // 抽屉始终铺满视口高度，覆盖调用方为居中弹窗设置的高度上限。
                // / Side drawers always fill the viewport height, overriding centered max-heights.
                "h-dvh max-h-none rounded-none sm:max-h-none",
              )
            : cn(
                cossModalSurfaceClass,
                cossModalMotionClass,
                "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl px-4 pt-3 pb-4 outline-none sm:max-w-lg",
                className,
              )
        }
        {...props}
      >
        {/* 子级 DialogTitle 据此选择居中弹窗或抽屉的标题字号。/ Lets DialogTitle size itself for the surface. */}
        <ModalPlacementProvider placement={isSide ? "side" : "center"}>
          {children}
        </ModalPlacementProvider>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              "absolute flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              isSide ? "top-5 right-4" : "top-3 right-3",
            )}
          >
            <IconX />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = useResponsiveDialog();

  return (
    <div
      data-slot="dialog-header"
      className={cn(
        isMobile
          ? "flex flex-col gap-1.5 text-center sm:text-left"
          : "flex flex-col gap-1 pr-8 text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { isMobile } = useResponsiveDialog();

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        isMobile
          ? // 横向铺满：每个按钮 flex-1 平分宽度（两按钮各占一半，单按钮占满）。
            // mt-auto / sticky bottom-0：内容短时贴底，内容长时滚动钉底。
            // -mx-4 + bg-background：边到边铺底，滚动内容不会从按钮间透出。
            // safe-area inset：避开 iOS 主屏指示条。
            // / Row layout where every direct child is flex-1 — two buttons
            // each take half, a single button fills the row. mt-auto + sticky
            // bottom-0 keep it pinned in both short and long content.
            "-mx-4 sticky bottom-0 z-10 mt-auto flex flex-row items-stretch gap-2 bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] [&>*]:flex-1"
          : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      <ButtonSizeProvider size="default">
        {children}
        {showCloseButton &&
          (isMobile ? (
            <DrawerPrimitive.Close asChild>
              <Button variant="outline">Close</Button>
            </DrawerPrimitive.Close>
          ) : (
            <DialogPrimitive.Close render={<Button variant="outline" />}>
              Close
            </DialogPrimitive.Close>
          ))}
      </ButtonSizeProvider>
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  const { isMobile } = useResponsiveDialog();
  const isSide = useModalPlacement() === "side";
  const titleClassName = cn(
    "font-medium leading-6",
    isMobile || isSide ? "text-lg" : "text-[0.9375rem]",
    className,
  );

  return isMobile ? (
    <DrawerPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-foreground", titleClassName)}
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Title>)}
    />
  ) : (
    <DialogPrimitive.Title data-slot="dialog-title" className={titleClassName} {...props} />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  const { isMobile } = useResponsiveDialog();
  const descriptionClassName = cn("text-muted-foreground text-sm", className);

  return isMobile ? (
    <DrawerPrimitive.Description
      data-slot="dialog-description"
      className={descriptionClassName}
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Description>)}
    />
  ) : (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={descriptionClassName}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
