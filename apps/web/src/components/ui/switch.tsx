"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@app/shared/utils";

function Switch({
  className,
  onClick,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "t-toggle peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent p-px outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80",
        className,
      )}
      onClick={(event) => {
        event.currentTarget.dataset.motionReady = "";
        onClick?.(event);
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "t-toggle-thumb pointer-events-none block rounded-full bg-background shadow-sm/5 ring-0 motion-reduce:animate-none group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
