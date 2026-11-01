import { cn } from "@app/shared/utils";
import * as React from "react";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";

// 系统内输入框默认关闭浏览器自动填充；登录等确实需要的地方显式传入 autoComplete。
// Browser autofill is off by default; fields that need it (sign-in) pass autoComplete explicitly.
function Input({
  autoComplete = "off",
  className,
  type,
  ref,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <span
      className={cn(
        cossFieldSurfaceClass,
        "inline-flex h-8 w-full min-w-0 text-base md:text-[13px]",
        className,
      )}
      data-slot="input-control"
    >
      <input
        className="relative z-10 h-full w-full min-w-0 rounded-[inherit] bg-transparent px-2.5 py-1 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed"
        data-slot="input"
        autoComplete={autoComplete}
        ref={ref}
        type={type}
        {...props}
      />
    </span>
  );
}

function InputControl({
  autoComplete = "off",
  className,
  type,
  ref,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-full w-full min-w-0 rounded-[inherit] bg-transparent px-2.5 py-1 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed",
        className,
      )}
      data-slot="input"
      autoComplete={autoComplete}
      ref={ref}
      type={type}
      {...props}
    />
  );
}

export { Input, InputControl };
