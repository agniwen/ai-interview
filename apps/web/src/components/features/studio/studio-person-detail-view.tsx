/* oxlint-disable no-explicit-any complexity -- shell view adapts the controller model to legacy shell slots. */
"use client";

// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// shell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via shell — Modal, full-page layout, or any custom frame.

import { CandidateActionDock } from "./candidate-action-dock/candidate-action-dock";
import { createPortal } from "react-dom";
import { cn } from "@app/shared/utils";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs } from "@/components/ui/tabs";
import { useHydrated } from "@/hooks/use-hydrated";

import type { StudioPersonDetailSlots, StudioPersonDetailTab } from "./studio-person-detail-model";
import { InterviewReportMetadataDialog } from "./studio-person-detail-metadata";
import type { StudioPersonDetailViewModel } from "./studio-person-detail-controller";
import { StudioPersonDetailBody } from "./studio-person-detail-body";
import { HumanInterviewQuestionDialog } from "./resumes/launch-interview-dialog";

const DETAIL_TABS = {
  "ai-analysis": true,
  experience: true,
  "human-interview": true,
  instructions: true,
  offer: true,
  onboarding: true,
  overview: true,
  rounds: true,
  transcript: true,
} satisfies Record<StudioPersonDetailTab, boolean>;

function isStudioPersonDetailTab(value: string): value is StudioPersonDetailTab {
  return value in DETAIL_TABS;
}

export function StudioPersonDetailView({ model }: { model: StudioPersonDetailViewModel }) {
  const isHydrated = useHydrated();
  const {
    activeTab,
    canViewReportMetadata,
    confirmResetSubmission,
    description,
    dispatchUi,
    floatingActionBar,
    floatingActionBarPlacement,
    headerExtra,
    humanInterviewQuestionDialogOpen,
    isLoading,
    isPublic,
    metadataReport,
    mode,
    onConfirmHumanInterviewQuestions,
    onHumanInterviewQuestionDialogOpenChange,
    pendingResetSubmissionId,
    setActiveTab,
    setMetadataReport,
    shell,
    title,
  } = model;

  const body = <StudioPersonDetailBody model={model} />;
  const actionDock = floatingActionBar ? (
    <CandidateActionDock
      placement={floatingActionBarPlacement}
      key={`${model.slug}:${model.record?.id}`}
      candidateName={model.record?.candidateName ?? "候选人"}
    >
      {floatingActionBar}
      <HumanInterviewQuestionDialog
        candidateName={model.record?.candidateName ?? null}
        onConfirmed={onConfirmHumanInterviewQuestions}
        onOpenChange={onHumanInterviewQuestionDialogOpenChange}
        open={humanInterviewQuestionDialogOpen}
        recordId={model.record?.id ?? null}
      />
    </CandidateActionDock>
  ) : null;
  const footer = null;
  // 悬浮操作栏盖在弹窗底部，给主体留出同等空间，避免遮住最后的内容。
  // Reserve room under the in-modal dock so it never covers the last content.
  const bodyClassName =
    floatingActionBar && floatingActionBarPlacement === "container"
      ? "pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
      : undefined;
  const modalClassName = "sm:rounded-2xl";
  let modalSize: StudioPersonDetailSlots["modalSize"] = "full";
  if (mode === "resume") {
    modalSize = "3xl";
  }
  return (
    <>
      <Tabs
        className={cn(
          floatingActionBar &&
            floatingActionBarPlacement === "viewport" &&
            "pb-[calc(14rem+env(safe-area-inset-bottom))] md:pb-[calc(7rem+env(safe-area-inset-bottom))]",
        )}
        onValueChange={(value) => {
          if (isStudioPersonDetailTab(value)) {
            setActiveTab(value);
          }
        }}
        value={activeTab}
      >
        {shell({
          body,
          bodyClassName,
          description,
          footer,
          headerExtra,
          isLoading,
          modalClassName,
          modalSize,
          // 弹窗里悬浮操作栏相对弹窗居中，交给外壳渲染在弹窗内部。
          // In a modal the dock is rendered by the shell inside the modal so it centers there.
          overlay: floatingActionBarPlacement === "container" ? actionDock : null,
          title,
        })}
      </Tabs>
      {isHydrated && floatingActionBarPlacement === "viewport"
        ? createPortal(actionDock, document.body)
        : null}
      {mode === "interview" && canViewReportMetadata ? (
        <InterviewReportMetadataDialog
          onOpenChange={(open) => {
            if (!open) {
              setMetadataReport(null);
            }
          }}
          report={metadataReport}
        />
      ) : null}
      {mode === "resume" && !floatingActionBar ? (
        <HumanInterviewQuestionDialog
          candidateName={model.record?.candidateName ?? null}
          onConfirmed={onConfirmHumanInterviewQuestions}
          onOpenChange={onHumanInterviewQuestionDialogOpenChange}
          open={humanInterviewQuestionDialogOpen}
          recordId={model.record?.id ?? null}
        />
      ) : null}
      {mode === "interview" && !isPublic ? (
        <AlertDialog
          onOpenChange={(next) => {
            if (!next) {
              dispatchUi({ id: null, type: "pendingResetSubmissionChanged" });
            }
          }}
          open={pendingResetSubmissionId !== null}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>重置面试表单填写？</AlertDialogTitle>
              <AlertDialogDescription>
                候选人本份面试表单的答复将被删除，下次进入面试时需要重新填写。该操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  confirmResetSubmission();
                }}
              >
                确认重置
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
