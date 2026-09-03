import { z } from "zod";

export const interviewNotificationEventTypeValues = [
  "ai_interview_invited",
  "ai_invitation_accepted",
  "ai_invitation_declined",
  "ai_invitation_exception",
  "ai_interview_reminder",
  "ai_interview_completed",
  "ai_report_ready",
  "ai_report_failed",
  "human_interview_pending_schedule",
  "human_candidate_invitation_requested",
  "human_interviewer_confirmation_requested",
  "human_interviewer_confirmed",
  "human_interviewer_declined",
  "human_interview_confirmed",
  "human_interview_reminder",
  "human_interview_rescheduled",
  "human_invitation_accepted",
  "human_invitation_declined",
  "human_invitation_exception",
  "human_interviewer_added",
  "human_interviewer_removed",
  "human_interview_cancelled",
  "human_interview_completed",
  "human_evaluation_pending",
  "human_evaluation_summary_ready",
] as const;
export const interviewNotificationEventTypeSchema = z.enum(interviewNotificationEventTypeValues);
export type InterviewNotificationEventType = z.infer<typeof interviewNotificationEventTypeSchema>;

export const aiInvitationExceptionTypeValues = [
  "invitation_expired",
  "response_conflict",
  "system_error",
] as const;
export const aiInvitationExceptionTypeSchema = z.enum(aiInvitationExceptionTypeValues);
export type AiInvitationExceptionType = z.infer<typeof aiInvitationExceptionTypeSchema>;

export const interviewNotificationScopeTypeValues = [
  "interview_record",
  "ai_round",
  "human_meeting",
] as const;
export const interviewNotificationScopeTypeSchema = z.enum(interviewNotificationScopeTypeValues);
export type InterviewNotificationScopeType = z.infer<typeof interviewNotificationScopeTypeSchema>;

export const interviewNotificationEventStatusValues = [
  "pending",
  "processing",
  "completed",
  "failed",
  "dead",
  "cancelled",
] as const;
export const interviewNotificationEventStatusSchema = z.enum(
  interviewNotificationEventStatusValues,
);
export type InterviewNotificationEventStatus = z.infer<
  typeof interviewNotificationEventStatusSchema
>;

export const interviewNotificationChannelValues = ["feishu", "email", "sms"] as const;
export const interviewNotificationChannelSchema = z.enum(interviewNotificationChannelValues);
export type InterviewNotificationChannel = z.infer<typeof interviewNotificationChannelSchema>;

export const interviewNotificationAudienceTypeValues = [
  "candidate",
  "selected_hr_user",
  "initiator_fallback",
  "meeting_interviewer",
] as const;
export const interviewNotificationAudienceTypeSchema = z.enum(
  interviewNotificationAudienceTypeValues,
);
export type InterviewNotificationAudienceType = z.infer<
  typeof interviewNotificationAudienceTypeSchema
>;

export const interviewNotificationDeliveryStatusValues = [
  "pending",
  "sending",
  "sent",
  "failed",
  "dead",
  "unknown",
  "cancelled",
] as const;
export const interviewNotificationDeliveryStatusSchema = z.enum(
  interviewNotificationDeliveryStatusValues,
);
export type InterviewNotificationDeliveryStatus = z.infer<
  typeof interviewNotificationDeliveryStatusSchema
>;

export const interviewNotificationTemplateStatusValues = [
  "draft",
  "published",
  "archived",
] as const;
export const interviewNotificationTemplateStatusSchema = z.enum(
  interviewNotificationTemplateStatusValues,
);
export type InterviewNotificationTemplateStatus = z.infer<
  typeof interviewNotificationTemplateStatusSchema
>;

export const candidateInterviewInvitationStatusValues = [
  "pending",
  "sent",
  "accepted",
  "declined",
  "expired",
] as const;
export const candidateInterviewInvitationStatusSchema = z.enum(
  candidateInterviewInvitationStatusValues,
);
export type CandidateInterviewInvitationStatus = z.infer<
  typeof candidateInterviewInvitationStatusSchema
>;

export const interviewNotificationTemplateVariableValues = [
  "candidateName",
  "jobName",
  "companyName",
  "completionNotice",
  "roundName",
  "previousRoundName",
  "previousRoundNumber",
  "currentRoundNumber",
  "interviewType",
  "interviewStartTime",
  "interviewEndTime",
  "oldInterviewStartTime",
  "oldInterviewEndTime",
  "timeZone",
  "interviewLink",
  "initiatorName",
  "interviewerNames",
  "operatorName",
  "changeReason",
  "deadline",
  "completedAt",
  "evaluationSummary",
  "invitationStartTime",
  "invitationEndTime",
  "responseTime",
  "reminderLeadTime",
  "exceptionType",
  "occurredAt",
  "suggestedAction",
  "supportContact",
] as const;
export const interviewNotificationTemplateVariableSchema = z.enum(
  interviewNotificationTemplateVariableValues,
);
export type InterviewNotificationTemplateVariable = z.infer<
  typeof interviewNotificationTemplateVariableSchema
>;

export const interviewNotificationPayloadSnapshotSchema = z.object({
  candidateName: z.string().optional(),
  changeReason: z.string().optional(),
  companyName: z.string().optional(),
  completedAt: z.string().optional(),
  completionNotice: z.string().optional(),
  currentRoundNumber: z.number().int().positive().optional(),
  deadline: z.string().optional(),
  evaluationSummary: z.string().optional(),
  exceptionType: z.string().optional(),
  initiatorName: z.string().optional(),
  interviewEndTime: z.string().optional(),
  interviewLink: z.string().optional(),
  interviewStartTime: z.string().optional(),
  interviewType: z.enum(["ai", "human"]).optional(),
  interviewerNames: z.array(z.string()).optional(),
  invitationEndTime: z.string().optional(),
  invitationStartTime: z.string().optional(),
  jobName: z.string().optional(),
  occurredAt: z.string().optional(),
  oldInterviewEndTime: z.string().optional(),
  oldInterviewStartTime: z.string().optional(),
  operatorName: z.string().optional(),
  previousRoundName: z.string().optional(),
  previousRoundNumber: z.number().int().positive().optional(),
  reminderLeadTime: z.string().optional(),
  responseTime: z.string().optional(),
  roundName: z.string().optional(),
  schemaVersion: z.literal(1),
  suggestedAction: z.string().optional(),
  supportContact: z.string().optional(),
  timeZone: z.string().trim().min(1),
});
export type InterviewNotificationPayloadSnapshot = z.infer<
  typeof interviewNotificationPayloadSnapshotSchema
>;
