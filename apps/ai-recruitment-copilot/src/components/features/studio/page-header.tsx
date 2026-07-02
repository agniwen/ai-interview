import type { ReactNode } from "react";
import { cn } from "@arc/shared/utils";

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
      <div className="min-w-0 flex flex-col gap-2">
        <h1 className="text-2xl">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {actionRender ? <div className="shrink-0">{actionRender}</div> : null}
    </header>
  );
}
