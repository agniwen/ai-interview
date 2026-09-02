import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";
import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actionRender?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actionRender, className }: PageHeaderProps) {
  return (
    <header
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0 w-full">
        <div className="flex min-w-0 items-end gap-1">
          <h1 className="min-w-0 text-2xl tracking-tight">{title}</h1>
          {description ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    aria-label="查看页面说明"
                    className="inline-flex size-5 -translate-y-px shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                  >
                    <IconInfoCircle aria-hidden="true" className="size-3.5" />
                  </button>
                }
              />
              <TooltipContent className="max-w-sm text-left leading-relaxed" side="bottom">
                {description}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      {actionRender ? <div className="shrink-0">{actionRender}</div> : null}
    </header>
  );
}
