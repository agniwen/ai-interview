/* oxlint-disable max-lines -- schema relations remain centralized by repository convention */
import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  candidateFormSubmission: {
    interviewRecord: r.one.studioInterview({
      from: r.candidateFormSubmission.interviewRecordId,
      to: r.studioInterview.id,
    }),
    organization: r.one.organization({
      from: r.candidateFormSubmission.organizationId,
      to: r.organization.id,
    }),
    template: r.one.candidateFormTemplate({
      from: r.candidateFormSubmission.templateId,
      to: r.candidateFormTemplate.id,
    }),
    version: r.one.candidateFormTemplateVersion({
      from: r.candidateFormSubmission.versionId,
      to: r.candidateFormTemplateVersion.id,
    }),
  },
  candidateFormTemplate: {
    jobDescriptionLinks: r.many.candidateFormTemplateJobDescription(),
    organization: r.one.organization({
      from: r.candidateFormTemplate.organizationId,
      to: r.organization.id,
    }),
    questions: r.many.candidateFormTemplateQuestion(),
    submissions: r.many.candidateFormSubmission(),
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
    submissions: r.many.candidateFormSubmission(),
    template: r.one.candidateFormTemplate({
      from: r.candidateFormTemplateVersion.templateId,
      to: r.candidateFormTemplate.id,
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
  interviewAuditLog: {
    organization: r.one.organization({
      from: r.interviewAuditLog.organizationId,
      to: r.organization.id,
    }),
  },
  interviewConversation: {
    interviewRecord: r.one.studioInterview({
      from: r.interviewConversation.interviewRecordId,
      to: r.studioInterview.id,
    }),
    organization: r.one.organization({
      from: r.interviewConversation.organizationId,
      to: r.organization.id,
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
    organization: r.one.organization({
      from: r.interviewConversationTurn.organizationId,
      to: r.organization.id,
    }),
  },
  interviewNotification: {
    organization: r.one.organization({
      from: r.interviewNotification.organizationId,
      to: r.organization.id,
    }),
  },
  interviewQuestionTemplate: {
    jobDescriptionLinks: r.many.interviewQuestionTemplateJobDescription(),
    organization: r.one.organization({
      from: r.interviewQuestionTemplate.organizationId,
      to: r.organization.id,
    }),
  },
  interviewQuestionTemplateBinding: {
    organization: r.one.organization({
      from: r.interviewQuestionTemplateBinding.organizationId,
      to: r.organization.id,
    }),
  },
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
    resumeJobMatchCandidates: r.many.resumeJobMatchCandidate(),
    resumeJobMatchRuns: r.many.resumeJobMatchRun(),
    studioInterviews: r.many.studioInterview(),
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
    evaluationFailures: r.many.resumeEvaluationFailure(),
    evaluations: r.many.resumeEvaluationVersion(),
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
    meeting: r.one.meetingSession({
      from: r.meetingRecruitingContext.meetingId,
      to: r.meetingSession.id,
    }),
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
    recruitingContext: r.one.meetingRecruitingContext({
      from: r.meetingSession.id,
      to: r.meetingRecruitingContext.meetingId,
    }),
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
    candidateFormSubmissions: r.many.candidateFormSubmission(),
    candidateFormTemplates: r.many.candidateFormTemplate(),
    chatAttachments: r.many.chatAttachment(),
    chatConversations: r.many.chatConversation(),
    chatMessages: r.many.chatMessage(),
    departments: r.many.department(),
    feishuThreadStates: r.many.feishuThreadState(),
    globalConfigs: r.many.globalConfig(),
    interviewAuditLogs: r.many.interviewAuditLog(),
    interviewConversationTurns: r.many.interviewConversationTurn(),
    interviewConversations: r.many.interviewConversation(),
    interviewNotifications: r.many.interviewNotification(),
    interviewQuestionTemplateBindings: r.many.interviewQuestionTemplateBinding(),
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
    resumeEvaluationFailures: r.many.resumeEvaluationFailure(),
    resumeEvaluationVersions: r.many.resumeEvaluationVersion(),
    studioHumanInterviewMeetings: r.many.studioHumanInterviewMeeting(),
    studioInterviewSchedules: r.many.studioInterviewSchedule(),
    studioInterviews: r.many.studioInterview(),
    studioOrgSkills: r.many.studioOrgSkill(),
    studioRoundEmailLogs: r.many.studioRoundEmailLog(),
    workspaceInviteLinks: r.many.workspaceInviteLink(),
  },
  organizationRole: {
    organization: r.one.organization({
      from: r.organizationRole.organizationId,
      to: r.organization.id,
    }),
  },
  resumeEvaluationFailure: {
    jobDescriptionVersion: r.one.jobDescriptionVersion({
      from: r.resumeEvaluationFailure.jobDescriptionVersionId,
      to: r.jobDescriptionVersion.id,
    }),
    organization: r.one.organization({
      from: r.resumeEvaluationFailure.organizationId,
      to: r.organization.id,
    }),
    resumeRecord: r.one.studioInterview({
      from: r.resumeEvaluationFailure.resumeRecordId,
      to: r.studioInterview.id,
    }),
  },
  resumeEvaluationVersion: {
    jobDescriptionVersion: r.one.jobDescriptionVersion({
      from: r.resumeEvaluationVersion.jobDescriptionVersionId,
      to: r.jobDescriptionVersion.id,
    }),
    organization: r.one.organization({
      from: r.resumeEvaluationVersion.organizationId,
      to: r.organization.id,
    }),
    resumeRecord: r.one.studioInterview({
      from: r.resumeEvaluationVersion.resumeRecordId,
      to: r.studioInterview.id,
    }),
  },
  resumeJobMatchCandidate: {
    jobDescription: r.one.jobDescription({
      from: r.resumeJobMatchCandidate.jobDescriptionId,
      to: r.jobDescription.id,
    }),
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
    organization: r.one.organization({
      from: r.resumeJobMatchRun.organizationId,
      to: r.organization.id,
    }),
    poolItem: r.one.resumePoolItem({
      from: r.resumeJobMatchRun.poolItemId,
      to: r.resumePoolItem.id,
    }),
    selectedJobDescription: r.one.jobDescription({
      from: r.resumeJobMatchRun.selectedJobDescriptionId,
      to: r.jobDescription.id,
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
    importedByUser: r.one.user({
      from: r.resumePoolImport.importedBy,
      to: r.user.id,
    }),
    importedResumeRecord: r.one.studioInterview({
      from: r.resumePoolImport.importedResumeRecordId,
      to: r.studioInterview.id,
    }),
    organization: r.one.organization({
      from: r.resumePoolImport.organizationId,
      to: r.organization.id,
    }),
    poolItem: r.one.resumePoolItem({
      from: r.resumePoolImport.poolItemId,
      to: r.resumePoolItem.id,
    }),
  },
  resumePoolItem: {
    createdByUser: r.one.user({
      from: r.resumePoolItem.createdBy,
      to: r.user.id,
    }),
    events: r.many.resumePoolEvent(),
    imports: r.many.resumePoolImport(),
    jobDescription: r.one.jobDescription({
      from: r.resumePoolItem.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    jobMatchRuns: r.many.resumeJobMatchRun(),
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
    createdByUser: r.one.user({
      from: r.studioHumanInterviewMeeting.createdBy,
      to: r.user.id,
    }),
    events: r.many.studioHumanInterviewMeetingEvent(),
    interviewers: r.many.studioHumanInterviewMeetingInterviewer(),
    organization: r.one.organization({
      from: r.studioHumanInterviewMeeting.organizationId,
      to: r.organization.id,
    }),
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
    user: r.one.user({
      from: r.studioHumanInterviewMeetingInterviewer.userId,
      to: r.user.id,
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
    organization: r.one.organization({
      from: r.studioHumanInterviewRound.organizationId,
      to: r.organization.id,
    }),
  },
  studioHumanInterviewRoundInterviewer: {
    round: r.one.studioHumanInterviewRound({
      from: r.studioHumanInterviewRoundInterviewer.roundId,
      to: r.studioHumanInterviewRound.id,
    }),
    user: r.one.user({
      from: r.studioHumanInterviewRoundInterviewer.userId,
      to: r.user.id,
    }),
  },
  studioInterview: {
    candidateFormSubmissions: r.many.candidateFormSubmission(),
    conversationTurns: r.many.interviewConversationTurn(),
    conversations: r.many.interviewConversation(),
    evaluationFailures: r.many.resumeEvaluationFailure(),
    evaluationVersions: r.many.resumeEvaluationVersion(),
    humanInterviewRounds: r.many.studioHumanInterviewRound(),
    jobDescription: r.one.jobDescription({
      from: r.studioInterview.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    meetingContexts: r.many.meetingRecruitingContext(),
    offerDrafts: r.many.studioOfferDraft(),
    organization: r.one.organization({
      from: r.studioInterview.organizationId,
      to: r.organization.id,
    }),
    qualitativeAttemptJobDescriptionVersion: r.one.jobDescriptionVersion({
      from: r.studioInterview.qualitativeAttemptJobDescriptionVersionId,
      to: r.jobDescriptionVersion.id,
    }),
    qualitativeJobDescriptionVersion: r.one.jobDescriptionVersion({
      from: r.studioInterview.qualitativeJobDescriptionVersionId,
      to: r.jobDescriptionVersion.id,
    }),
    roundEmailLogs: r.many.studioRoundEmailLog(),
    scheduleEntries: r.many.studioInterviewSchedule(),
    sourcePoolImports: r.many.resumePoolImport(),
    sourcePoolItem: r.one.resumePoolItem({
      from: r.studioInterview.resumeSourcePoolItemId,
      to: r.resumePoolItem.id,
    }),
    user: r.one.user({
      from: r.studioInterview.createdBy,
      to: r.user.id,
    }),
  },
  studioInterviewSchedule: {
    emailLogs: r.many.studioRoundEmailLog(),
    interviewRecord: r.one.studioInterview({
      from: r.studioInterviewSchedule.interviewRecordId,
      to: r.studioInterview.id,
    }),
    organization: r.one.organization({
      from: r.studioInterviewSchedule.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.studioInterviewSchedule.createdBy,
      to: r.user.id,
    }),
  },
  studioOfferDraft: {
    interviewRecord: r.one.studioInterview({
      from: r.studioOfferDraft.interviewRecordId,
      to: r.studioInterview.id,
    }),
    organization: r.one.organization({
      from: r.studioOfferDraft.organizationId,
      to: r.organization.id,
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
    organization: r.one.organization({
      from: r.studioRoundEmailLog.organizationId,
      to: r.organization.id,
    }),
    round: r.one.studioInterviewSchedule({
      from: r.studioRoundEmailLog.roundId,
      to: r.studioInterviewSchedule.id,
    }),
    sentByUser: r.one.user({
      from: r.studioRoundEmailLog.sentBy,
      to: r.user.id,
    }),
  },
  user: {
    account: r.many.account(),
    candidateFormTemplates: r.many.candidateFormTemplate(),
    chatAttachment: r.many.chatAttachment(),
    chatConversation: r.many.chatConversation(),
    departments: r.many.department(),
    interviewers: r.many.interviewer(),
    invitationsSent: r.many.invitation(),
    jobDescriptions: r.many.jobDescription(),
    memberships: r.many.member(),
    session: r.many.session(),
    studioHumanInterviewMeetingInterviewer: r.many.studioHumanInterviewMeetingInterviewer(),
    studioHumanInterviewMeetingsCreated: r.many.studioHumanInterviewMeeting({
      from: r.user.id,
      to: r.studioHumanInterviewMeeting.createdBy,
    }),
    studioInterview: r.many.studioInterview(),
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
