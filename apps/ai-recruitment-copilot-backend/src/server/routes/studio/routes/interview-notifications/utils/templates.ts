import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationEventType,
  InterviewNotificationTemplateVariable,
} from "@arc/db-schema/interview-notifications";
import {
  extractInterviewNotificationTemplateVariables,
  renderInterviewNotificationTemplate,
} from "@arc/shared/interview-notifications";

export interface InterviewNotificationTemplateContent {
  audienceType: InterviewNotificationAudienceType;
  channel: InterviewNotificationChannel;
  contentTemplate: string;
  eventType: InterviewNotificationEventType;
  subjectTemplate: string | null;
}

export const CORE_INTERVIEW_NOTIFICATION_TEMPLATES = [
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "{{candidateName}}，您好！\n恭喜您通过第 {{previousRoundNumber}} 轮 {{previousRoundName}}，进入第 {{currentRoundNumber}} 轮 {{roundName}}。\n邀请有效时间：{{invitationStartTime}} 至 {{invitationEndTime}}\n[确认是否参加]({{interviewLink}})\n温馨提示：请在有效期内选择【接受】或【拒绝】，超时邀请自动失效。",
    eventType: "human_candidate_invitation_requested",
    subjectTemplate: "{{companyName}} | 在线面试邀请",
  },
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "{{candidateName}}，您好！\n您投递应聘的 {{jobName}} 简历已筛选通过，正式进入第一轮 HR 初面环节。\n邀请有效时间：{{invitationStartTime}} 至 {{invitationEndTime}}\n[确认并进入面试]({{interviewLink}})\n温馨提示：请在有效期内点击链接选择【接受】或【拒绝】面试安排；邀请超时将自动失效。",
    eventType: "ai_interview_invited",
    subjectTemplate: "{{companyName}} | 在线面试邀请",
  },
  {
    audienceType: "selected_hr_user",
    channel: "feishu",
    contentTemplate:
      "{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；详情：{{interviewLink}}",
    eventType: "ai_report_ready",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；详情：{{interviewLink}}",
    eventType: "ai_report_ready",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "email",
    contentTemplate:
      "{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；详情：{{interviewLink}}",
    eventType: "ai_report_ready",
    subjectTemplate: "{{candidateName}} 的 AI 面试报告已生成",
  },
  {
    audienceType: "selected_hr_user",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n状态：接受 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人已确认参与面试，等待面试开展。",
    eventType: "ai_invitation_accepted",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n状态：接受 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人已确认参与面试，等待面试开展。",
    eventType: "ai_invitation_accepted",
    subjectTemplate: null,
  },
  {
    audienceType: "selected_hr_user",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n异常类型：{{exceptionType}}\n发生时间：{{occurredAt}}\n处理建议：{{suggestedAction}}",
    eventType: "ai_invitation_exception",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n异常类型：{{exceptionType}}\n发生时间：{{occurredAt}}\n处理建议：{{suggestedAction}}",
    eventType: "ai_invitation_exception",
    subjectTemplate: null,
  },
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "{{candidateName}}，您好！\n暂时无法完成您的面试确认操作，请稍后重新尝试。\n异常情况：{{exceptionType}}\n发生时间：{{occurredAt}}\n若面试邀请已过期失效，或您需要调整之前的确认结果，请联系招聘负责人协调重新发起邀请。",
    eventType: "ai_invitation_exception",
    subjectTemplate: "{{companyName}} | 接受面试异常",
  },
  {
    audienceType: "selected_hr_user",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n状态：拒绝 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人主动放弃本轮面试，面试流程终止。",
    eventType: "ai_invitation_declined",
    subjectTemplate: null,
  },
  {
    audienceType: "selected_hr_user",
    channel: "feishu",
    contentTemplate: "{{completionNotice}}\n{{interviewLink}}",
    eventType: "ai_interview_completed",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate: "{{completionNotice}}\n{{interviewLink}}",
    eventType: "ai_interview_completed",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n状态：拒绝 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人主动放弃本轮面试，面试流程终止。",
    eventType: "ai_invitation_declined",
    subjectTemplate: null,
  },
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "{{candidateName}}，您好！\n您已确认参加本次面试。\n面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n请提前调试麦克风、摄像头等设备，准时进入会议。",
    eventType: "human_interview_confirmed",
    subjectTemplate: "{{companyName}} | 面试安排确认",
  },
  {
    audienceType: "meeting_interviewer",
    channel: "feishu",
    contentTemplate:
      "业务复试安排已确认。\n候选人：{{candidateName}}\n面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}\n[进入在线面试]({{interviewLink}})\n请提前预留时间，准时参与面试。",
    eventType: "human_interview_confirmed",
    subjectTemplate: null,
  },
  {
    audienceType: "meeting_interviewer",
    channel: "email",
    contentTemplate:
      "你已被安排参加 {{candidateName}} 的面试。\n面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n请提前预留时间，准时参与面试。",
    eventType: "human_interview_confirmed",
    subjectTemplate: "{{candidateName}} | 面试安排确认",
  },
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})",
    eventType: "human_interview_rescheduled",
    subjectTemplate: "{{companyName}} | 面试改期通知",
  },
  {
    audienceType: "meeting_interviewer",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})",
    eventType: "human_interview_rescheduled",
    subjectTemplate: null,
  },
  {
    audienceType: "meeting_interviewer",
    channel: "email",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})",
    eventType: "human_interview_rescheduled",
    subjectTemplate: "{{candidateName}} | 面试改期通知",
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[查看面试安排]({{interviewLink}})",
    eventType: "human_interview_rescheduled",
    subjectTemplate: null,
  },
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}",
    eventType: "human_interview_cancelled",
    subjectTemplate: "{{companyName}} | 面试取消通知",
  },
  {
    audienceType: "meeting_interviewer",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}",
    eventType: "human_interview_cancelled",
    subjectTemplate: null,
  },
  {
    audienceType: "meeting_interviewer",
    channel: "email",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}",
    eventType: "human_interview_cancelled",
    subjectTemplate: "{{candidateName}} | 面试取消通知",
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}",
    eventType: "human_interview_cancelled",
    subjectTemplate: null,
  },
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。",
    eventType: "human_interview_reminder",
    subjectTemplate: "{{companyName}} | 面试即将开始提醒",
  },
  {
    audienceType: "meeting_interviewer",
    channel: "feishu",
    contentTemplate:
      "{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。",
    eventType: "human_interview_reminder",
    subjectTemplate: null,
  },
  {
    audienceType: "meeting_interviewer",
    channel: "email",
    contentTemplate:
      "{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。",
    eventType: "human_interview_reminder",
    subjectTemplate: "{{candidateName}} | 面试即将开始提醒",
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[查看面试安排]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。",
    eventType: "human_interview_reminder",
    subjectTemplate: null,
  },
  {
    audienceType: "candidate",
    channel: "email",
    contentTemplate:
      "{{candidateName}}，您好！\n暂时无法确认您的面试安排，请稍后重试。\n异常情况：{{exceptionType}}\n发生时间：{{occurredAt}}\n如邀请已失效，请联系招聘负责人重新发起邀请。",
    eventType: "human_invitation_exception",
    subjectTemplate: "{{companyName}} | 接受面试异常",
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n面试：{{roundName}}\n异常类型：{{exceptionType}}\n发生时间：{{occurredAt}}\n处理建议：{{suggestedAction}}",
    eventType: "human_invitation_exception",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n状态：接受 {{roundName}}\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人已确认参与面试，面试安排已生效，并已通知面试官。",
    eventType: "human_invitation_accepted",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n状态：拒绝 {{roundName}}\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人拒绝本次面试，请及时联系并跟进。",
    eventType: "human_invitation_declined",
    subjectTemplate: null,
  },
  {
    audienceType: "selected_hr_user",
    channel: "feishu",
    contentTemplate: "{{interviewerNames}} 已接受 {{candidateName}} 的面试官邀请。",
    eventType: "human_interviewer_added",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate: "{{interviewerNames}} 已接受 {{candidateName}} 的面试官邀请。",
    eventType: "human_interviewer_added",
    subjectTemplate: null,
  },
  {
    audienceType: "initiator_fallback",
    channel: "feishu",
    contentTemplate:
      "候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n面试完成时间：{{completedAt}}\n当前完成面试：{{roundName}}\n\n{{evaluationSummary}}\n\n[前往招聘系统查看完整记录]({{interviewLink}})",
    eventType: "human_interview_completed",
    subjectTemplate: null,
  },
] as const satisfies readonly InterviewNotificationTemplateContent[];

export function getInterviewNotificationTemplateVariables(
  template: InterviewNotificationTemplateContent,
): InterviewNotificationTemplateVariable[] {
  return extractInterviewNotificationTemplateVariables(
    template.subjectTemplate,
    template.contentTemplate,
  );
}

export interface RenderedInterviewNotificationTemplate {
  content: string;
  subject: string | null;
}

export function renderInterviewNotificationTemplateContent(
  template: Pick<InterviewNotificationTemplateContent, "contentTemplate" | "subjectTemplate">,
  payload: Parameters<typeof renderInterviewNotificationTemplate>[1],
): RenderedInterviewNotificationTemplate {
  return {
    content: renderInterviewNotificationTemplate(template.contentTemplate, payload),
    subject: template.subjectTemplate
      ? renderInterviewNotificationTemplate(template.subjectTemplate, payload)
      : null,
  };
}
