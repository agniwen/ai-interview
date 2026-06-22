"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { cossPopupSurfaceClass } from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  // 不用 Portal —— popover 内联渲染。
  // Radix Dialog 用 react-remove-scroll 锁滚，并把 onWheelCapture 挂在 dialog 内容上。
  // Portal 到 body 会让 popover 跑到 wrapper 外面，wheel 事件被 document 级 shouldPrevent
  // 当作"外部事件"直接拦截，列表滚不动。
  // 内联渲染让 popover 留在 wrapper 内部，事件被 onWheelCapture 命中并按 scrollHeight/clientHeight 正确放行；
  // Popover 用 position:fixed 定位，不会被父级 overflow 裁切。
  // / Render inline (no Portal). When the popover is portalled to body it sits outside
  // the dialog's react-remove-scroll wrapper, so the document-level shouldPrevent
  // listener treats every wheel/touch as an "outside" event and preventDefaults it,
  // killing list scroll. Inline rendering keeps it inside the wrapper where
  // onWheelCapture sees the event and lets it through. Radix Popover uses fixed
  // positioning, so parent overflow doesn't clip it.
  return (
    <PopoverPrimitive.Content
      data-slot="popover-content"
      // 嵌入 vaul Drawer（移动端 dialog）时让 popover 正常滚动；不在 drawer 里此属性 no-op。
      // / Harmless attribute outside of vaul drawers; lets the popover scroll inside one.
      data-vaul-no-drag=""
      align={align}
      sideOffset={sideOffset}
      className={cn(
        cossPopupSurfaceClass,
        "z-50 w-72 origin-(--radix-popover-content-transform-origin) p-4 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <div data-slot="popover-title" className={cn("font-medium", className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
