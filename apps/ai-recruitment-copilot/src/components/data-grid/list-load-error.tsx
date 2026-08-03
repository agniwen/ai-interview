"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "加载列表失败，请稍后重试。";
}

export function ListLoadError({
  compact = false,
  error,
  onRetry,
}: {
  compact?: boolean;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex rounded-lg border border-border",
        compact
          ? "items-center gap-3 px-4 py-3 text-left"
          : "min-h-48 flex-col items-center justify-center gap-3 px-6 text-center",
      )}
      role="alert"
    >
      <IconAlertCircle className={cn("shrink-0 text-destructive", compact ? "size-5" : "size-6")} />
      <div className={cn("space-y-1", compact && "min-w-0 flex-1")}>
        <p className="font-medium text-sm">列表加载失败</p>
        <p className="text-muted-foreground text-sm">{errorMessage(error)}</p>
      </div>
      {onRetry ? (
        <Button onClick={onRetry} size="sm" variant="outline">
          重试
        </Button>
      ) : null}
    </div>
  );
}
