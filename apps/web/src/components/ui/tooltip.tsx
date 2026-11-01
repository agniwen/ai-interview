"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@app/shared/utils";
import { cossTooltipMotionClass } from "@/components/ui/coss-style";

function TooltipProvider({
  delay = 80,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 7,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "bg-background text-foreground z-50 w-fit rounded-lg px-3 py-1.5 text-xs text-balance shadow-large",
            cossTooltipMotionClass,
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="bg-background size-2.5 rotate-45 rounded-[2px] border-[color-mix(in_oklab,var(--gray-a3),var(--gray-3)_25%)] dark:border-[color-mix(in_oklab,var(--gray-a3),var(--gray-6)_25%)] data-[side=bottom]:top-[-5px] data-[side=bottom]:border-t-[0.5px] data-[side=bottom]:border-l-[0.5px] data-[side=left]:right-[-5px] data-[side=left]:border-t-[0.5px] data-[side=left]:border-r-[0.5px] data-[side=right]:left-[-5px] data-[side=right]:border-b-[0.5px] data-[side=right]:border-l-[0.5px] data-[side=top]:bottom-[-5px] data-[side=top]:border-r-[0.5px] data-[side=top]:border-b-[0.5px] dark:data-[side=bottom]:border-t dark:data-[side=bottom]:border-l dark:data-[side=left]:border-t dark:data-[side=left]:border-r dark:data-[side=right]:border-b dark:data-[side=right]:border-l dark:data-[side=top]:border-r dark:data-[side=top]:border-b" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
