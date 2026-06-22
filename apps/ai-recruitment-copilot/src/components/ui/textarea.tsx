import { cn } from "@arc/shared/utils";
import * as React from "react";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";

function Textarea({ className, ref, ...props }: React.ComponentProps<"textarea">) {
  return (
    <span
      className={cn(cossFieldSurfaceClass, "inline-flex w-full text-base md:text-sm")}
      data-slot="textarea-control"
    >
      <textarea
        className={cn(
          "field-sizing-content relative z-10 min-h-16 w-full rounded-[inherit] bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:cursor-not-allowed",
          className,
        )}
        data-slot="textarea"
        ref={ref}
        {...props}
      />
    </span>
  );
}

function TextareaControl({ className, ref, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "field-sizing-content relative z-10 min-h-16 w-full rounded-[inherit] bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:cursor-not-allowed",
        className,
      )}
      data-slot="textarea"
      ref={ref}
      {...props}
    />
  );
}

export { Textarea, TextareaControl };
