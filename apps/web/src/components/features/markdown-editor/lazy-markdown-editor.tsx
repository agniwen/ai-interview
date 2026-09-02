"use client";

import { lazy, Suspense } from "react";
import { cn } from "@app/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarkdownEditorProps } from "./index";

const MarkdownEditor = lazy(async () => {
  const editorModule = await import("./index");
  return { default: editorModule.MarkdownEditor };
});

function MarkdownEditorFallback({
  className,
  height,
  minHeight = 240,
}: Pick<MarkdownEditorProps, "className" | "height" | "minHeight">) {
  return (
    <output
      aria-busy="true"
      aria-label="编辑器正在加载"
      className={cn("flex flex-col overflow-hidden rounded-md border bg-background", className)}
      style={{ height, minHeight }}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="space-y-3 p-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </output>
  );
}

export function LazyMarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense fallback={<MarkdownEditorFallback {...props} />}>
      <MarkdownEditor {...props} />
    </Suspense>
  );
}
