"use client";

import { IconHelp, IconLoader2 } from "@tabler/icons-react";
import type { JobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type { JobDescriptionDeductionRules } from "@arc/db-schema/job-description-structured-config";
import { cn } from "@arc/shared/utils";
import { Button } from "@/components/ui/button";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT,
  JOB_DESCRIPTION_MARKDOWN_MAX_HEIGHT,
} from "./job-description-form-values";
import { JobEvaluationBlueprintPreview } from "./job-evaluation-blueprint-preview";

export function JobDescriptionEvaluationSection({
  deductionRules,
  evaluationFrozen,
  handleGeneratePreview,
  isGeneratingPreview,
  isSubmitting,
  missingRefs,
  preview,
  ruleDraft,
  streamingRuleDraft,
}: {
  deductionRules: JobDescriptionDeductionRules;
  evaluationFrozen: boolean;
  handleGeneratePreview: () => void;
  isGeneratingPreview: boolean;
  isSubmitting: boolean;
  missingRefs: boolean;
  preview: { blueprint: unknown; blueprintHash: string } | null;
  ruleDraft: JobEvaluationRuleDraft | null;
  streamingRuleDraft: JobEvaluationRuleDraft | null;
}) {
  let displayedRuleDraft = preview && ruleDraft ? ruleDraft : streamingRuleDraft;
  if (isGeneratingPreview && streamingRuleDraft) {
    displayedRuleDraft = streamingRuleDraft;
  }
  return (
    <Field className="contents">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <FieldLabel>评分规则</FieldLabel>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label="查看评分规则说明"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  type="button"
                >
                  <IconHelp className="size-3.5" />
                </button>
              }
            />
            <TooltipContent className="max-w-72" side="top">
              {evaluationFrozen
                ? "发布后评分规则只读，可滚动查看完整内容。"
                : "根据岗位 JD 和下方结构化设置生成，核对后发布。"}
            </TooltipContent>
          </Tooltip>
        </div>
        {evaluationFrozen ? null : (
          <Button
            disabled={isGeneratingPreview || isSubmitting || missingRefs}
            onClick={handleGeneratePreview}
            size="sm"
            type="button"
            variant="outline"
          >
            {isGeneratingPreview ? <IconLoader2 className="size-4 animate-spin" /> : null}
            {isGeneratingPreview ? "生成中…" : `${preview ? "重新" : ""}生成评分规则`}
          </Button>
        )}
      </div>
      <FieldContent
        className="h-full min-h-0 gap-1"
        style={{ maxHeight: JOB_DESCRIPTION_MARKDOWN_MAX_HEIGHT }}
      >
        {displayedRuleDraft ? (
          <JobEvaluationBlueprintPreview
            className="min-h-0 flex-1"
            deductionRules={deductionRules}
            height={null}
            ruleDraft={displayedRuleDraft}
          />
        ) : (
          <div
            className={cn(
              cossFieldSurfaceClass,
              "flex min-h-0 flex-1 items-center justify-center border-dashed p-4 text-center text-muted-foreground text-sm",
            )}
            style={{ minHeight: JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT }}
          >
            填写岗位 JD 和结构化设置后，点击“生成评分规则”查看结果。
          </div>
        )}
      </FieldContent>
    </Field>
  );
}
