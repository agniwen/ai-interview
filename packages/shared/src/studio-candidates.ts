// 候选人聚合视图（"管理记录"）。
// 字段集合等同于原 StudioInterviewRecord，但**不含** scheduleEntries 与 interviewLink
// —— 这两个属于 round 层，由 studio-interview-rounds.ts 负责。
//
// Candidate aggregate view ("management record"). Mirrors the legacy
// StudioInterviewRecord field set but **omits** scheduleEntries and
// interviewLink, which now live on the round-side type.

import type { ResumeAnalysisResult } from "@app/db-schema/interview/types";
import type { CandidateOutcome, PipelineStage } from "@app/db-schema/studio-interviews";

export interface StudioCandidateRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  // 流转阶段 / outcome：用于判断 AI 面试相关操作是否已经被锁定。
  // Pipeline axes; used to lock AI-stage actions once the candidate has moved on.
  pipelineStage: PipelineStage;
  outcome: CandidateOutcome;
  resumeContentHash: string | null;
  resumeFileName: string | null;
  resumeProfile: ResumeAnalysisResult["resumeProfile"] | null;
  resumeStorageKey: string | null;
  interviewQuestions: ResumeAnalysisResult["interviewQuestions"];
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  notes: string | null;
  createdBy: string | null;
  creatorName: string | null;
  creatorOrganizationName: string | null;
  createdAt: string;
  updatedAt: string;
}
