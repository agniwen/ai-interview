"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type { JobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type { JobDescriptionDeductionRules } from "@arc/db-schema/job-description-structured-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  ruleDraftDirty,
  setDeductionRules,
  setRuleDraft,
  setRuleDraftDirty,
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
  ruleDraftDirty: boolean;
  setDeductionRules: (rules: JobDescriptionDeductionRules) => void;
  setRuleDraft: (draft: JobEvaluationRuleDraft) => void;
  setRuleDraftDirty: (dirty: boolean) => void;
  streamingRuleDraft: JobEvaluationRuleDraft | null;
}) {
  let displayedRuleDraft = preview && ruleDraft ? ruleDraft : streamingRuleDraft;
  if (isGeneratingPreview && streamingRuleDraft) {
    displayedRuleDraft = streamingRuleDraft;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">评分规则</p>
          <p className="text-muted-foreground text-xs">
            根据岗位 JD 和下方结构化设置生成，可继续编辑并核对后发布。
          </p>
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
      {displayedRuleDraft ? (
        <div className="flex flex-col gap-2">
          {preview && ruleDraftDirty ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800 text-xs dark:bg-amber-950/30 dark:text-amber-300">
              评分规则有未保存修改，保存岗位后才可发布。
            </p>
          ) : null}
          <JobEvaluationBlueprintPreview
            deductionRules={deductionRules}
            disabled={evaluationFrozen || isGeneratingPreview}
            onDeductionRulesChange={(nextDeductionRules) => {
              setDeductionRules(nextDeductionRules);
              setRuleDraftDirty(true);
            }}
            onRuleDraftChange={(nextRuleDraft) => {
              setRuleDraft(nextRuleDraft);
              setRuleDraftDirty(true);
            }}
            ruleDraft={displayedRuleDraft}
          />
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex min-h-28 items-center justify-center p-4 text-center text-muted-foreground text-sm">
            填写岗位 JD 和结构化设置后，点击“生成评分规则”查看结果。
          </CardContent>
        </Card>
      )}
    </div>
  );
}
