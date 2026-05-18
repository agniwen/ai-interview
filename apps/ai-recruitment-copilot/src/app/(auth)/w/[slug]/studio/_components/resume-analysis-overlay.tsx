"use client";

// 流式分析浮层：忙状态下绝对定位覆盖弹窗内容，dedup 命中时切换到
// ResumeDedupOverlay。`pipeline` 入参直接传 useResumeAnalysisPipeline 返回值即可。
//
// Streaming analysis overlay. Renders the dedup confirmation when dedupMatches
// is non-null, otherwise shows the loader / status / tools / partial fields.

import type { ResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import { ResumeDedupOverlay } from "@/components/resume-dedup-overlay";
import { TextFlip } from "@/components/text-flip";
import { Button } from "@/components/ui/button";
import { CheckIcon, LoaderCircleIcon, WrenchIcon } from "lucide-react";
import { motion } from "motion/react";

export function ResumeAnalysisOverlay({ pipeline }: { pipeline: ResumeAnalysisPipeline }) {
  if (!pipeline.isBusy) {
    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-white/80 px-6 py-8 backdrop-blur-sm dark:bg-black/50"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {pipeline.dedupMatches ? (
        <ResumeDedupOverlay
          matches={pipeline.dedupMatches}
          onCancel={pipeline.handleCancelAnalysis}
          onContinue={pipeline.handleDedupContinue}
        />
      ) : (
        <>
          <LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" />
          {pipeline.progressStatus ? (
            <p className="font-medium text-foreground text-sm">{pipeline.progressStatus}</p>
          ) : (
            <motion.div className="flex items-center font-medium text-foreground text-lg" layout>
              <span>正在</span>
              <TextFlip as={motion.span} interval={2.5} layout>
                <span>解析简历</span>
                <span>提取信息</span>
                <span>分析简历</span>
                <span>评估技能</span>
              </TextFlip>
            </motion.div>
          )}
          {pipeline.progressTools.length > 0 && (
            <div className="flex flex-col gap-1.5 text-muted-foreground text-xs">
              {pipeline.progressTools.map((t) => (
                <div className="flex items-center gap-1.5" key={t.name}>
                  {t.done ? (
                    <CheckIcon className="size-3 text-green-500" />
                  ) : (
                    <WrenchIcon className="size-3 animate-pulse" />
                  )}
                  <span>{t.name}</span>
                </div>
              ))}
            </div>
          )}
          {pipeline.partialFields.length > 0 && (
            <div className="mx-auto grid w-full max-w-xs grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-background/80 px-4 py-3 text-xs">
              {pipeline.partialFields.map((f) => (
                <div className="contents" key={f.label}>
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="truncate font-medium text-foreground">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          <Button onClick={pipeline.handleCancelAnalysis} size="sm" variant="outline">
            取消
          </Button>
        </>
      )}
    </motion.div>
  );
}
