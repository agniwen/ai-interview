"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type ResponsiveDialogContextValue = { isMobile: boolean };
const ResponsiveDialogContext = React.createContext<ResponsiveDialogContextValue>({
  isMobile: false,
});

function useResponsiveDialog() {
  return React.useContext(ResponsiveDialogContext);
}

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
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

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const { isMobile } = useResponsiveDialog();

  return isMobile ? (
    <DrawerPrimitive.Trigger
      data-slot="dialog-trigger"
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Trigger>)}
    />
  ) : (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
  );
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
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

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const { isMobile } = useResponsiveDialog();

  return isMobile ? (
    <DrawerPrimitive.Close
      data-slot="dialog-close"
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Close>)}
    />
  ) : (
    <DialogPrimitive.Close data-slot="dialog-close" {...props} />
  );
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { isMobile } = useResponsiveDialog();
  const overlayClassName = cn(
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
    className,
  );

  return isMobile ? (
    <DrawerPrimitive.Overlay
      data-slot="dialog-overlay"
      className={overlayClassName}
      {...(props as React.ComponentProps<typeof DrawerPrimitive.Overlay>)}
    />
  ) : (
    <DialogPrimitive.Overlay data-slot="dialog-overlay" className={overlayClassName} {...props} />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const { isMobile } = useResponsiveDialog();

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal data-slot="dialog-portal">
        <DrawerPrimitive.Overlay
          data-slot="dialog-overlay"
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
        />
        <DrawerPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "group/drawer-content fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[85vh] flex-col gap-4 rounded-t-lg border-t bg-background px-4 pb-4 outline-none",
            className,
          )}
          {...(props as unknown as React.ComponentProps<typeof DrawerPrimitive.Content>)}
        >
          <div className="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted" />
          {children}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 outline-none sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
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
          : "flex flex-col gap-2 text-center sm:text-left",
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
          ? "mt-auto flex flex-col gap-2"
          : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const { isMobile } = useResponsiveDialog();
  const titleClassName = cn("text-lg leading-none font-semibold", className);

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

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
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
