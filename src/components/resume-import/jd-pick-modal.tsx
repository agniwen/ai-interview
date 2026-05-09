"use client";

import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { JobDescriptionSelectField } from "@/app/(auth)/studio/interviews/_components/job-description-select-field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface JdPickModalProps {
  open: boolean;
  filename: string | undefined;
  selectedJdId: string;
  jdError: string | undefined;
  matchReason: string | null;
  isAnalyzingMatch: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectChange: (next: string) => void;
  onAnalyze: () => void;
  onCancelAnalyze: () => void;
  onConfirm: () => void;
}

export function JdPickModal({
  open,
  filename,
  selectedJdId,
  jdError,
  matchReason,
  isAnalyzingMatch,
  onOpenChange,
  onSelectChange,
  onAnalyze,
  onCancelAnalyze,
  onConfirm,
}: JdPickModalProps) {
  return (
    <Modal
      description={filename ?? "候选人简历.pdf"}
      dismissible={!isAnalyzingMatch}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isAnalyzingMatch} onClick={onConfirm} type="button">
            确认入库
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="md"
      title="选择在招岗位后入库"
    >
      <div className="space-y-3">
        <JobDescriptionSelectField
          action={
            isAnalyzingMatch ? (
              <Button
                className="h-13 gap-1.5"
                onClick={onCancelAnalyze}
                size="sm"
                type="button"
                variant="outline"
              >
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                取消分析
              </Button>
            ) : (
              <Button
                className="h-13 gap-1.5"
                onClick={onAnalyze}
                size="sm"
                type="button"
                variant="outline"
              >
                <SparklesIcon className="size-3.5" />
                自动分析
              </Button>
            )
          }
          disabled={isAnalyzingMatch}
          error={jdError}
          onChange={onSelectChange}
          value={selectedJdId}
        />
        {isAnalyzingMatch ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            <span>正在分析简历并匹配最合适的在招岗位…</span>
          </div>
        ) : null}
        {!isAnalyzingMatch && matchReason ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-amber-800 text-xs dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <SparklesIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>已根据简历匹配到建议岗位：{matchReason}</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
