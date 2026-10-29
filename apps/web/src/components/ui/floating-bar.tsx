import type { ComponentProps } from "react";
import { cn } from "@app/shared/utils";

/**
 * Shared floating surface. Match --floating-bar-inset to the content padding.
 * 悬浮栏内的次要按钮统一为灰色调，并给文字按钮最小宽度，避免两字按钮过短；
 * 按 DOM 作用，portal 进来的流程面板同样生效，同一按钮在弹窗里仍保持原样。
 * Outline buttons render in the gray tone inside floating surfaces, and text buttons get a
 * minimum width so two-character actions do not collapse; scoped by DOM so portalled flows match.
 */
export function FloatingBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="floating-bar"
      {...props}
      className={cn(
        "pointer-events-auto [--floating-bar-inset:0.25rem] rounded-[calc(var(--radius-md)+var(--floating-bar-inset))]",
        "relative bg-background/95 shadow-large backdrop-blur-xl",
        "[&_[data-slot=button][data-variant=outline]]:bg-component [&_[data-slot=button][data-variant=outline]]:text-secondary-foreground [&_[data-slot=button][data-variant=outline]]:shadow-none [&_[data-slot=button][data-variant=outline]:hover]:bg-component-hover [&_[data-slot=button][data-variant=outline]:active]:bg-component-active",
        "md:[&_[data-slot=button]:not([data-size^=icon],[data-size=xs],[data-variant=text])]:min-w-24",
        // 尺寸统一按人才库详情悬浮栏的 sm 规格。 Buttons follow the resume-pool bar's sm size.
        "md:[&_[data-slot=button][data-size=default]]:h-7 md:[&_[data-slot=button][data-size=default]]:px-2.5 md:[&_[data-slot=button][data-size=default]:has(>svg)]:px-2",
        className,
      )}
    />
  );
}
