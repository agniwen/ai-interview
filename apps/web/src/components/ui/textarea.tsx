import { cn } from "@app/shared/utils";
import * as React from "react";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";

// 与 Input 一致，默认关闭浏览器自动填充。 Autofill is off by default, matching Input.
function Textarea({
  autoComplete = "off",
  className,
  ref,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <span
      className={cn(cossFieldSurfaceClass, "inline-flex w-full text-base md:text-[13px]")}
      data-slot="textarea-control"
    >
      <textarea
        className={cn(
          "field-sizing-content relative z-10 min-h-16 w-full rounded-[inherit] bg-transparent px-2.5 py-2 outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:cursor-not-allowed",
          className,
        )}
        data-slot="textarea"
        ref={ref}
        autoComplete={autoComplete}
        {...props}
      />
    </span>
  );
}

function TextareaControl({
  autoComplete = "off",
  className,
  ref,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "field-sizing-content relative z-10 min-h-16 w-full rounded-[inherit] bg-transparent px-2.5 py-2 outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:cursor-not-allowed",
        className,
      )}
      data-slot="textarea"
      ref={ref}
      autoComplete={autoComplete}
      {...props}
    />
  );
}

export { Textarea, TextareaControl };
