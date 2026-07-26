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

import { AnimatePresence, m } from "motion/react";
import { cn } from "@arc/shared/utils";

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

import { DETAIL_PAGE_FLOATING_ACTION_CLASS } from "./studio-person-detail-model";
import type { StudioPersonDetailSlots, StudioPersonDetailTab } from "./studio-person-detail-model";
import { InterviewReportMetadataDialog } from "./studio-person-detail-metadata";
import type { StudioPersonDetailViewModel } from "./studio-person-detail-controller";
import { StudioPersonDetailBody } from "./studio-person-detail-body";

export function StudioPersonDetailView({ model }: { model: StudioPersonDetailViewModel }) {
  const {
    activeTab,
    canUseTimelineRailScroll,
    canViewReportMetadata,
    confirmResetSubmission,
    description,
    dispatchUi,
    floatingActionBar,
    headerExtra,
    isLoading,
    isPublic,
    metadataReport,
    mode,
    pendingResetSubmissionId,
    recordId,
    reduceMotion,
    roundId,
    setActiveTab,
    setMetadataReport,
    shell,
    title,
  } = model;

  const body = <StudioPersonDetailBody model={model} />;
  const footer = null;
  const bodyClassName = canUseTimelineRailScroll ? "xl:overflow-hidden" : undefined;
  const modalClassName = cn("sm:rounded-2xl", canUseTimelineRailScroll && "xl:h-[90vh]");
  let modalSize: StudioPersonDetailSlots["modalSize"] = "full";
  if (mode === "resume") {
    modalSize = "3xl";
  }
  return (
    <>
      <Tabs
        key={`${roundId ?? recordId ?? "empty"}`}
        onValueChange={(value) => setActiveTab(value as StudioPersonDetailTab)}
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
          title,
        })}
      </Tabs>
      <AnimatePresence>
        {floatingActionBar ? (
          <m.div
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none fixed right-4 bottom-[calc(2.5rem+env(safe-area-inset-bottom))] left-4 z-40 flex justify-center"
            exit={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
            }
          >
            <div
              className={cn(
                "pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-md p-1",
                DETAIL_PAGE_FLOATING_ACTION_CLASS,
              )}
            >
              {floatingActionBar}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
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
              <AlertDialogAction onClick={() => void confirmResetSubmission()}>
                确认重置
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
