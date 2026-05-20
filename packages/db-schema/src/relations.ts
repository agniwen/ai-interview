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
    interviewQuestionTemplateLinks: r.many.interviewQuestionTemplateJobDescription(),
    interviewerLinks: r.many.jobDescriptionInterviewer(),
    organization: r.one.organization({
      from: r.jobDescription.organizationId,
      to: r.organization.id,
    }),
    studioInterviews: r.many.studioInterview(),
    user: r.one.user({
      from: r.jobDescription.createdBy,
      to: r.user.id,
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
    members: r.many.member(),
    studioInterviewSchedules: r.many.studioInterviewSchedule(),
    studioInterviews: r.many.studioInterview(),
    studioOrgSkills: r.many.studioOrgSkill(),
    studioRoundEmailLogs: r.many.studioRoundEmailLog(),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  studioInterview: {
    candidateFormSubmissions: r.many.candidateFormSubmission(),
    conversationTurns: r.many.interviewConversationTurn(),
    conversations: r.many.interviewConversation(),
    jobDescription: r.one.jobDescription({
      from: r.studioInterview.jobDescriptionId,
      to: r.jobDescription.id,
    }),
    organization: r.one.organization({
      from: r.studioInterview.organizationId,
      to: r.organization.id,
    }),
    roundEmailLogs: r.many.studioRoundEmailLog(),
    scheduleEntries: r.many.studioInterviewSchedule(),
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
    studioInterview: r.many.studioInterview(),
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
