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
    user: r.one.user({
      from: r.chatAttachment.userId,
      to: r.user.id,
    }),
  },
  chatConversation: {
    messages: r.many.chatMessage(),
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
  },
  department: {
    interviewers: r.many.interviewer(),
    jobDescriptions: r.many.jobDescription(),
    user: r.one.user({
      from: r.department.createdBy,
      to: r.user.id,
    }),
  },
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
  interviewQuestionTemplate: {
    jobDescriptionLinks: r.many.interviewQuestionTemplateJobDescription(),
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
    user: r.one.user({
      from: r.interviewer.createdBy,
      to: r.user.id,
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
    scheduleEntries: r.many.studioInterviewSchedule(),
    user: r.one.user({
      from: r.studioInterview.createdBy,
      to: r.user.id,
    }),
  },
  studioInterviewSchedule: {
    interviewRecord: r.one.studioInterview({
      from: r.studioInterviewSchedule.interviewRecordId,
      to: r.studioInterview.id,
    }),
  },
  user: {
    account: r.many.account(),
    candidateFormTemplates: r.many.candidateFormTemplate(),
    chatAttachment: r.many.chatAttachment(),
    chatConversation: r.many.chatConversation(),
    departments: r.many.department(),
    interviewers: r.many.interviewer(),
    jobDescriptions: r.many.jobDescription(),
    session: r.many.session(),
    studioInterview: r.many.studioInterview(),
  },
}));
