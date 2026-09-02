// 候选人后期 pipeline（真人复面 / Offer / 已结束）的共享 DTO 类型。
// DAO 与 client API 都从这里取，避免双方各自定义产生漂移。
// Shared DTOs for the late-pipeline stages (human interview / offer / closed).
// Imported by both DAO and client; single source of truth.

import type { CandidateInterviewInvitationStatus } from "@arc/db-schema/interview-notifications";
import type {
  FinalMeetingTranscriptRevision,
  MeetingTranscriptState,
} from "./meeting-transcription";
import type {
  FeishuHumanInterviewProviderId,
  FeishuHumanInterviewSyncStatus,
  HumanInterviewEvaluation,
  HumanInterviewEvaluationRating,
  HumanInterviewEvaluationStatus,
  HumanInterviewMeetingLifecycleSource,
  HumanInterviewMeetingInterviewerRole,
  HumanInterviewMeetingStatus,
  HumanInterviewRecordingStatus,
  HumanInterviewerAssignmentStatus,
  HumanInterviewFormat,
  HumanInterviewRoundOutcome,
  HumanInterviewRoundStatus,
  OfferDraftStatus,
} from "@arc/db-schema/studio-interviews";

export interface PublicAiInterviewInvitationPreview {
  candidateName: string;
  companyName: string;
  expiresAt: string;
  jobName: string | null;
  roundName: string;
  scheduledAt: string | null;
  status: CandidateInterviewInvitationStatus;
}

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
  evaluation: HumanInterviewEvaluation | null;
  evaluationOverall: string | null;
  evaluationRating: HumanInterviewEvaluationRating | null;
  evaluationError: string | null;
  evaluationStatus: HumanInterviewEvaluationStatus;
  evaluationSubmittedAt: string | null;
  evaluationTranscriptRevisionId: string | null;
  evaluationUpdatedAt: string | null;
  evaluationUpdatedBy: string | null;
  notes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  interviewers: HumanInterviewRoundInterviewerRecord[];
}

export interface HumanInterviewRoundInterviewerRecord {
  confirmedAt: string | null;
  confirmedScheduleVersion: number | null;
  declineReason: string | null;
  declinedAt: string | null;
  id: string;
  image: string | null;
  name: string;
  status: HumanInterviewerAssignmentStatus;
}

export interface HumanInterviewMeetingRoundRecord {
  roundId: string;
  interviewRecordId: string;
  candidateName: string;
  label: string;
  sortOrder: number;
  status: HumanInterviewRoundStatus;
  candidateInviteExpiresAt: string | null;
  candidateInviteStatus: CandidateInterviewInvitationStatus;
  hasCandidateInvite: boolean;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface HumanInterviewMeetingInterviewerRecord {
  id: string;
  name: string;
  image: string | null;
  role: HumanInterviewMeetingInterviewerRole;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface FeishuHumanInterviewMeetingSync {
  appLink: string | null;
  calendarEventUrl: string | null;
  meetingUrl: string | null;
  providerId: FeishuHumanInterviewProviderId;
  status: FeishuHumanInterviewSyncStatus;
}

export interface HumanInterviewMeetingRecord {
  id: string;
  organizationId: string;
  title: string;
  liveKitRoomName: string | null;
  lifecycleOccurredAt: string | null;
  lifecycleSource: HumanInterviewMeetingLifecycleSource | null;
  scheduledAt: string | null;
  status: HumanInterviewMeetingStatus;
  startedAt: string | null;
  endedAt: string | null;
  validUntil: string | null;
  cancelledAt: string | null;
  recordingEgressId: string | null;
  recordingDurationMs: number | null;
  recordingError: string | null;
  recordingFileKey: string | null;
  recordingSizeBytes: number | null;
  recordingStatus: HumanInterviewRecordingStatus;
  processingMeetingSessionId: string | null;
  scheduleVersion: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  feishu: FeishuHumanInterviewMeetingSync | null;
  updatedAt: string;
  rounds: HumanInterviewMeetingRoundRecord[];
  interviewers: HumanInterviewMeetingInterviewerRecord[];
}

export interface HumanInterviewMeetingCandidateLinkRecord {
  candidateName: string;
  expiresAt: string;
  interviewRecordId: string;
  roundId: string;
  roundLabel: string;
  url: string;
}

export interface HumanInterviewMeetingInterviewerLinkRecord {
  name: string;
  role: HumanInterviewMeetingInterviewerRole;
  url: string;
  userId: string;
}

export interface HumanInterviewMeetingLinkBundle {
  candidateLinks: HumanInterviewMeetingCandidateLinkRecord[];
  feishu: FeishuHumanInterviewMeetingSync | null;
  interviewerLinks: HumanInterviewMeetingInterviewerLinkRecord[];
  meetingId: string;
  title: string;
}

export type HumanInterviewMeetingParticipantRole =
  | "candidate"
  | HumanInterviewMeetingInterviewerRole;

export interface HumanInterviewMeetingTokenResponse {
  participantName: string;
  participantRole: HumanInterviewMeetingParticipantRole;
  participantToken: string;
  roomName: string;
  serverUrl: string;
}

export interface PublicHumanInterviewMeetingPreview {
  candidateInviteStatus: CandidateInterviewInvitationStatus;
  candidateName: string;
  meetingId: string;
  recordingStatus: HumanInterviewRecordingStatus;
  roundLabel: string;
  scheduledAt: string | null;
  validUntil: string | null;
  status: HumanInterviewMeetingStatus;
  title: string;
}

export interface PublicHumanInterviewInterviewerPreview {
  candidateName: string;
  interviewerName: string;
  meetingId: string;
  recordingStatus: HumanInterviewRecordingStatus;
  role: HumanInterviewMeetingInterviewerRole;
  roundLabel: string;
  scheduledAt: string | null;
  validUntil: string | null;
  status: HumanInterviewMeetingStatus;
  title: string;
}

export interface HumanInterviewReviewRecord {
  evaluation: HumanInterviewEvaluation | null;
  evaluationError: string | null;
  evaluationStatus: HumanInterviewEvaluationStatus;
  evaluationUpdatedAt: string | null;
  evaluationUpdatedBy: string | null;
  meetingSessionId: string | null;
  outcome: HumanInterviewRoundOutcome | null;
  roundId: string;
  roundStatus: HumanInterviewRoundStatus;
  transcript: FinalMeetingTranscriptRevision | null;
  transcriptionError: string | null;
  transcriptionState: MeetingTranscriptState;
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
