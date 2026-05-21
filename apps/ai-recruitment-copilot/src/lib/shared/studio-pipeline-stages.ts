// 候选人后期 pipeline（真人复面 / Offer / 已结案）的共享 DTO 类型。
// DAO 与 client API 都从这里取，避免双方各自定义产生漂移。
// Shared DTOs for the late-pipeline stages (human interview / offer / closed).
// Imported by both DAO and client; single source of truth.

import type {
  HumanInterviewFormat,
  HumanInterviewRoundOutcome,
  HumanInterviewRoundStatus,
  OfferDraftStatus,
} from "@arc/db-schema/studio-interviews";

/**
 * 真人复面单轮 DTO（DAO 返回 + 客户端消费）。
 * 时间字段统一序列化为 ISO 字符串；interviewers 是已 join 过 user 表的精简投影。
 *
 * Single-round human interview DTO. Dates serialized as ISO strings;
 * interviewers are pre-joined user info.
 */
export interface HumanInterviewRoundRecord {
  id: string;
  interviewRecordId: string;
  organizationId: string;
  sortOrder: number;
  label: string;
  format: HumanInterviewFormat;
  location: string | null;
  meetingUrl: string | null;
  scheduledAt: string | null;
  status: HumanInterviewRoundStatus;
  outcome: HumanInterviewRoundOutcome | null;
  score: number | null;
  feedback: string | null;
  notes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  interviewers: { id: string; name: string; image: string | null }[];
}

/**
 * Offer 草稿单版本 DTO（DAO 返回 + 客户端消费）。
 *
 * Offer draft DTO. Versioned per candidate; latest non-superseded is the
 * "current" offer in the UI.
 */
export interface OfferDraftRecord {
  id: string;
  interviewRecordId: string;
  organizationId: string;
  version: number;
  status: OfferDraftStatus;
  baseSalary: number;
  currency: string;
  bonus: number | null;
  equity: string | null;
  position: string;
  joiningDate: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  responseAt: string | null;
  candidateCounter: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
