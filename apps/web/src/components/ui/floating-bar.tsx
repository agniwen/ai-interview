import type { ComponentProps } from "react";
import { cn } from "@app/shared/utils";

/**
 * Shared floating surface. Match --floating-bar-inset to the content padding.
 * 悬浮栏内的文字按钮有最小宽度，避免两字按钮过短；按 DOM 作用，portal 进来的流程面板同样生效，
 * 同一按钮在弹窗里仍保持原样。
 * Text buttons get a minimum width so two-character actions do not collapse; scoped by DOM so
 * portalled flows match while the same buttons keep their size in modals.
 */
export function FloatingBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="floating-bar"
      {...props}
      className={cn(
        "pointer-events-auto [--floating-bar-inset:0.25rem] rounded-[calc(var(--radius-md)+var(--floating-bar-inset))]",
        "relative bg-background/95 shadow-large backdrop-blur-xl",
        "md:[&_[data-slot=button]:not([data-size^=icon],[data-size=xs],[data-variant=text])]:min-w-24",
        // 尺寸统一按人才库详情悬浮栏的 sm 规格。 Buttons follow the resume-pool bar's sm size.
        "md:[&_[data-slot=button][data-size=default]]:h-7 md:[&_[data-slot=button][data-size=default]]:px-2.5 md:[&_[data-slot=button][data-size=default]:has(>svg)]:px-2",
        className,
      )}
    />
  );
}
