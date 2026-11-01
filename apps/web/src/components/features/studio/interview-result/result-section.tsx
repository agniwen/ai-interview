import type { TablerIcon } from "@tabler/icons-react";
import { cn } from "@app/shared/utils";
import type { ReactNode } from "react";

/**
 * 面试结果页签内的分区：图标 + 小标题 + 内容，不加卡片或底色；多个分区放进 ResultSectionStack 用分隔线隔开。
 *
 * A section in the interview result tabs: icon + small heading + content, with no card or tint.
 * Stack several in ResultSectionStack to separate them with hairlines.
 */
export function ResultSection({
  action,
  children,
  className,
  contentClassName,
  description,
  icon: Icon,
  meta,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: ReactNode;
  icon?: TablerIcon;
  meta?: ReactNode;
  title: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <div className="flex flex-col gap-1">
        <div className="flex min-h-7 items-center gap-2">
          {Icon ? (
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          <h3 className="font-semibold text-[13px] text-foreground">{title}</h3>
          {meta}
          {action ? <div className="ml-auto flex items-center gap-1">{action}</div> : null}
        </div>
        {description ? (
          <p className="text-muted-foreground text-xs leading-normal">{description}</p>
        ) : null}
      </div>
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </section>
  );
}

export function ResultSectionStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col divide-y divide-border/60 *:py-6 *:first:pt-0 *:last:pb-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
