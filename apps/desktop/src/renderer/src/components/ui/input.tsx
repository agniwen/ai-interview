import { cn } from "@app/shared/utils";
import * as React from "react";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";

function Input({ className, type, ref, ...props }: React.ComponentProps<"input">) {
  return (
    <span
      className={cn(
        cossFieldSurfaceClass,
        "inline-flex h-9 w-full min-w-0 text-base md:text-sm",
        className,
      )}
      data-slot="input-control"
    >
      <input
        className="relative z-10 h-full w-full min-w-0 rounded-[inherit] bg-transparent px-3 py-1 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed"
        data-slot="input"
        ref={ref}
        type={type}
        {...props}
      />
    </span>
  );
}

function InputControl({ className, type, ref, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-full w-full min-w-0 rounded-[inherit] bg-transparent px-3 py-1 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed",
        className,
      )}
      data-slot="input"
      ref={ref}
      type={type}
      {...props}
    />
  );
}

export { Input, InputControl };
