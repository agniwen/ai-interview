"use client";

// 流式分析浮层：忙状态下绝对定位覆盖弹窗内容，dedup 命中时切换到
// ResumeDedupOverlay。`pipeline` 入参直接传 useResumeAnalysisPipeline 返回值即可。
//
// Streaming analysis overlay. Renders the dedup confirmation when dedupMatches
// is non-null, otherwise shows the loader / status / tools / partial fields.

import type { ResumeAnalysisPipeline } from "@/components/studio/use-resume-analysis-pipeline";
import { MarkdownView } from "@/components/display/markdown-view";
import { ResumeDedupOverlay } from "@/components/resume/resume-dedup-overlay";
import { TextFlip } from "@/components/motion/text-flip";
import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";
import { CheckIcon, LoaderCircleIcon, WrenchIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const ANALYSIS_STEPS = ["分析简历基础信息", "分析匹配岗位", "生成简历评价"] as const;
const REVIEW_PREVIEW_AUTO_SCROLL_THRESHOLD = 80;

function isNearScrollBottom(element: HTMLElement) {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= REVIEW_PREVIEW_AUTO_SCROLL_THRESHOLD;
}

function getAnalysisStepIndex(pipeline: ResumeAnalysisPipeline) {
  if (pipeline.isGeneratingReview) {
    return 2;
  }
  if (pipeline.isMatchingJobDescription) {
    return 1;
  }
  if (pipeline.isAnalyzingResume) {
    return 0;
  }
  return -1;
}

export function ResumeAnalysisOverlay({ pipeline }: { pipeline: ResumeAnalysisPipeline }) {
  // 尊重系统的"减少动效"偏好：reduced-motion 用户跳过淡入。
  // Honor the OS reduced-motion preference by skipping the fade-in.
  const prefersReducedMotion = useReducedMotion();
  const analysisStepIndex = getAnalysisStepIndex(pipeline);
  const hasReviewPreview = pipeline.reviewPreview.trim().length > 0;
  const reviewPreviewRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollReviewPreviewRef = useRef(true);

  useEffect(() => {
    if (!(pipeline.isGeneratingReview && hasReviewPreview)) {
      shouldAutoScrollReviewPreviewRef.current = true;
    }
  }, [hasReviewPreview, pipeline.isGeneratingReview]);

  useEffect(() => {
    if (!(pipeline.isGeneratingReview && hasReviewPreview)) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const preview = reviewPreviewRef.current;
      if (preview && shouldAutoScrollReviewPreviewRef.current) {
        preview.scrollTop = preview.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [hasReviewPreview, pipeline.isGeneratingReview, pipeline.reviewPreview]);

  if (!pipeline.isBusy) {
    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-white/80 px-6 py-8 backdrop-blur-sm dark:bg-black/50"
      initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
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
          {analysisStepIndex >= 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs">
              {ANALYSIS_STEPS.map((label, index) => {
                const done = index < analysisStepIndex;
                const active = index === analysisStepIndex;
                return (
                  <div className="flex items-center gap-1.5" key={label}>
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full border font-medium",
                        done &&
                          "border-emerald-400/70 bg-emerald-50 text-emerald-600 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300",
                        active && "border-primary bg-primary/10 text-primary",
                        !done && !active && "border-border text-muted-foreground",
                      )}
                    >
                      {done ? <CheckIcon className="size-3" /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        active ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                    {index < ANALYSIS_STEPS.length - 1 ? (
                      <span className="text-muted-foreground/50">›</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
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
          {hasReviewPreview ? (
            <div className="w-full max-w-lg rounded-lg border bg-background/85 p-4 text-left shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-medium text-foreground text-sm">简历评价预览</p>
                {pipeline.isGeneratingReview ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary">
                    生成中
                  </span>
                ) : null}
              </div>
              <div
                className="max-h-56 overflow-y-auto pr-2"
                onScroll={(event) => {
                  shouldAutoScrollReviewPreviewRef.current = isNearScrollBottom(
                    event.currentTarget,
                  );
                }}
                ref={reviewPreviewRef}
              >
                <MarkdownView
                  className="text-muted-foreground text-sm [&_h1]:text-base [&_h2]:text-[15px] [&_h3]:text-sm"
                  content={pipeline.reviewPreview}
                />
              </div>
            </div>
          ) : null}
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
