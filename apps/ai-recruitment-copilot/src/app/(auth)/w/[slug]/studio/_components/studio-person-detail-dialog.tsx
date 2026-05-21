"use client";

// 弹窗形态的候选人详情入口。所有业务渲染都在 StudioPersonDetailPanel 里;
// 这里只把 panel 的 5 个 slot 喂给 <Modal>,保持现有调用方 API 不变。
//
// Modal wrapper around StudioPersonDetailPanel. All business rendering lives
// in the panel; this file only routes the panel's slots into <Modal> so the
// component's external API is unchanged for existing call sites.

import { Modal } from "@/components/ui/modal";
import { StudioPersonDetailPanel } from "./studio-person-detail-panel";
import type { StudioPersonDetailMode, StudioPersonDetailTab } from "./studio-person-detail-panel";

export function StudioPersonDetailDialog({
  open,
  onOpenChange,
  onUpdated,
  onEdit,
  onLaunchInterview,
  onRequestClose,
  onRequestReactivate,
  recordId,
  roundId,
  mode,
  defaultTab,
  onViewRoundDetail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 轮次级写操作（toggle / reset）成功后调用。/ Called after a round-level write (toggle / reset). */
  onUpdated?: () => void;
  onEdit?: (recordId: string) => void;
  /**
   * 简历模式下点「发起 AI 面试」时调用；提供后改为 in-place 弹出
   * LaunchInterviewDialog，不再 router.push 到 /studio/interviews。
   *
   * Resume-mode "launch AI interview" callback. When provided, the button
   * delegates to the caller's LaunchInterviewDialog instead of routing.
   */
  onLaunchInterview?: (input: { id: string; candidateName: string | null }) => void;
  /** 简历模式 action bar 点「标记结案」时回调。/ Action-bar 标记结案 callback. */
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
  /**
   * 中文：在 resume 模式的「AI 面试轮次」tab 里点单条轮次的「查看详情」时触发。
   * 调用方应自己关闭本弹窗并以 mode="interview" 重新打开。
   * English: Fired from the per-round 查看详情 button inside the resume-mode
   * "AI 面试轮次" tab. The caller should close this dialog and re-open it in
   * mode="interview" using the given roundId.
   */
  onViewRoundDetail?: (roundId: string) => void;
}) {
  return (
    <StudioPersonDetailPanel
      defaultTab={defaultTab}
      enabled={open}
      mode={mode}
      onClose={() => onOpenChange(false)}
      onEdit={onEdit}
      onLaunchInterview={onLaunchInterview}
      onRequestClose={onRequestClose}
      onRequestReactivate={onRequestReactivate}
      onUpdated={onUpdated}
      onViewRoundDetail={onViewRoundDetail}
      recordId={recordId}
      roundId={roundId}
      renderShell={({ body, description, footer, headerExtra, title }) => (
        <Modal
          description={description}
          footer={mode === "resume" ? footer : undefined}
          headerExtra={headerExtra}
          onOpenChange={onOpenChange}
          open={open}
          size={mode === "resume" ? "lg" : "full"}
          title={title}
        >
          {body}
        </Modal>
      )}
    />
  );
}
