"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { lazy, Suspense } from "react";
import { Modal } from "@/components/ui/modal";
import type { DedupMatchRecord, DedupSourceCandidate } from "@/lib/client/api";

export type ResumeDedupCompareMode = "detail" | "resume";

const ResumeDedupCompareDialogContent = lazy(async () => {
  const mod = await import("./resume-dedup-compare-dialog");
  return { default: mod.ResumeDedupCompareDialogContent };
});

export function ResumeDedupCompareDialog({
  match,
  mode,
  onOpenChange,
  open,
  source,
}: {
  match: DedupMatchRecord;
  mode: ResumeDedupCompareMode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  source: DedupSourceCandidate;
}) {
  return (
    <Modal
      bodyClassName="min-h-0 overflow-hidden p-0"
      className="h-[92dvh]"
      description="左侧为当前简历，右侧为疑似简历。"
      onOpenChange={onOpenChange}
      open={open}
      size="full"
      title={mode === "detail" ? "简历详情对比" : "原始简历对比"}
    >
      {open ? (
        <Suspense
          fallback={
            <output
              aria-live="polite"
              className="flex h-full min-h-64 items-center justify-center gap-2 text-muted-foreground text-sm"
            >
              <IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
              正在加载简历对比…
            </output>
          }
        >
          <ResumeDedupCompareDialogContent match={match} mode={mode} open={open} source={source} />
        </Suspense>
      ) : null}
    </Modal>
  );
}
