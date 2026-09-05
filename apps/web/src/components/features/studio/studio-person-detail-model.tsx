"use client";

// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// shell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via shell — Modal, full-page layout, or any custom frame.

import type { CandidateFormSubmissionWithSnapshot } from "@app/db-schema/candidate-forms";
import type { StudioInterviewConversationReport } from "@app/db-schema/interview-session";
import type { StudioInterviewRoundDetail } from "@app/shared/studio-interview-rounds";
import type { QueryClient } from "@tanstack/react-query";

import type { ReactNode } from "react";
import { z } from "zod";
import { cossWhisperShadowClass } from "@/components/ui/coss-style";
import type { PipelineStage } from "@app/db-schema/studio-interviews";

export const DETAIL_PAGE_FLOATING_ACTION_CLASS = `relative border border-border/50 bg-background/80 bg-clip-padding backdrop-blur-lg ${cossWhisperShadowClass}`;

export type StudioPersonDetailMode = "interview" | "resume";
export type StudioPersonDetailLayoutMode = "modal" | "page";

/**
 * 数据来源 + 是否可写。"authed" 走 `/api/w/:slug/studio/*` 既有路由族；
 * "public" 走 `/api/public/*`，所有写操作 UI 被隐藏。
 * "review" 走 workspace 成员级详情 API，给详情链接访问者使用。
 *
 * Data source + write capability.
 * "authed" routes through the existing workspace-scoped API; "public" hits
 * the slug-less `/api/public/*` mirrors and hides all write UI.
 * "review" uses workspace member-scoped detail APIs for reviewer links.
 */
export type StudioPersonDetailAccessMode = "authed" | "public" | "review";

export type StudioPersonDetailTab =
  | "overview"
  | "ai-analysis"
  | "rounds"
  | "human-interview"
  | "offer"
  | "experience"
  | "instructions"
  | "transcript";

const cachedCandidateRecordSchema = z.object({
  candidateName: z.string(),
  id: z.string(),
});
const cachedCandidateRecordsSchema = z.object({
  records: z.array(cachedCandidateRecordSchema),
});
const cachedCandidatePagesSchema = z.object({
  pages: z.array(cachedCandidateRecordsSchema),
});

type CachedCandidateRecord = z.infer<typeof cachedCandidateRecordSchema>;

export function shouldShowAiInterviewTab(record: { pipelineStage?: string } | null): boolean {
  if (!record?.pipelineStage) {
    return false;
  }
  return ["ai_interview", "human_interview", "offer", "closed"].includes(record.pipelineStage);
}

// 真人复面 / Offer tab 的可见性：阶段已到达或经过时才显示，避免新候选人页面噪音。
// 关闭后仍显示（HR 想回看历史 / 重新激活时直接点）。
// Human-interview tab is visible once the candidate has reached or passed that
// stage; remains visible after close for HR audit and reactivation.
export function shouldShowHumanInterviewTab(
  record: { pipelineStage?: string } | null,
  canReadHumanInterview: boolean,
): boolean {
  if (!canReadHumanInterview) {
    return false;
  }
  if (!record?.pipelineStage) {
    return false;
  }
  return ["human_interview", "offer", "closed"].includes(record.pipelineStage);
}

export function shouldShowOfferTab(
  record: { pipelineStage?: string } | null,
  canReadOffer: boolean,
): boolean {
  if (!canReadOffer) {
    return false;
  }
  if (!record?.pipelineStage) {
    return false;
  }
  return ["offer", "closed"].includes(record.pipelineStage);
}

function readCandidateNameFromRecord(
  record: CachedCandidateRecord,
  recordId: string,
): string | null {
  if (record.id !== recordId) {
    return null;
  }
  return record.candidateName.trim() || null;
}

function readCandidateNameFromRecords(
  records: CachedCandidateRecord[],
  recordId: string,
): string | null {
  for (const record of records) {
    const candidateName = readCandidateNameFromRecord(record, recordId);
    if (candidateName) {
      return candidateName;
    }
  }
  return null;
}

export function findCachedResumeCandidateName(queryClient: QueryClient, recordId: string | null) {
  if (!recordId) {
    return null;
  }
  for (const [, data] of queryClient.getQueriesData({ queryKey: ["studio-resumes"] })) {
    const directRecords = cachedCandidateRecordsSchema.safeParse(data);
    if (directRecords.success) {
      const directName = readCandidateNameFromRecords(directRecords.data.records, recordId);
      if (directName) {
        return directName;
      }
    }

    const pages = cachedCandidatePagesSchema.safeParse(data);
    if (!pages.success) {
      continue;
    }
    for (const page of pages.data.pages) {
      const pageName = readCandidateNameFromRecords(page.records, recordId);
      if (pageName) {
        return pageName;
      }
    }
  }
  return null;
}

export function tabForPipelineStage(stage: PipelineStage): StudioPersonDetailTab {
  if (stage === "human_interview") {
    return "human-interview";
  }
  if (stage === "offer") {
    return "offer";
  }
  if (stage === "ai_interview") {
    return "rounds";
  }
  return "overview";
}

/**
 * shell 接收的可填槽位。footer 仅简历模式有值 ——
 * 面试模式的「编辑候选人信息」按钮是嵌在概览 tab 内部的,不走 footer。
 *
 * Slots passed to shell. footer is only populated in resume mode —
 * the interview-mode "edit candidate" button is embedded inside the overview
 * tab and does not flow through this slot.
 */
export interface StudioPersonDetailControllerProps {
  accessMode?: StudioPersonDetailAccessMode;
  defaultTab?: StudioPersonDetailTab;
  enabled?: boolean;
  layoutMode?: StudioPersonDetailLayoutMode;
  mode: StudioPersonDetailMode;
  onEdit?: (recordId: string) => void;
  onClose?: () => void;
  onLaunchInterview?: (input: { id: string; candidateName: string | null }) => void;
  onRequestClose?: (input: {
    id: string;
    candidateName: string | null;
    initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
  }) => void;
  onRequestReactivate?: (input: { id: string; candidateName: string | null }) => void;
  onTabChange?: (tab: StudioPersonDetailTab) => void;
  onUpdated?: () => void;
  recordId?: string | null;
  roundId?: string | null;
  shell: (slots: StudioPersonDetailSlots) => ReactNode;
}

export interface StudioPersonDetailSlots {
  title: ReactNode;
  description: ReactNode;
  headerExtra: ReactNode;
  body: ReactNode;
  bodyClassName?: string;
  isLoading: boolean;
  modalClassName?: string;
  modalSize?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
  footer: ReactNode;
}

export function renderHeaderDescription({
  isLoading,
  round,
}: {
  isLoading: boolean;
  round: StudioInterviewRoundDetail | null | undefined;
}) {
  if (round) {
    return (
      <>
        {round.candidate.targetRole ?? "待识别岗位"}
        {" · "}
        {round.candidate.resumeFileName ?? "未上传简历"}
      </>
    );
  }
  return isLoading ? "正在加载候选人详情..." : "暂无可展示的候选人详情。";
}

export interface EvaluationSummary {
  overallScore: number | null;
  recommendation: string | null;
  overallAssessment: string | null;
}

export type FormQuestion = CandidateFormSubmissionWithSnapshot["snapshot"]["questions"][number];

export interface CollectedCandidateInfoItem {
  analysis: string | null;
  answers: string[];
  id: string;
  kind: "form" | "interview";
  question: string;
  sequence: number;
}

export type ReportSnapshotMetadata = NonNullable<
  StudioInterviewConversationReport["snapshotMetadata"]
>;
export type ReportFullTextInput = NonNullable<ReportSnapshotMetadata["fullTextInput"]>;
