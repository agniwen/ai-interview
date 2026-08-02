"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "加载列表失败，请稍后重试。";
}

export function ListLoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border px-6 text-center"
      role="alert"
    >
      <IconAlertCircle className="size-6 text-destructive" />
      <div className="space-y-1">
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
