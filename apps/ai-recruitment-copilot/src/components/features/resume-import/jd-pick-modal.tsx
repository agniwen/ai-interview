"use client";

import { IconLoader2, IconSparkles } from "@tabler/icons-react";
import { JobDescriptionSelectField } from "@/components/features/studio/interviews/job-description-select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      title="确认入库"
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
                <IconLoader2 className="size-3.5 animate-spin" />
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
                <IconSparkles className="size-3.5" />
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
          <Card className="gap-0 rounded-md border-dashed py-0">
            <CardContent className="flex items-center gap-2 bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
              <IconLoader2 className="size-3.5 animate-spin" />
              <span>正在分析简历并匹配最合适的在招岗位…</span>
            </CardContent>
          </Card>
        ) : null}
        {!isAnalyzingMatch && matchReason ? (
          <Card className="gap-0 rounded-md border-amber-200/70 bg-amber-50/70 py-0 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <CardContent className="flex items-start gap-2 px-3 py-2 text-xs">
              <IconSparkles className="mt-0.5 size-3.5 shrink-0" />
              <span>已根据简历匹配到建议岗位：{matchReason}</span>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Modal>
  );
}
