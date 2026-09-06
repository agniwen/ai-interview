/* oxlint-disable max-lines -- schema relations remain centralized by repository convention */
import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

/* oxlint-disable max-lines -- the generated-style relation registry keeps all schema links in one auditable graph. */
export const relations = defineRelations(schema, (r) => ({
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },

  // 新招聘模型只声明详情查询、聚合子项和所属实体的导航，不为每条外键机械生成反向关系。
  // 归属完整性由 schema 外键保证；可空招聘归属的记录仍可通过轮次和工作区查询。
  // 旧档案只保留档案内部导航，不再关联在线共享资源；新域关系独立维护。
  aiInterviewConversation: {
    aiInterviewConversationTurns: r.many.aiInterviewConversationTurn({
      from: [r.aiInterviewConversation.conversationId, r.aiInterviewConversation.organizationId],
      to: [
        r.aiInterviewConversationTurn.conversationId,
        r.aiInterviewConversationTurn.organizationId,
      ],
    }),
    aiRound: r.one.aiInterviewRound({
      from: [r.aiInterviewConversation.aiRoundId, r.aiInterviewConversation.organizationId],
      to: [r.aiInterviewRound.id, r.aiInterviewRound.organizationId],
    }),
    organization: r.one.organization({
      from: r.aiInterviewConversation.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.aiInterviewConversation.recruitingRecordId,
        r.aiInterviewConversation.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // ai_interview_conversation_turn 的新域关联；旧域关系保持不变。
  aiInterviewConversationTurn: {
    conversation: r.one.aiInterviewConversation({
      from: [
        r.aiInterviewConversationTurn.conversationId,
        r.aiInterviewConversationTurn.organizationId,
      ],
      to: [r.aiInterviewConversation.conversationId, r.aiInterviewConversation.organizationId],
    }),
    organization: r.one.organization({
      from: r.aiInterviewConversationTurn.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.aiInterviewConversationTurn.recruitingRecordId,
        r.aiInterviewConversationTurn.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // ai_interview_round 的新域关联；旧域关系保持不变。
  aiInterviewRound: {
    contextSnapshots: r.many.recruitingContextSnapshot({
      from: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
      to: [
        r.recruitingContextSnapshot.aiRoundId,
        r.recruitingContextSnapshot.recruitingRecordId,
        r.recruitingContextSnapshot.organizationId,
      ],
    }),
    conversation: r.one.aiInterviewConversation({
      from: [
        r.aiInterviewRound.conversationId,
        r.aiInterviewRound.id,
        r.aiInterviewRound.organizationId,
      ],
      to: [
        r.aiInterviewConversation.conversationId,
        r.aiInterviewConversation.aiRoundId,
        r.aiInterviewConversation.organizationId,
      ],
    }),
    conversations: r.many.aiInterviewConversation({
      from: [r.aiInterviewRound.id, r.aiInterviewRound.organizationId],
      to: [r.aiInterviewConversation.aiRoundId, r.aiInterviewConversation.organizationId],
    }),
    creator: r.one.user({
      from: r.aiInterviewRound.createdBy,
      to: r.user.id,
    }),
    emailLogs: r.many.recruitingRoundEmailLog({
      from: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
      to: [
        r.recruitingRoundEmailLog.roundId,
        r.recruitingRoundEmailLog.recruitingRecordId,
        r.recruitingRoundEmailLog.organizationId,
      ],
    }),
    evidenceSnapshots: r.many.recruitingEvidenceSnapshot({
      from: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
      to: [
        r.recruitingEvidenceSnapshot.aiRoundId,
        r.recruitingEvidenceSnapshot.recruitingRecordId,
        r.recruitingEvidenceSnapshot.organizationId,
      ],
    }),
    organization: r.one.organization({
      from: r.aiInterviewRound.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [r.aiInterviewRound.recruitingRecordId, r.aiInterviewRound.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    reviewedByUser: r.one.user({
      from: r.aiInterviewRound.reviewedBy,
      to: r.user.id,
    }),
  },
  // candidate 的新域关联；旧域关系保持不变。
  candidate: {
    candidateResumes: r.many.candidateResume({
      from: [r.candidate.id, r.candidate.organizationId],
      to: [r.candidateResume.candidateId, r.candidateResume.organizationId],
    }),
    creator: r.one.user({
      from: r.candidate.createdBy,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.candidate.organizationId,
      to: r.organization.id,
    }),
    recruitingRecords: r.many.recruitingRecord({
      from: [r.candidate.id, r.candidate.organizationId],
      to: [r.recruitingRecord.candidateId, r.recruitingRecord.organizationId],
    }),
  },
  candidateFormSubmission: {
    interviewRecord: r.one.studioInterview({
      from: r.candidateFormSubmission.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  candidateFormTemplate: {
    jobDescriptionLinks: r.many.candidateFormTemplateJobDescription(),
    organization: r.one.organization({
      from: r.candidateFormTemplate.organizationId,
      to: r.organization.id,
    }),
    questions: r.many.candidateFormTemplateQuestion(),

    user: r.one.user({
      from: r.candidateFormTemplate.createdBy,
      to: r.user.id,
    }),
    versions: r.many.candidateFormTemplateVersion(),
  },
  candidateFormTemplateJobDescription: {
    jobDescription: r.one.jobDescription({
      from: r.candidateFormTemplateJobDescription.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    template: r.one.candidateFormTemplate({
      from: r.candidateFormTemplateJobDescription.templateId,
      to: r.candidateFormTemplate.id,
    }),
  },
  candidateFormTemplateQuestion: {
    template: r.one.candidateFormTemplate({
      from: r.candidateFormTemplateQuestion.templateId,
      to: r.candidateFormTemplate.id,
    }),
  },
  candidateFormTemplateVersion: {
    template: r.one.candidateFormTemplate({
      from: r.candidateFormTemplateVersion.templateId,
      to: r.candidateFormTemplate.id,
    }),
  },
  // candidate_resume 的新域关联；旧域关系保持不变。
  candidateResume: {
    candidate: r.one.candidate({
      from: [r.candidateResume.candidateId, r.candidateResume.organizationId],
      to: [r.candidate.id, r.candidate.organizationId],
    }),
    creator: r.one.user({
      from: r.candidateResume.createdBy,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.candidateResume.organizationId,
      to: r.organization.id,
    }),
  },
  chatAttachment: {
    organization: r.one.organization({
      from: r.chatAttachment.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.chatAttachment.userId,
      to: r.user.id,
    }),
  },
  chatConversation: {
    messages: r.many.chatMessage(),
    organization: r.one.organization({
      from: r.chatConversation.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.chatConversation.userId,
      to: r.user.id,
    }),
  },
  chatMessage: {
    conversation: r.one.chatConversation({
      from: r.chatMessage.conversationId,
      to: r.chatConversation.id,
    }),
    organization: r.one.organization({
      from: r.chatMessage.organizationId,
      to: r.organization.id,
    }),
  },
  department: {
    interviewers: r.many.interviewer(),
    jobDescriptions: r.many.jobDescription(),
    organization: r.one.organization({
      from: r.department.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.department.createdBy,
      to: r.user.id,
    }),
  },
  feishuThreadState: {
    organization: r.one.organization({
      from: r.feishuThreadState.organizationId,
      to: r.organization.id,
    }),
  },
  globalConfig: {
    organization: r.one.organization({
      from: r.globalConfig.organizationId,
      to: r.organization.id,
    }),
  },
  // human_interview_evaluation_document_sync 的新域关联；旧域关系保持不变。
  humanInterviewEvaluationDocumentSync: {
    organization: r.one.organization({
      from: r.humanInterviewEvaluationDocumentSync.organizationId,
      to: r.organization.id,
    }),
    round: r.one.humanInterviewRound({
      from: [
        r.humanInterviewEvaluationDocumentSync.roundId,
        r.humanInterviewEvaluationDocumentSync.organizationId,
      ],
      to: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
    }),
    snapshot: r.one.humanInterviewEvaluationSnapshot({
      from: [
        r.humanInterviewEvaluationDocumentSync.snapshotId,
        r.humanInterviewEvaluationDocumentSync.organizationId,
      ],
      to: [
        r.humanInterviewEvaluationSnapshot.id,
        r.humanInterviewEvaluationSnapshot.organizationId,
      ],
    }),
  },
  // human_interview_evaluation_snapshot 的新域关联；旧域关系保持不变。
  humanInterviewEvaluationSnapshot: {
    creator: r.one.user({
      from: r.humanInterviewEvaluationSnapshot.createdBy,
      to: r.user.id,
    }),
    meetingSession: r.one.meetingSession({
      from: r.humanInterviewEvaluationSnapshot.meetingSessionId,
      to: r.meetingSession.id,
    }),
    organization: r.one.organization({
      from: r.humanInterviewEvaluationSnapshot.organizationId,
      to: r.organization.id,
    }),
    round: r.one.humanInterviewRound({
      from: [
        r.humanInterviewEvaluationSnapshot.roundId,
        r.humanInterviewEvaluationSnapshot.organizationId,
      ],
      to: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
    }),
    transcriptRevision: r.one.meetingTranscriptRevision({
      from: r.humanInterviewEvaluationSnapshot.transcriptRevisionId,
      to: r.meetingTranscriptRevision.id,
    }),
  },
  // human_interview_meeting 的新域关联；旧域关系保持不变。
  humanInterviewMeeting: {
    creator: r.one.user({
      from: r.humanInterviewMeeting.createdBy,
      to: r.user.id,
    }),
    humanInterviewMeetingEvents: r.many.humanInterviewMeetingEvent({
      from: [r.humanInterviewMeeting.id, r.humanInterviewMeeting.organizationId],
      to: [r.humanInterviewMeetingEvent.meetingId, r.humanInterviewMeetingEvent.organizationId],
    }),
    humanInterviewMeetingInterviewers: r.many.humanInterviewMeetingInterviewer({
      from: [r.humanInterviewMeeting.id, r.humanInterviewMeeting.organizationId],
      to: [
        r.humanInterviewMeetingInterviewer.meetingId,
        r.humanInterviewMeetingInterviewer.organizationId,
      ],
    }),
    humanInterviewMeetingRounds: r.many.humanInterviewMeetingRound({
      from: [r.humanInterviewMeeting.id, r.humanInterviewMeeting.organizationId],
      to: [r.humanInterviewMeetingRound.meetingId, r.humanInterviewMeetingRound.organizationId],
    }),
    organization: r.one.organization({
      from: r.humanInterviewMeeting.organizationId,
      to: r.organization.id,
    }),
    processingMeetingSession: r.one.meetingSession({
      from: r.humanInterviewMeeting.processingMeetingSessionId,
      to: r.meetingSession.id,
    }),
  },
  // human_interview_meeting_event 的新域关联；旧域关系保持不变。
  humanInterviewMeetingEvent: {
    meeting: r.one.humanInterviewMeeting({
      from: [r.humanInterviewMeetingEvent.meetingId, r.humanInterviewMeetingEvent.organizationId],
      to: [r.humanInterviewMeeting.id, r.humanInterviewMeeting.organizationId],
    }),
    organization: r.one.organization({
      from: r.humanInterviewMeetingEvent.organizationId,
      to: r.organization.id,
    }),
  },
  // human_interview_meeting_interviewer 的新域关联；旧域关系保持不变。
  humanInterviewMeetingInterviewer: {
    meeting: r.one.humanInterviewMeeting({
      from: [
        r.humanInterviewMeetingInterviewer.meetingId,
        r.humanInterviewMeetingInterviewer.organizationId,
      ],
      to: [r.humanInterviewMeeting.id, r.humanInterviewMeeting.organizationId],
    }),
    organization: r.one.organization({
      from: r.humanInterviewMeetingInterviewer.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.humanInterviewMeetingInterviewer.userId,
      to: r.user.id,
    }),
  },
  // human_interview_meeting_round 的新域关联；旧域关系保持不变。
  humanInterviewMeetingRound: {
    meeting: r.one.humanInterviewMeeting({
      from: [r.humanInterviewMeetingRound.meetingId, r.humanInterviewMeetingRound.organizationId],
      to: [r.humanInterviewMeeting.id, r.humanInterviewMeeting.organizationId],
    }),
    organization: r.one.organization({
      from: r.humanInterviewMeetingRound.organizationId,
      to: r.organization.id,
    }),
    round: r.one.humanInterviewRound({
      from: [r.humanInterviewMeetingRound.roundId, r.humanInterviewMeetingRound.organizationId],
      to: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
    }),
  },
  // human_interview_round 的新域关联；旧域关系保持不变。
  humanInterviewRound: {
    evaluationTranscriptRevision: r.one.meetingTranscriptRevision({
      from: r.humanInterviewRound.evaluationTranscriptRevisionId,
      to: r.meetingTranscriptRevision.id,
    }),
    evaluationUpdatedByUser: r.one.user({
      from: r.humanInterviewRound.evaluationUpdatedBy,
      to: r.user.id,
    }),
    humanInterviewEvaluationSnapshots: r.many.humanInterviewEvaluationSnapshot({
      from: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
      to: [
        r.humanInterviewEvaluationSnapshot.roundId,
        r.humanInterviewEvaluationSnapshot.organizationId,
      ],
    }),
    humanInterviewMeetingRounds: r.many.humanInterviewMeetingRound({
      from: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
      to: [r.humanInterviewMeetingRound.roundId, r.humanInterviewMeetingRound.organizationId],
    }),
    humanInterviewRoundInterviewers: r.many.humanInterviewRoundInterviewer({
      from: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
      to: [
        r.humanInterviewRoundInterviewer.roundId,
        r.humanInterviewRoundInterviewer.organizationId,
      ],
    }),
    organization: r.one.organization({
      from: r.humanInterviewRound.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [r.humanInterviewRound.recruitingRecordId, r.humanInterviewRound.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // human_interview_round_interviewer 的新域关联；旧域关系保持不变。
  humanInterviewRoundInterviewer: {
    organization: r.one.organization({
      from: r.humanInterviewRoundInterviewer.organizationId,
      to: r.organization.id,
    }),
    round: r.one.humanInterviewRound({
      from: [
        r.humanInterviewRoundInterviewer.roundId,
        r.humanInterviewRoundInterviewer.organizationId,
      ],
      to: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
    }),
    user: r.one.user({
      from: r.humanInterviewRoundInterviewer.userId,
      to: r.user.id,
    }),
  },
  interviewAuditLog: {},
  interviewConversation: {
    interviewRecord: r.one.studioInterview({
      from: r.interviewConversation.interviewRecordId,
      to: r.studioInterview.id,
    }),

    turns: r.many.interviewConversationTurn(),
  },
  interviewConversationTurn: {
    conversation: r.one.interviewConversation({
      from: r.interviewConversationTurn.conversationId,
      to: r.interviewConversation.conversationId,
    }),
    interviewRecord: r.one.studioInterview({
      from: r.interviewConversationTurn.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  interviewNotification: {
    event: r.one.interviewNotificationEvent({
      from: r.interviewNotification.eventId,
      to: r.interviewNotificationEvent.id,
    }),
    interviewRecord: r.one.studioInterview({
      from: r.interviewNotification.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  interviewNotificationEvent: {
    aiRound: r.one.studioInterviewSchedule({
      from: r.interviewNotificationEvent.scheduleEntryId,
      to: r.studioInterviewSchedule.id,
    }),
    conversation: r.one.interviewConversation({
      from: r.interviewNotificationEvent.conversationId,
      to: r.interviewConversation.conversationId,
    }),
    deliveries: r.many.interviewNotification({
      from: r.interviewNotificationEvent.id,
      to: r.interviewNotification.eventId,
    }),
    humanMeeting: r.one.studioHumanInterviewMeeting({
      from: r.interviewNotificationEvent.humanMeetingId,
      to: r.studioHumanInterviewMeeting.id,
    }),
    humanRound: r.one.studioHumanInterviewRound({
      from: r.interviewNotificationEvent.humanRoundId,
      to: r.studioHumanInterviewRound.id,
    }),
    interviewRecord: r.one.studioInterview({
      from: r.interviewNotificationEvent.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  interviewNotificationTemplate: {
    activeVersion: r.one.interviewNotificationTemplateVersion({
      from: r.interviewNotificationTemplate.activeVersionId,
      to: r.interviewNotificationTemplateVersion.id,
    }),
    organization: r.one.organization({
      from: r.interviewNotificationTemplate.organizationId,
      to: r.organization.id,
    }),
    updatedByUser: r.one.user({
      from: r.interviewNotificationTemplate.updatedBy,
      to: r.user.id,
    }),
    versions: r.many.interviewNotificationTemplateVersion({
      from: r.interviewNotificationTemplate.id,
      to: r.interviewNotificationTemplateVersion.templateId,
    }),
  },
  interviewNotificationTemplateVersion: {
    createdByUser: r.one.user({
      from: r.interviewNotificationTemplateVersion.createdBy,
      to: r.user.id,
    }),

    template: r.one.interviewNotificationTemplate({
      from: r.interviewNotificationTemplateVersion.templateId,
      to: r.interviewNotificationTemplate.id,
    }),
  },
  interviewQuestionTemplate: {
    jobDescriptionLinks: r.many.interviewQuestionTemplateJobDescription(),
    organization: r.one.organization({
      from: r.interviewQuestionTemplate.organizationId,
      to: r.organization.id,
    }),
  },
  interviewQuestionTemplateBinding: {},
  interviewQuestionTemplateJobDescription: {
    jobDescription: r.one.jobDescription({
      from: r.interviewQuestionTemplateJobDescription.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    template: r.one.interviewQuestionTemplate({
      from: r.interviewQuestionTemplateJobDescription.templateId,
      to: r.interviewQuestionTemplate.id,
    }),
  },
  interviewer: {
    department: r.one.department({
      from: r.interviewer.departmentId,
      to: r.department.id,
    }),
    jobDescriptionLinks: r.many.jobDescriptionInterviewer(),
    organization: r.one.organization({
      from: r.interviewer.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.interviewer.createdBy,
      to: r.user.id,
    }),
  },
  invitation: {
    inviter: r.one.user({
      from: r.invitation.inviterId,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.invitation.organizationId,
      to: r.organization.id,
    }),
  },
  jobDescription: {
    candidateFormTemplateLinks: r.many.candidateFormTemplateJobDescription(),
    department: r.one.department({
      from: r.jobDescription.departmentId,
      to: r.department.id,
    }),
    evaluationUpgradeAudits: r.many.jobDescriptionEvaluationUpgradeAudit(),
    evaluationUpgradeDraft: r.one.jobDescriptionEvaluationUpgradeDraft(),
    interviewQuestionTemplateLinks: r.many.interviewQuestionTemplateJobDescription(),
    interviewerLinks: r.many.jobDescriptionInterviewer(),
    organization: r.one.organization({
      from: r.jobDescription.organizationId,
      to: r.organization.id,
    }),

    user: r.one.user({
      from: r.jobDescription.createdBy,
      to: r.user.id,
    }),
    versions: r.many.jobDescriptionVersion(),
  },
  jobDescriptionEvaluationUpgradeAudit: {
    jobDescription: r.one.jobDescription({
      from: r.jobDescriptionEvaluationUpgradeAudit.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.jobDescriptionEvaluationUpgradeAudit.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.jobDescriptionEvaluationUpgradeAudit.upgradedBy,
      to: r.user.id,
    }),
  },
  jobDescriptionEvaluationUpgradeDraft: {
    jobDescription: r.one.jobDescription({
      from: r.jobDescriptionEvaluationUpgradeDraft.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.jobDescriptionEvaluationUpgradeDraft.organizationId,
      to: r.organization.id,
    }),
  },
  jobDescriptionInterviewer: {
    interviewer: r.one.interviewer({
      from: r.jobDescriptionInterviewer.interviewerId,
      to: r.interviewer.id,
    }),
    jobDescription: r.one.jobDescription({
      from: r.jobDescriptionInterviewer.jobDescriptionId,
      to: r.jobDescription.id,
    }),
  },
  jobDescriptionVersion: {
    creator: r.one.user({
      from: r.jobDescriptionVersion.createdBy,
      to: r.user.id,
    }),

    jobDescription: r.one.jobDescription({
      from: r.jobDescriptionVersion.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.jobDescriptionVersion.organizationId,
      to: r.organization.id,
    }),
  },
  meetingAccessGrant: {
    meeting: r.one.meetingSession({
      from: r.meetingAccessGrant.meetingId,
      to: r.meetingSession.id,
    }),
    member: r.one.member({
      from: r.meetingAccessGrant.memberId,
      to: r.member.id,
    }),
  },
  meetingIntelligenceRevision: {
    createdByUser: r.one.user({
      from: r.meetingIntelligenceRevision.createdBy,
      to: r.user.id,
    }),
    meeting: r.one.meetingSession({
      from: r.meetingIntelligenceRevision.meetingId,
      to: r.meetingSession.id,
    }),
    organization: r.one.organization({
      from: r.meetingIntelligenceRevision.organizationId,
      to: r.organization.id,
    }),
    processingRun: r.one.meetingProcessingRun({
      from: r.meetingIntelligenceRevision.processingRunId,
      to: r.meetingProcessingRun.id,
    }),
    transcriptRevision: r.one.meetingTranscriptRevision({
      from: r.meetingIntelligenceRevision.transcriptRevisionId,
      to: r.meetingTranscriptRevision.id,
    }),
  },
  meetingNote: {
    author: r.one.user({
      from: r.meetingNote.authorId,
      to: r.user.id,
    }),
    meeting: r.one.meetingSession({
      from: r.meetingNote.meetingId,
      to: r.meetingSession.id,
    }),
  },
  meetingProcessingRun: {
    inputTranscriptRevision: r.one.meetingTranscriptRevision({
      from: r.meetingProcessingRun.inputTranscriptRevisionId,
      to: r.meetingTranscriptRevision.id,
    }),
    intelligenceRevision: r.one.meetingIntelligenceRevision({
      from: r.meetingProcessingRun.id,
      to: r.meetingIntelligenceRevision.processingRunId,
    }),
    meeting: r.one.meetingSession({
      from: r.meetingProcessingRun.meetingId,
      to: r.meetingSession.id,
    }),
    organization: r.one.organization({
      from: r.meetingProcessingRun.organizationId,
      to: r.organization.id,
    }),
    transcriptRevisions: r.many.meetingTranscriptRevision(),
  },
  meetingQuestionExchange: {
    creator: r.one.user({
      from: r.meetingQuestionExchange.createdBy,
      to: r.user.id,
    }),
    intelligenceRevision: r.one.meetingIntelligenceRevision({
      from: r.meetingQuestionExchange.inputIntelligenceRevisionId,
      to: r.meetingIntelligenceRevision.id,
    }),
    meeting: r.one.meetingSession({
      from: r.meetingQuestionExchange.meetingId,
      to: r.meetingSession.id,
    }),
    thread: r.one.meetingQuestionThread({
      from: r.meetingQuestionExchange.threadId,
      to: r.meetingQuestionThread.id,
    }),
    transcriptRevision: r.one.meetingTranscriptRevision({
      from: r.meetingQuestionExchange.inputTranscriptRevisionId,
      to: r.meetingTranscriptRevision.id,
    }),
  },
  meetingQuestionThread: {
    creator: r.one.user({
      from: r.meetingQuestionThread.createdBy,
      to: r.user.id,
    }),
    exchanges: r.many.meetingQuestionExchange(),
    meeting: r.one.meetingSession({
      from: r.meetingQuestionThread.meetingId,
      to: r.meetingSession.id,
    }),
  },
  meetingRecordingAsset: {
    meeting: r.one.meetingSession({
      from: r.meetingRecordingAsset.meetingId,
      to: r.meetingSession.id,
    }),
  },
  meetingRecruitingContext: {
    recruitingRecord: r.one.studioInterview({
      from: r.meetingRecruitingContext.recruitingRecordId,
      to: r.studioInterview.id,
    }),
  },
  meetingSearchProjection: {
    meeting: r.one.meetingSession({
      from: r.meetingSearchProjection.meetingId,
      to: r.meetingSession.id,
    }),
    organization: r.one.organization({
      from: r.meetingSearchProjection.organizationId,
      to: r.organization.id,
    }),
  },
  meetingSession: {
    accessGrants: r.many.meetingAccessGrant(),
    assets: r.many.meetingRecordingAsset(),
    custodian: r.one.user({
      from: r.meetingSession.custodianId,
      to: r.user.id,
    }),
    intelligenceRevisions: r.many.meetingIntelligenceRevision(),
    notes: r.many.meetingNote(),
    organization: r.one.organization({
      from: r.meetingSession.organizationId,
      to: r.organization.id,
    }),
    owner: r.one.user({
      from: r.meetingSession.ownerId,
      to: r.user.id,
    }),
    processingRuns: r.many.meetingProcessingRun(),
    questionExchanges: r.many.meetingQuestionExchange(),
    questionThreads: r.many.meetingQuestionThread(),

    searchProjection: r.one.meetingSearchProjection({
      from: r.meetingSession.id,
      to: r.meetingSearchProjection.meetingId,
    }),
    transcriptRevisions: r.many.meetingTranscriptRevision(),
    transcriptionChunks: r.many.meetingTranscriptionChunk(),
  },
  meetingTranscriptRevision: {
    intelligenceRevisions: r.many.meetingIntelligenceRevision(),
    meeting: r.one.meetingSession({
      from: r.meetingTranscriptRevision.meetingId,
      to: r.meetingSession.id,
    }),
    organization: r.one.organization({
      from: r.meetingTranscriptRevision.organizationId,
      to: r.organization.id,
    }),
    processingRun: r.one.meetingProcessingRun({
      from: r.meetingTranscriptRevision.processingRunId,
      to: r.meetingProcessingRun.id,
    }),
    turns: r.many.meetingTranscriptTurn(),
  },
  meetingTranscriptTurn: {
    revision: r.one.meetingTranscriptRevision({
      from: r.meetingTranscriptTurn.revisionId,
      to: r.meetingTranscriptRevision.id,
    }),
  },
  meetingTranscriptionChunk: {
    meeting: r.one.meetingSession({
      from: r.meetingTranscriptionChunk.meetingId,
      to: r.meetingSession.id,
    }),
    organization: r.one.organization({
      from: r.meetingTranscriptionChunk.organizationId,
      to: r.organization.id,
    }),
  },
  meetingTranscriptionPolicy: {
    organization: r.one.organization({
      from: r.meetingTranscriptionPolicy.organizationId,
      to: r.organization.id,
    }),
    updatedByUser: r.one.user({
      from: r.meetingTranscriptionPolicy.updatedBy,
      to: r.user.id,
    }),
  },
  member: {
    inviteLink: r.one.workspaceInviteLink({
      from: r.member.inviteLinkId,
      to: r.workspaceInviteLink.id,
    }),
    organization: r.one.organization({
      from: r.member.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.member.userId,
      to: r.user.id,
    }),
  },
  organization: {
    candidateFormTemplates: r.many.candidateFormTemplate(),
    chatAttachments: r.many.chatAttachment(),
    chatConversations: r.many.chatConversation(),
    chatMessages: r.many.chatMessage(),
    departments: r.many.department(),
    feishuThreadStates: r.many.feishuThreadState(),
    globalConfigs: r.many.globalConfig(),

    interviewNotificationTemplates: r.many.interviewNotificationTemplate(),

    interviewQuestionTemplates: r.many.interviewQuestionTemplate(),
    interviewers: r.many.interviewer(),
    invitations: r.many.invitation(),
    jobDescriptions: r.many.jobDescription(),
    meetingProcessingRuns: r.many.meetingProcessingRun(),
    meetingTranscriptRevisions: r.many.meetingTranscriptRevision(),
    meetingTranscriptionChunks: r.many.meetingTranscriptionChunk(),
    meetingTranscriptionPolicies: r.many.meetingTranscriptionPolicy(),
    members: r.many.member(),
    organizationRoles: r.many.organizationRole(),

    studioOrgSkills: r.many.studioOrgSkill(),

    workspaceInviteLinks: r.many.workspaceInviteLink(),
  },
  organizationRole: {
    organization: r.one.organization({
      from: r.organizationRole.organizationId,
      to: r.organization.id,
    }),
  },
  // recruiting_context_snapshot 的新域关联；旧域关系保持不变。
  recruitingContextSnapshot: {
    aiRound: r.one.aiInterviewRound({
      from: [
        r.recruitingContextSnapshot.aiRoundId,
        r.recruitingContextSnapshot.recruitingRecordId,
        r.recruitingContextSnapshot.organizationId,
      ],
      to: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
    }),
    creator: r.one.user({
      from: r.recruitingContextSnapshot.createdBy,
      to: r.user.id,
    }),
    evidenceSnapshots: r.many.recruitingEvidenceSnapshot({
      from: [
        r.recruitingContextSnapshot.id,
        r.recruitingContextSnapshot.recruitingRecordId,
        r.recruitingContextSnapshot.organizationId,
      ],
      to: [
        r.recruitingEvidenceSnapshot.contextSnapshotId,
        r.recruitingEvidenceSnapshot.recruitingRecordId,
        r.recruitingEvidenceSnapshot.organizationId,
      ],
    }),
    organization: r.one.organization({
      from: r.recruitingContextSnapshot.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingContextSnapshot.recruitingRecordId,
        r.recruitingContextSnapshot.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_duplicate_match 的新域关联；旧域关系保持不变。
  recruitingDuplicateMatch: {
    organization: r.one.organization({
      from: r.recruitingDuplicateMatch.organizationId,
      to: r.organization.id,
    }),
  },
  // recruiting_event 的新域关联；旧域关系保持不变。
  recruitingEvent: {
    aiRound: r.one.aiInterviewRound({
      from: [
        r.recruitingEvent.aiRoundId,
        r.recruitingEvent.recruitingRecordId,
        r.recruitingEvent.organizationId,
      ],
      to: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
    }),
    operator: r.one.user({
      from: r.recruitingEvent.operatorId,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.recruitingEvent.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [r.recruitingEvent.recruitingRecordId, r.recruitingEvent.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_evidence_snapshot 的新域关联；旧域关系保持不变。
  recruitingEvidenceSnapshot: {
    aiRound: r.one.aiInterviewRound({
      from: [
        r.recruitingEvidenceSnapshot.aiRoundId,
        r.recruitingEvidenceSnapshot.recruitingRecordId,
        r.recruitingEvidenceSnapshot.organizationId,
      ],
      to: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
    }),
    contextSnapshot: r.one.recruitingContextSnapshot({
      from: [
        r.recruitingEvidenceSnapshot.contextSnapshotId,
        r.recruitingEvidenceSnapshot.recruitingRecordId,
        r.recruitingEvidenceSnapshot.organizationId,
      ],
      to: [
        r.recruitingContextSnapshot.id,
        r.recruitingContextSnapshot.recruitingRecordId,
        r.recruitingContextSnapshot.organizationId,
      ],
    }),
    conversation: r.one.aiInterviewConversation({
      from: [
        r.recruitingEvidenceSnapshot.conversationId,
        r.recruitingEvidenceSnapshot.organizationId,
      ],
      to: [r.aiInterviewConversation.conversationId, r.aiInterviewConversation.organizationId],
    }),
    organization: r.one.organization({
      from: r.recruitingEvidenceSnapshot.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingEvidenceSnapshot.recruitingRecordId,
        r.recruitingEvidenceSnapshot.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_form_submission 的新域关联；旧域关系保持不变。
  recruitingFormSubmission: {
    organization: r.one.organization({
      from: r.recruitingFormSubmission.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingFormSubmission.recruitingRecordId,
        r.recruitingFormSubmission.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    template: r.one.candidateFormTemplate({
      from: r.recruitingFormSubmission.templateId,
      to: r.candidateFormTemplate.id,
    }),
    version: r.one.candidateFormTemplateVersion({
      from: r.recruitingFormSubmission.versionId,
      to: r.candidateFormTemplateVersion.id,
    }),
  },
  // recruiting_fulfillment 的新域关联；旧域关系保持不变。
  recruitingFulfillment: {
    onboardingConfirmedByUser: r.one.user({
      from: r.recruitingFulfillment.onboardingConfirmedBy,
      to: r.user.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [r.recruitingFulfillment.recruitingRecordId, r.recruitingFulfillment.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    selectedOffer: r.one.recruitingOffer({
      from: [
        r.recruitingFulfillment.selectedOfferId,
        r.recruitingFulfillment.recruitingRecordId,
        r.recruitingFulfillment.organizationId,
      ],
      to: [
        r.recruitingOffer.id,
        r.recruitingOffer.recruitingRecordId,
        r.recruitingOffer.organizationId,
      ],
    }),
  },
  // recruiting_interview_preparation 的新域关联；旧域关系保持不变。
  recruitingInterviewPreparation: {
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingInterviewPreparation.recruitingRecordId,
        r.recruitingInterviewPreparation.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_job_match_candidate 的新域关联；旧域关系保持不变。
  recruitingJobMatchCandidate: {
    jobDescription: r.one.jobDescription({
      from: r.recruitingJobMatchCandidate.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.recruitingJobMatchCandidate.organizationId,
      to: r.organization.id,
    }),
    run: r.one.recruitingJobMatchRun({
      from: [r.recruitingJobMatchCandidate.runId, r.recruitingJobMatchCandidate.organizationId],
      to: [r.recruitingJobMatchRun.id, r.recruitingJobMatchRun.organizationId],
    }),
  },
  // recruiting_job_match_run 的新域关联；旧域关系保持不变。
  recruitingJobMatchRun: {
    batchItem: r.one.recruitingUploadBatchItem({
      from: [r.recruitingJobMatchRun.batchItemId, r.recruitingJobMatchRun.organizationId],
      to: [r.recruitingUploadBatchItem.id, r.recruitingUploadBatchItem.organizationId],
    }),
    mailMessage: r.one.recruitingMailMessage({
      from: [r.recruitingJobMatchRun.mailMessageId, r.recruitingJobMatchRun.organizationId],
      to: [r.recruitingMailMessage.id, r.recruitingMailMessage.organizationId],
    }),
    organization: r.one.organization({
      from: r.recruitingJobMatchRun.organizationId,
      to: r.organization.id,
    }),
    poolItem: r.one.resumePoolItem({
      from: r.recruitingJobMatchRun.poolItemId,
      to: r.resumePoolItem.id,
    }),
    recruitingJobMatchCandidates: r.many.recruitingJobMatchCandidate({
      from: [r.recruitingJobMatchRun.id, r.recruitingJobMatchRun.organizationId],
      to: [r.recruitingJobMatchCandidate.runId, r.recruitingJobMatchCandidate.organizationId],
    }),
    selectedJobDescription: r.one.jobDescription({
      from: r.recruitingJobMatchRun.selectedJobDescriptionId,
      to: r.jobDescription.id,
    }),
  },
  // recruiting_mail_message 的新域关联；旧域关系保持不变。
  recruitingMailMessage: {
    account: r.one.mailIngestAccount({
      from: r.recruitingMailMessage.accountId,
      to: r.mailIngestAccount.id,
    }),
    batch: r.one.recruitingUploadBatch({
      from: [r.recruitingMailMessage.batchId, r.recruitingMailMessage.organizationId],
      to: [r.recruitingUploadBatch.id, r.recruitingUploadBatch.organizationId],
    }),
    boundJobDescription: r.one.jobDescription({
      from: r.recruitingMailMessage.boundJobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.recruitingMailMessage.organizationId,
      to: r.organization.id,
    }),
    recruitingJobMatchRuns: r.many.recruitingJobMatchRun({
      from: [r.recruitingMailMessage.id, r.recruitingMailMessage.organizationId],
      to: [r.recruitingJobMatchRun.mailMessageId, r.recruitingJobMatchRun.organizationId],
    }),
  },
  // recruiting_material 的新域关联；旧域关系保持不变。
  recruitingMaterial: {
    recruitingRecord: r.one.recruitingRecord({
      from: [r.recruitingMaterial.recruitingRecordId, r.recruitingMaterial.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    uploader: r.one.user({
      from: r.recruitingMaterial.uploadedBy,
      to: r.user.id,
    }),
  },
  // recruiting_meeting_context 的新域关联；旧域关系保持不变。
  recruitingMeetingContext: {
    linkedByUser: r.one.user({
      from: r.recruitingMeetingContext.linkedBy,
      to: r.user.id,
    }),
    meeting: r.one.meetingSession({
      from: [r.recruitingMeetingContext.meetingId, r.recruitingMeetingContext.organizationId],
      to: [r.meetingSession.id, r.meetingSession.organizationId],
    }),
    organization: r.one.organization({
      from: r.recruitingMeetingContext.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingMeetingContext.recruitingRecordId,
        r.recruitingMeetingContext.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_migration_map 的新域关联；旧域关系保持不变。
  recruitingMigrationMap: {},
  // recruiting_node_state 的新域关联；旧域关系保持不变。
  recruitingNodeState: {
    decider: r.one.user({
      from: r.recruitingNodeState.decidedBy,
      to: r.user.id,
    }),
    effectiveAiRound: r.one.aiInterviewRound({
      from: [
        r.recruitingNodeState.effectiveAiRoundId,
        r.recruitingNodeState.recruitingRecordId,
        r.recruitingNodeState.organizationId,
      ],
      to: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
    }),
    effectiveHumanRound: r.one.humanInterviewRound({
      from: [
        r.recruitingNodeState.effectiveHumanRoundId,
        r.recruitingNodeState.recruitingRecordId,
        r.recruitingNodeState.organizationId,
        r.recruitingNodeState.node,
      ],
      to: [
        r.humanInterviewRound.id,
        r.humanInterviewRound.recruitingRecordId,
        r.humanInterviewRound.organizationId,
        r.humanInterviewRound.roundKind,
      ],
    }),
    effectiveOffer: r.one.recruitingOffer({
      from: [
        r.recruitingNodeState.effectiveOfferId,
        r.recruitingNodeState.recruitingRecordId,
        r.recruitingNodeState.organizationId,
      ],
      to: [
        r.recruitingOffer.id,
        r.recruitingOffer.recruitingRecordId,
        r.recruitingOffer.organizationId,
      ],
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [r.recruitingNodeState.recruitingRecordId, r.recruitingNodeState.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_notification_delivery 的新域关联；旧域关系保持不变。
  recruitingNotificationDelivery: {
    conversation: r.one.aiInterviewConversation({
      from: [
        r.recruitingNotificationDelivery.conversationId,
        r.recruitingNotificationDelivery.organizationId,
      ],
      to: [r.aiInterviewConversation.conversationId, r.aiInterviewConversation.organizationId],
    }),
    event: r.one.recruitingNotificationEvent({
      from: [
        r.recruitingNotificationDelivery.eventId,
        r.recruitingNotificationDelivery.organizationId,
      ],
      to: [r.recruitingNotificationEvent.id, r.recruitingNotificationEvent.organizationId],
    }),
    organization: r.one.organization({
      from: r.recruitingNotificationDelivery.organizationId,
      to: r.organization.id,
    }),
    recipientUser: r.one.user({
      from: r.recruitingNotificationDelivery.recipientUserId,
      to: r.user.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingNotificationDelivery.recruitingRecordId,
        r.recruitingNotificationDelivery.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    templateVersion: r.one.interviewNotificationTemplateVersion({
      from: r.recruitingNotificationDelivery.templateVersionId,
      to: r.interviewNotificationTemplateVersion.id,
    }),
  },
  // recruiting_notification_event 的新域关联；旧域关系保持不变。
  recruitingNotificationEvent: {
    actorUser: r.one.user({
      from: r.recruitingNotificationEvent.actorUserId,
      to: r.user.id,
    }),
    aiRound: r.one.aiInterviewRound({
      from: [r.recruitingNotificationEvent.aiRoundId, r.recruitingNotificationEvent.organizationId],
      to: [r.aiInterviewRound.id, r.aiInterviewRound.organizationId],
    }),
    conversation: r.one.aiInterviewConversation({
      from: [
        r.recruitingNotificationEvent.conversationId,
        r.recruitingNotificationEvent.organizationId,
      ],
      to: [r.aiInterviewConversation.conversationId, r.aiInterviewConversation.organizationId],
    }),
    deliveries: r.many.recruitingNotificationDelivery({
      from: [r.recruitingNotificationEvent.id, r.recruitingNotificationEvent.organizationId],
      to: [
        r.recruitingNotificationDelivery.eventId,
        r.recruitingNotificationDelivery.organizationId,
      ],
    }),
    humanMeeting: r.one.humanInterviewMeeting({
      from: [
        r.recruitingNotificationEvent.humanMeetingId,
        r.recruitingNotificationEvent.organizationId,
      ],
      to: [r.humanInterviewMeeting.id, r.humanInterviewMeeting.organizationId],
    }),
    humanRound: r.one.humanInterviewRound({
      from: [
        r.recruitingNotificationEvent.humanRoundId,
        r.recruitingNotificationEvent.organizationId,
      ],
      to: [r.humanInterviewRound.id, r.humanInterviewRound.organizationId],
    }),
    organization: r.one.organization({
      from: r.recruitingNotificationEvent.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingNotificationEvent.recruitingRecordId,
        r.recruitingNotificationEvent.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_notification_recipient 的新域关联；旧域关系保持不变。
  recruitingNotificationRecipient: {
    creator: r.one.user({
      from: r.recruitingNotificationRecipient.createdBy,
      to: r.user.id,
    }),
    member: r.one.member({
      from: [
        r.recruitingNotificationRecipient.userId,
        r.recruitingNotificationRecipient.organizationId,
      ],
      to: [r.member.userId, r.member.organizationId],
    }),
    organization: r.one.organization({
      from: r.recruitingNotificationRecipient.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingNotificationRecipient.recruitingRecordId,
        r.recruitingNotificationRecipient.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    user: r.one.user({
      from: r.recruitingNotificationRecipient.userId,
      to: r.user.id,
    }),
  },
  // recruiting_offer 的新域关联；旧域关系保持不变。
  recruitingOffer: {
    organization: r.one.organization({
      from: r.recruitingOffer.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [r.recruitingOffer.recruitingRecordId, r.recruitingOffer.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_pool_import 的新域关联；旧域关系保持不变。
  recruitingPoolImport: {
    importedByUser: r.one.user({
      from: r.recruitingPoolImport.importedBy,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.recruitingPoolImport.organizationId,
      to: r.organization.id,
    }),
    poolItem: r.one.resumePoolItem({
      from: r.recruitingPoolImport.poolItemId,
      to: r.resumePoolItem.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [r.recruitingPoolImport.recruitingRecordId, r.recruitingPoolImport.organizationId],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  // recruiting_question_template_binding 的新域关联；旧域关系保持不变。
  recruitingQuestionTemplateBinding: {
    organization: r.one.organization({
      from: r.recruitingQuestionTemplateBinding.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingQuestionTemplateBinding.recruitingRecordId,
        r.recruitingQuestionTemplateBinding.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    template: r.one.interviewQuestionTemplate({
      from: r.recruitingQuestionTemplateBinding.templateId,
      to: r.interviewQuestionTemplate.id,
    }),
    version: r.one.interviewQuestionTemplateVersion({
      from: r.recruitingQuestionTemplateBinding.versionId,
      to: r.interviewQuestionTemplateVersion.id,
    }),
  },
  // recruiting_record 的新域关联；旧域关系保持不变。
  recruitingRecord: {
    activeEvaluation: r.one.recruitingResumeEvaluation({
      from: [
        r.recruitingRecord.activeEvaluationId,
        r.recruitingRecord.id,
        r.recruitingRecord.organizationId,
      ],
      to: [
        r.recruitingResumeEvaluation.id,
        r.recruitingResumeEvaluation.recruitingRecordId,
        r.recruitingResumeEvaluation.organizationId,
      ],
    }),
    aiInterviewRounds: r.many.aiInterviewRound({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.aiInterviewRound.recruitingRecordId, r.aiInterviewRound.organizationId],
    }),
    candidate: r.one.candidate({
      from: [r.recruitingRecord.candidateId, r.recruitingRecord.organizationId],
      to: [r.candidate.id, r.candidate.organizationId],
    }),
    creator: r.one.user({
      from: r.recruitingRecord.createdBy,
      to: r.user.id,
    }),
    currentEvaluation: r.one.recruitingResumeEvaluation({
      from: [
        r.recruitingRecord.currentEvaluationId,
        r.recruitingRecord.id,
        r.recruitingRecord.organizationId,
      ],
      to: [
        r.recruitingResumeEvaluation.id,
        r.recruitingResumeEvaluation.recruitingRecordId,
        r.recruitingResumeEvaluation.organizationId,
      ],
    }),
    hrResumeAssessmentUpdatedByUser: r.one.user({
      from: r.recruitingRecord.hrResumeAssessmentUpdatedBy,
      to: r.user.id,
    }),
    humanInterviewRounds: r.many.humanInterviewRound({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.humanInterviewRound.recruitingRecordId, r.humanInterviewRound.organizationId],
    }),
    interviewPreparation: r.one.recruitingInterviewPreparation({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingInterviewPreparation.recruitingRecordId,
        r.recruitingInterviewPreparation.organizationId,
      ],
    }),
    jobDescription: r.one.jobDescription({
      from: r.recruitingRecord.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.recruitingRecord.organizationId,
      to: r.organization.id,
    }),
    owner: r.one.user({
      from: r.recruitingRecord.ownerId,
      to: r.user.id,
    }),
    recruitingContextSnapshots: r.many.recruitingContextSnapshot({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingContextSnapshot.recruitingRecordId,
        r.recruitingContextSnapshot.organizationId,
      ],
    }),
    recruitingEvents: r.many.recruitingEvent({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.recruitingEvent.recruitingRecordId, r.recruitingEvent.organizationId],
    }),
    recruitingEvidenceSnapshots: r.many.recruitingEvidenceSnapshot({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingEvidenceSnapshot.recruitingRecordId,
        r.recruitingEvidenceSnapshot.organizationId,
      ],
    }),
    recruitingFormSubmissions: r.many.recruitingFormSubmission({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingFormSubmission.recruitingRecordId,
        r.recruitingFormSubmission.organizationId,
      ],
    }),
    recruitingFulfillment: r.one.recruitingFulfillment({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.recruitingFulfillment.recruitingRecordId, r.recruitingFulfillment.organizationId],
    }),
    recruitingMaterials: r.many.recruitingMaterial({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.recruitingMaterial.recruitingRecordId, r.recruitingMaterial.organizationId],
    }),
    recruitingMeetingContexts: r.many.recruitingMeetingContext({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingMeetingContext.recruitingRecordId,
        r.recruitingMeetingContext.organizationId,
      ],
    }),
    recruitingNodeStates: r.many.recruitingNodeState({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.recruitingNodeState.recruitingRecordId, r.recruitingNodeState.organizationId],
    }),
    recruitingNotificationEvents: r.many.recruitingNotificationEvent({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingNotificationEvent.recruitingRecordId,
        r.recruitingNotificationEvent.organizationId,
      ],
    }),
    recruitingNotificationRecipients: r.many.recruitingNotificationRecipient({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingNotificationRecipient.recruitingRecordId,
        r.recruitingNotificationRecipient.organizationId,
      ],
    }),
    recruitingOffers: r.many.recruitingOffer({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.recruitingOffer.recruitingRecordId, r.recruitingOffer.organizationId],
    }),
    recruitingPoolImports: r.many.recruitingPoolImport({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [r.recruitingPoolImport.recruitingRecordId, r.recruitingPoolImport.organizationId],
    }),
    recruitingQuestionTemplateBindings: r.many.recruitingQuestionTemplateBinding({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingQuestionTemplateBinding.recruitingRecordId,
        r.recruitingQuestionTemplateBinding.organizationId,
      ],
    }),
    recruitingResumeEvaluations: r.many.recruitingResumeEvaluation({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingResumeEvaluation.recruitingRecordId,
        r.recruitingResumeEvaluation.organizationId,
      ],
    }),
    recruitingUploadBatchItems: r.many.recruitingUploadBatchItem({
      from: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
      to: [
        r.recruitingUploadBatchItem.recruitingRecordId,
        r.recruitingUploadBatchItem.organizationId,
      ],
    }),
    resume: r.one.candidateResume({
      from: [
        r.recruitingRecord.resumeId,
        r.recruitingRecord.candidateId,
        r.recruitingRecord.organizationId,
      ],
      to: [r.candidateResume.id, r.candidateResume.candidateId, r.candidateResume.organizationId],
    }),
    sourceImportedByUser: r.one.user({
      from: r.recruitingRecord.sourceImportedBy,
      to: r.user.id,
    }),
    sourcePoolItem: r.one.resumePoolItem({
      from: r.recruitingRecord.sourcePoolItemId,
      to: r.resumePoolItem.id,
    }),
  },
  // recruiting_resume_evaluation 的新域关联；旧域关系保持不变。
  recruitingResumeEvaluation: {
    jobDescriptionVersion: r.one.jobDescriptionVersion({
      from: r.recruitingResumeEvaluation.jobDescriptionVersionId,
      to: r.jobDescriptionVersion.id,
    }),
    organization: r.one.organization({
      from: r.recruitingResumeEvaluation.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingResumeEvaluation.recruitingRecordId,
        r.recruitingResumeEvaluation.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    resume: r.one.candidateResume({
      from: [r.recruitingResumeEvaluation.resumeId, r.recruitingResumeEvaluation.organizationId],
      to: [r.candidateResume.id, r.candidateResume.organizationId],
    }),
  },
  // recruiting_round_email_log 的新域关联；旧域关系保持不变。
  recruitingRoundEmailLog: {
    organization: r.one.organization({
      from: r.recruitingRoundEmailLog.organizationId,
      to: r.organization.id,
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingRoundEmailLog.recruitingRecordId,
        r.recruitingRoundEmailLog.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
    round: r.one.aiInterviewRound({
      from: [
        r.recruitingRoundEmailLog.roundId,
        r.recruitingRoundEmailLog.recruitingRecordId,
        r.recruitingRoundEmailLog.organizationId,
      ],
      to: [
        r.aiInterviewRound.id,
        r.aiInterviewRound.recruitingRecordId,
        r.aiInterviewRound.organizationId,
      ],
    }),
    sender: r.one.user({
      from: r.recruitingRoundEmailLog.sentBy,
      to: r.user.id,
    }),
  },
  // recruiting_search_index 的新域关联；旧域关系保持不变。
  recruitingSearchIndex: {
    organization: r.one.organization({
      from: r.recruitingSearchIndex.organizationId,
      to: r.organization.id,
    }),
  },
  // recruiting_upload_batch 的新域关联；旧域关系保持不变。
  recruitingUploadBatch: {
    creator: r.one.user({
      from: r.recruitingUploadBatch.createdBy,
      to: r.user.id,
    }),
    jobDescription: r.one.jobDescription({
      from: r.recruitingUploadBatch.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.recruitingUploadBatch.organizationId,
      to: r.organization.id,
    }),
    recruitingMailMessages: r.many.recruitingMailMessage({
      from: [r.recruitingUploadBatch.id, r.recruitingUploadBatch.organizationId],
      to: [r.recruitingMailMessage.batchId, r.recruitingMailMessage.organizationId],
    }),
    recruitingUploadBatchItems: r.many.recruitingUploadBatchItem({
      from: [r.recruitingUploadBatch.id, r.recruitingUploadBatch.organizationId],
      to: [r.recruitingUploadBatchItem.batchId, r.recruitingUploadBatchItem.organizationId],
    }),
  },
  // recruiting_upload_batch_item 的新域关联；旧域关系保持不变。
  recruitingUploadBatchItem: {
    batch: r.one.recruitingUploadBatch({
      from: [r.recruitingUploadBatchItem.batchId, r.recruitingUploadBatchItem.organizationId],
      to: [r.recruitingUploadBatch.id, r.recruitingUploadBatch.organizationId],
    }),
    poolItem: r.one.resumePoolItem({
      from: r.recruitingUploadBatchItem.poolItemId,
      to: r.resumePoolItem.id,
    }),
    recruitingJobMatchRuns: r.many.recruitingJobMatchRun({
      from: [r.recruitingUploadBatchItem.id, r.recruitingUploadBatchItem.organizationId],
      to: [r.recruitingJobMatchRun.batchItemId, r.recruitingJobMatchRun.organizationId],
    }),
    recruitingRecord: r.one.recruitingRecord({
      from: [
        r.recruitingUploadBatchItem.recruitingRecordId,
        r.recruitingUploadBatchItem.organizationId,
      ],
      to: [r.recruitingRecord.id, r.recruitingRecord.organizationId],
    }),
  },
  resumeEvaluationFailure: {
    resumeRecord: r.one.studioInterview({
      from: r.resumeEvaluationFailure.resumeRecordId,
      to: r.studioInterview.id,
    }),
  },
  resumeEvaluationVersion: {
    resumeRecord: r.one.studioInterview({
      from: r.resumeEvaluationVersion.resumeRecordId,
      to: r.studioInterview.id,
    }),
  },
  resumeJobMatchCandidate: {
    run: r.one.resumeJobMatchRun({
      from: r.resumeJobMatchCandidate.runId,
      to: r.resumeJobMatchRun.id,
    }),
  },
  resumeJobMatchRun: {
    batchItem: r.one.resumeUploadBatchItem({
      from: r.resumeJobMatchRun.batchItemId,
      to: r.resumeUploadBatchItem.id,
    }),
    candidates: r.many.resumeJobMatchCandidate(),
    mailMessage: r.one.mailIngestMessage({
      from: r.resumeJobMatchRun.mailMessageId,
      to: r.mailIngestMessage.id,
    }),
  },
  resumePoolEvent: {
    actor: r.one.user({
      from: r.resumePoolEvent.actorId,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.resumePoolEvent.organizationId,
      to: r.organization.id,
    }),
    poolItem: r.one.resumePoolItem({
      from: r.resumePoolEvent.poolItemId,
      to: r.resumePoolItem.id,
    }),
  },
  resumePoolImport: {
    importedResumeRecord: r.one.studioInterview({
      from: r.resumePoolImport.importedResumeRecordId,
      to: r.studioInterview.id,
    }),
  },
  resumePoolItem: {
    createdByUser: r.one.user({
      from: r.resumePoolItem.createdBy,
      to: r.user.id,
    }),
    events: r.many.resumePoolEvent(),

    jobDescription: r.one.jobDescription({
      from: r.resumePoolItem.jobDescriptionId,
      to: r.jobDescription.id,
    }),

    organization: r.one.organization({
      from: r.resumePoolItem.organizationId,
      to: r.organization.id,
    }),
    publishedByUser: r.one.user({
      from: r.resumePoolItem.publishedBy,
      to: r.user.id,
    }),
    sourceOrganization: r.one.organization({
      from: r.resumePoolItem.sourceOrganizationId,
      to: r.organization.id,
    }),
    sourceUser: r.one.user({
      from: r.resumePoolItem.sourceUserId,
      to: r.user.id,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  studioHumanInterviewMeeting: {
    events: r.many.studioHumanInterviewMeetingEvent(),
    interviewers: r.many.studioHumanInterviewMeetingInterviewer(),
    notificationEvents: r.many.interviewNotificationEvent(),

    rounds: r.many.studioHumanInterviewMeetingRound(),
  },
  studioHumanInterviewMeetingEvent: {
    meeting: r.one.studioHumanInterviewMeeting({
      from: r.studioHumanInterviewMeetingEvent.meetingId,
      to: r.studioHumanInterviewMeeting.id,
    }),
  },
  studioHumanInterviewMeetingInterviewer: {
    meeting: r.one.studioHumanInterviewMeeting({
      from: r.studioHumanInterviewMeetingInterviewer.meetingId,
      to: r.studioHumanInterviewMeeting.id,
    }),
  },
  studioHumanInterviewMeetingRound: {
    meeting: r.one.studioHumanInterviewMeeting({
      from: r.studioHumanInterviewMeetingRound.meetingId,
      to: r.studioHumanInterviewMeeting.id,
    }),
    round: r.one.studioHumanInterviewRound({
      from: r.studioHumanInterviewMeetingRound.roundId,
      to: r.studioHumanInterviewRound.id,
    }),
  },
  studioHumanInterviewRound: {
    interviewRecord: r.one.studioInterview({
      from: r.studioHumanInterviewRound.interviewRecordId,
      to: r.studioInterview.id,
    }),
    interviewers: r.many.studioHumanInterviewRoundInterviewer(),
    meetingLinks: r.many.studioHumanInterviewMeetingRound(),
    notificationEvents: r.many.interviewNotificationEvent(),
  },
  studioHumanInterviewRoundInterviewer: {
    round: r.one.studioHumanInterviewRound({
      from: r.studioHumanInterviewRoundInterviewer.roundId,
      to: r.studioHumanInterviewRound.id,
    }),
  },
  studioInterview: {
    candidateFormSubmissions: r.many.candidateFormSubmission(),
    conversationTurns: r.many.interviewConversationTurn(),
    conversations: r.many.interviewConversation(),
    evaluationFailures: r.many.resumeEvaluationFailure(),
    evaluationVersions: r.many.resumeEvaluationVersion(),
    humanInterviewRounds: r.many.studioHumanInterviewRound(),

    meetingContexts: r.many.meetingRecruitingContext(),
    notificationEvents: r.many.interviewNotificationEvent(),
    notificationRecipients: r.many.studioInterviewNotificationRecipient(),
    notifications: r.many.interviewNotification(),
    offerDrafts: r.many.studioOfferDraft(),

    roundEmailLogs: r.many.studioRoundEmailLog(),
    scheduleEntries: r.many.studioInterviewSchedule(),
    sourcePoolImports: r.many.resumePoolImport(),
  },
  studioInterviewNotificationRecipient: {
    interviewRecord: r.one.studioInterview({
      from: r.studioInterviewNotificationRecipient.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  studioInterviewSchedule: {
    emailLogs: r.many.studioRoundEmailLog(),
    interviewRecord: r.one.studioInterview({
      from: r.studioInterviewSchedule.interviewRecordId,
      to: r.studioInterview.id,
    }),
    notificationEvents: r.many.interviewNotificationEvent(),
  },
  studioOfferDraft: {
    interviewRecord: r.one.studioInterview({
      from: r.studioOfferDraft.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  studioOrgSkill: {
    organization: r.one.organization({
      from: r.studioOrgSkill.organizationId,
      to: r.organization.id,
    }),
  },
  studioRoundEmailLog: {
    interviewRecord: r.one.studioInterview({
      from: r.studioRoundEmailLog.interviewRecordId,
      to: r.studioInterview.id,
    }),

    round: r.one.studioInterviewSchedule({
      from: r.studioRoundEmailLog.roundId,
      to: r.studioInterviewSchedule.id,
    }),
  },
  user: {
    account: r.many.account(),
    candidateFormTemplates: r.many.candidateFormTemplate(),
    chatAttachment: r.many.chatAttachment(),
    chatConversation: r.many.chatConversation(),
    departments: r.many.department(),

    interviewNotificationTemplateVersionsCreated: r.many.interviewNotificationTemplateVersion({
      from: r.user.id,
      to: r.interviewNotificationTemplateVersion.createdBy,
    }),
    interviewNotificationTemplatesUpdated: r.many.interviewNotificationTemplate({
      from: r.user.id,
      to: r.interviewNotificationTemplate.updatedBy,
    }),
    interviewers: r.many.interviewer(),
    invitationsSent: r.many.invitation(),
    jobDescriptions: r.many.jobDescription(),
    memberships: r.many.member(),
    session: r.many.session(),

    workspaceInviteLinksCreated: r.many.workspaceInviteLink({
      from: r.user.id,
      to: r.workspaceInviteLink.createdBy,
    }),
    workspaceInviteLinksDisabled: r.many.workspaceInviteLink({
      from: r.user.id,
      to: r.workspaceInviteLink.disabledBy,
    }),
  },
  workspaceInviteLink: {
    creator: r.one.user({
      from: r.workspaceInviteLink.createdBy,
      to: r.user.id,
    }),
    disabler: r.one.user({
      from: r.workspaceInviteLink.disabledBy,
      to: r.user.id,
    }),
    members: r.many.member(),
    organization: r.one.organization({
      from: r.workspaceInviteLink.organizationId,
      to: r.organization.id,
    }),
  },
}));
