"use client";

import { useEffect, useState } from "react";
import {
  DetailTitleSkeleton,
  DetailHeaderSkeleton,
  DetailBodySkeleton,
  InterviewResultFramesSkeleton,
} from "./studio-person-detail-skeletons";

// 弹窗形态的候选人详情入口。所有业务渲染都在 StudioPersonDetailPanel 里;
// 这里只把 panel 的 5 个 slot 喂给 <Modal>,保持现有调用方 API 不变。
//
// Modal wrapper around StudioPersonDetailPanel. All business rendering lives
// in the panel; this file only routes the panel's slots into <Modal> so the
// component's external API is unchanged for existing call sites.

import { Modal } from "@/components/ui/modal";
import {
  LazyStudioPersonDetailPanel as StudioPersonDetailPanel,
  preloadStudioPersonDetailPanel,
} from "./lazy-studio-person-detail-panel";
import type { StudioPersonDetailMode, StudioPersonDetailTab } from "./studio-person-detail-panel";

export function StudioPersonDetailDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  onUpdated,
  onEdit,
  onLaunchInterview,
  onRequestClose,
  onRequestReactivate,
  recordId,
  roundId,
  mode,
  defaultTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  /** 轮次级写操作（toggle / reset）成功后调用。/ Called after a round-level write (toggle / reset). */
  onUpdated?: () => void;
  onEdit?: (recordId: string) => void;
  /**
   * 简历模式下点「发起 AI初面」时调用；提供后改为 in-place 弹出
   * LaunchInterviewDialog，不再 router.push 到 /studio/interviews。
   *
   * Resume-mode "launch AI interview" callback. When provided, the button
   * delegates to the caller's LaunchInterviewDialog instead of routing.
   */
  onLaunchInterview?: (input: { id: string; candidateName: string | null }) => void;
  /** 简历模式 action bar 点「标记结束」时回调。/ Action-bar 标记结束 callback. */
  onRequestClose?: (input: {
    id: string;
    candidateName: string | null;
    initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
  }) => void;
  /** 简历模式 action bar 点「重新激活」时回调。/ Action-bar 重新激活 callback. */
  onRequestReactivate?: (input: { id: string; candidateName: string | null }) => void;
  /**
   * 候选人级 id (studio_interview.id)。简历模式必传;面试模式可作为兜底入口,
   * Panel 会通过 resolver 转成最新一轮 roundId。
   *
   * Candidate-level id (studio_interview.id). Required in resume mode; in
   * interview mode it works as a fallback the Panel resolves to the latest roundId.
   */
  recordId?: string | null;
  /**
   * 轮次级 id (studio_interview_schedule.id)。面试模式优先使用;简历模式忽略。
   * Round-level id (studio_interview_schedule.id). Preferred in interview mode; ignored in resume mode.
   */
  roundId?: string | null;
  mode: StudioPersonDetailMode;
  /**
   * 中文：打开时默认聚焦的 tab；不传时回退到 "overview"。
   * English: Default-focused tab when opened; falls back to "overview".
   */
  defaultTab?: StudioPersonDetailTab;
}) {
  // Panel 以 recordId/roundId 作为 key 重建会话；关闭时调用方会清空 id，这里保留
  // 最后一次打开的 id，让同一个 Modal 实例播完退场动画而不是被立即卸载。
  // / The panel keys its session by ids. Callers clear the ids on close, so keep the
  // last opened ids while closed and let the same Modal instance play its exit animation.
  // 预取详情 chunk，避免首次打开时骨架 Modal 与正式 Modal 先后各播一次入场动画。
  // / Preload the detail chunk so the first open does not animate the skeleton and real modal twice.
  useEffect(() => {
    void preloadStudioPersonDetailPanel();
  }, []);

  const [displayedIds, setDisplayedIds] = useState({ recordId, roundId });
  if (open && (displayedIds.recordId !== recordId || displayedIds.roundId !== roundId)) {
    setDisplayedIds({ recordId, roundId });
  }

  return (
    <StudioPersonDetailPanel
      defaultTab={defaultTab}
      enabled={open}
      fallback={
        open ? (
          <Modal
            onOpenChange={onOpenChange}
            onOpenChangeComplete={onOpenChangeComplete}
            open
            size={mode === "resume" ? "3xl" : "full"}
            className="sm:rounded-2xl"
            headerClassName="pb-0"
            headerExtra={<DetailHeaderSkeleton mode={mode} />}
            title={
              <>
                <span className="sr-only">候选人详情正在加载</span>
                <DetailTitleSkeleton />
              </>
            }
          >
            <output aria-busy="true" aria-label="候选人详情正在加载" className="block">
              {mode === "interview" ? (
                <InterviewResultFramesSkeleton />
              ) : (
                <DetailBodySkeleton mode={mode} />
              )}
            </output>
          </Modal>
        ) : null
      }
      mode={mode}
      onClose={() => onOpenChange(false)}
      onEdit={onEdit}
      onLaunchInterview={onLaunchInterview}
      onRequestClose={onRequestClose}
      onRequestReactivate={onRequestReactivate}
      onUpdated={onUpdated}
      recordId={displayedIds.recordId}
      roundId={displayedIds.roundId}
      shell={({
        body,
        bodyClassName,
        description,
        footer,
        headerExtra,
        modalClassName,
        modalSize,
        title,
      }) => (
        <Modal
          bodyClassName={bodyClassName}
          className={modalClassName}
          description={description}
          footer={mode === "resume" ? footer : undefined}
          headerExtra={headerExtra}
          headerClassName="pb-0"
          onOpenChange={onOpenChange}
          onOpenChangeComplete={onOpenChangeComplete}
          open={open}
          size={modalSize ?? (mode === "resume" ? "2xl" : "full")}
          title={title}
        >
          {body}
        </Modal>
      )}
    />
  );
}
