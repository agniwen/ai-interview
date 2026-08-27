"use client";

import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Dispatch } from "react";
import { toast } from "sonner";
import { reassessStudioResume, updateStudioResumeInterviewQuestions } from "@/lib/client/api";
import { runAsyncAction } from "@/lib/client/async-control";
import type {
  StudioPersonDetailAccessMode,
  StudioPersonDetailTab,
} from "./studio-person-detail-model";
import { tabForPipelineStage } from "./studio-person-detail-model";
import type { UnifiedRecord } from "./studio-person-detail-record";
import {
  advancePipelineStage,
  resetInterviewFormSubmission,
  resetInterviewRound,
  updateAllowTextInput,
} from "./studio-person-detail-sections";
import type { DetailPanelUiAction } from "./studio-person-detail-sections";

export interface UseStudioPersonDetailMutationsParams {
  accessMode: StudioPersonDetailAccessMode;
  canUseManagementActions: boolean;
  canUpdateResumeLibrary: boolean;
  dispatchUi: Dispatch<DetailPanelUiAction>;
  effectiveRecordId: string | null;
  effectiveRoundId: string | null;
  isResumeAssessmentInProgress: boolean;
  onUpdated?: () => void;
  pendingResetSubmissionId: string | null;
  queryClient: QueryClient;
  record: UnifiedRecord | null;
  resettingRoundId: string | null;
  setActiveTab: (tab: StudioPersonDetailTab) => void;
  setOptimisticPipelineStage: (stage: PipelineStage | null) => void;
  slug: string;
  updatingRoundId: string | null;
}

export function useStudioPersonDetailMutations({
  accessMode,
  canUseManagementActions,
  canUpdateResumeLibrary,
  dispatchUi,
  effectiveRecordId,
  effectiveRoundId,
  isResumeAssessmentInProgress,
  onUpdated,
  pendingResetSubmissionId,
  queryClient,
  record,
  resettingRoundId,
  setActiveTab,
  setOptimisticPipelineStage,
  slug,
  updatingRoundId,
}: UseStudioPersonDetailMutationsParams) {
  const [isReassessingResume, setIsReassessingResume] = useState(false);

  async function handleUpdateInterviewQuestions(
    interviewQuestions: InterviewQuestion[],
  ): Promise<boolean> {
    if (!(effectiveRecordId && canUpdateResumeLibrary)) {
      return false;
    }
    try {
      await updateStudioResumeInterviewQuestions(slug, effectiveRecordId, interviewQuestions);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["studio-resumes", slug, "detail", effectiveRecordId],
        }),
        queryClient.invalidateQueries({ queryKey: ["studio-interview-round", slug] }),
      ]);
      toast.success("推荐问题已保存");
      onUpdated?.();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存推荐问题失败");
      return false;
    }
  }

  async function handleReassessResume() {
    if (!(slug && effectiveRecordId) || !canUseManagementActions || isResumeAssessmentInProgress) {
      return;
    }
    setIsReassessingResume(true);
    await runAsyncAction({
      cleanup: () => setIsReassessingResume(false),
      onError: (error) => toast.error(error instanceof Error ? error.message : "重新评估失败"),
      operation: async () => {
        await reassessStudioResume(slug, effectiveRecordId);
        toast.success("已开始重新评估");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["studio-resumes"] }),
          queryClient.invalidateQueries({
            queryKey: ["studio-resumes", slug, "detail", effectiveRecordId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["studio-resumes", slug, "timeline", effectiveRecordId],
          }),
        ]);
      },
    });
  }

  async function confirmResetSubmission() {
    const submissionId = pendingResetSubmissionId;
    if (!effectiveRoundId || !submissionId) {
      return;
    }
    dispatchUi({ id: submissionId, type: "resettingSubmissionChanged" });
    dispatchUi({ id: null, type: "pendingResetSubmissionChanged" });
    const error = await resetInterviewFormSubmission({
      effectiveRoundId,
      queryClient,
      slug,
      submissionId,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success("已重置面试表单填写");
    }
    dispatchUi({ id: null, type: "resettingSubmissionChanged" });
  }

  async function handleToggleAllowTextInput(targetRoundId: string, next: boolean) {
    if (updatingRoundId) {
      return;
    }
    dispatchUi({ id: targetRoundId, type: "updatingRoundChanged" });
    const error = await updateAllowTextInput({
      next,
      queryClient,
      slug,
      targetRoundId,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success(next ? "已开启文本作答" : "已关闭文本作答");
      onUpdated?.();
    }
    dispatchUi({ id: null, type: "updatingRoundChanged" });
  }

  async function handleResetRound(targetRoundId: string) {
    if (resettingRoundId) {
      return;
    }
    dispatchUi({ id: targetRoundId, type: "resettingRoundChanged" });
    const error = await resetInterviewRound({
      queryClient,
      slug,
      targetRoundId,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success("轮次已重置为待开始");
      await queryClient.invalidateQueries({
        queryKey: ["studio-resume-rounds", slug, effectiveRecordId, accessMode],
      });
      onUpdated?.();
    }
    dispatchUi({ id: null, type: "resettingRoundChanged" });
  }

  async function handleAdvancePipelineStage(
    target: PipelineStage,
    interviewQuestions?: InterviewQuestion[],
  ): Promise<boolean> {
    if (!record) {
      return false;
    }
    const error = await advancePipelineStage({
      interviewQuestions,
      queryClient,
      recordId: record.id,
      slug,
      target,
    });
    if (error) {
      toast.error(error);
      return false;
    }
    toast.success(`已推进到「${pipelineStageMeta[target].label}」`);
    setOptimisticPipelineStage(target);
    setActiveTab(tabForPipelineStage(target));
    onUpdated?.();
    return true;
  }

  return {
    confirmResetSubmission,
    handleAdvancePipelineStage,
    handleReassessResume,
    handleResetRound,
    handleToggleAllowTextInput,
    handleUpdateInterviewQuestions,
    isReassessingResume,
  };
}
