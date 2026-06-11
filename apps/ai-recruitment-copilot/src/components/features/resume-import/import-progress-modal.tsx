"use client";

import { CheckIcon, LoaderCircleIcon, WrenchIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ResumeDedupOverlay } from "@/components/features/resume/resume-dedup-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import type { DedupMatchRecord } from "@/lib/client/api";
import { PhaseTracker } from "./phase-tracker";
import type { ImportPhase, PartialField, ProgressTool } from "./types";

interface ImportProgressModalProps {
  open: boolean;
  filename: string | undefined;
  phase: ImportPhase;
  progressStatus: string;
  progressTools: ProgressTool[];
  partialFields: PartialField[];
  dedupMatches: DedupMatchRecord[] | null;
  onCancel: () => void;
  onDedupContinue: () => void;
}

export function ImportProgressModal({
  open,
  filename,
  phase,
  progressStatus,
  progressTools,
  partialFields,
  dedupMatches,
  onCancel,
  onDedupContinue,
}: ImportProgressModalProps) {
  return (
    <Modal
      bodyClassName="px-6 py-7"
      description={filename ?? "候选人简历.pdf"}
      dismissible={false}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
      open={open}
      showCloseButton={false}
      size={dedupMatches ? "lg" : "md"}
      title={dedupMatches ? "疑似重复的候选人" : "入库候选人简历"}
    >
      {dedupMatches ? (
        <ResumeDedupOverlay
          matches={dedupMatches}
          onCancel={onCancel}
          onContinue={onDedupContinue}
        />
      ) : (
        <div className="flex flex-col items-center gap-5">
          <LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" />
          <p className="text-center text-foreground text-sm">{progressStatus || "正在处理…"}</p>

          <PhaseTracker phase={phase} />

          {progressTools.length > 0 ? (
            <div className="flex flex-col gap-1.5 text-muted-foreground text-xs">
              {progressTools.map((tool) => (
                <div className="flex items-center gap-1.5" key={tool.name}>
                  {tool.done ? (
                    <CheckIcon className="size-3 text-emerald-500" />
                  ) : (
                    <WrenchIcon className="size-3 animate-pulse" />
                  )}
                  <span>{tool.name}</span>
                </div>
              ))}
            </div>
          ) : null}

          <AnimatePresence>
            {partialFields.length > 0 ? (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto w-full max-w-xs"
                exit={{ opacity: 0, y: -6 }}
                initial={{ opacity: 0, y: 6 }}
              >
                <Card className="gap-0 rounded-lg py-0">
                  <CardContent className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 bg-background/80 px-4 py-3 text-xs">
                    {partialFields.map((field) => (
                      <div className="contents" key={field.label}>
                        <span className="text-muted-foreground">{field.label}</span>
                        <span className="truncate font-medium text-foreground">{field.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <Button onClick={onCancel} size="sm" type="button" variant="outline">
            取消入库
          </Button>
        </div>
      )}
    </Modal>
  );
}
