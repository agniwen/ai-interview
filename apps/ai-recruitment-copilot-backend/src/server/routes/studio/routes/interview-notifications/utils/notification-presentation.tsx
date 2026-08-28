import { Actions, Card, CardText, Divider, Field, Fields, LinkButton, Section } from "chat";
import type { CardChild } from "chat";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationEventType,
  InterviewNotificationPayloadSnapshot,
} from "@arc/db-schema/interview-notifications";
import { formatInterviewNotificationDateTime } from "@arc/shared/interview-notifications";

interface NotificationPresentationInput {
  audienceType: InterviewNotificationAudienceType;
  payload: InterviewNotificationPayloadSnapshot;
  renderedContent: string;
  renderedSubject: string | null;
  type: InterviewNotificationEventType;
}

interface NotificationAction {
  label: string;
  url: string;
}

interface NotificationField {
  label: string;
  value: string;
}

function notificationCopy(
  values: Partial<Record<InterviewNotificationEventType, string>>,
  type: InterviewNotificationEventType,
): string | undefined {
  return values[type];
}

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/;
const BARE_URL_PATTERN = /https?:\/\/[^\s，。；]+/;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function actionLabel(input: NotificationPresentationInput): string {
  if (input.type === "human_candidate_invitation_requested") {
    return "确认是否参加";
  }
  if (input.type === "human_interviewer_confirmation_requested") {
    return "确认面试安排";
  }
  if (input.type === "ai_interview_invited") {
    return "确认并进入面试";
  }
  if (input.type === "ai_report_ready") {
    return "查看面试报告";
  }
  if (input.type === "ai_interview_completed") {
    return "前往 AI 面试列表";
  }
  return "查看面试安排";
}

function resolveNotificationAction(
  input: NotificationPresentationInput,
): NotificationAction | null {
  const markdownLink = MARKDOWN_LINK_PATTERN.exec(input.renderedContent);
  const bareUrl = BARE_URL_PATTERN.exec(input.renderedContent);
  const url = markdownLink?.[2] ?? bareUrl?.[0];
  if (!url) {
    return null;
  }
  return {
    label: markdownLink?.[1]?.trim() || actionLabel(input),
    url,
  };
}

function notificationTitle(input: NotificationPresentationInput): string {
  const titles = {
    ai_interview_completed: "AI 面试已结束",
    ai_interview_invited: "在线面试邀请",
    ai_invitation_accepted: "候选人面试反馈通知",
    ai_invitation_declined: "候选人面试反馈通知",
    ai_invitation_exception: "面试接受异常告警",
    ai_report_ready: "AI 面试报告已生成",
    human_candidate_invitation_requested: "在线面试邀请",
    human_interview_cancelled: "面试安排已取消",
    human_interview_completed: "面试评价汇总通知",
    human_interview_confirmed: "业务复试安排已确认",
    human_interview_reminder: "面试即将开始提醒",
    human_interview_rescheduled: "面试时间已调整",
    human_interviewer_confirmation_requested: "面试安排待确认",
    human_interviewer_confirmed: "面试官已确认",
    human_interviewer_declined: "面试官无法参加",
    human_invitation_accepted: "候选人已确认",
    human_invitation_declined: "候选人已拒绝",
    human_invitation_exception: "候选人面试接受异常",
  } satisfies Partial<Record<InterviewNotificationEventType, string>>;
  return notificationCopy(titles, input.type) ?? input.renderedSubject?.trim() ?? "面试通知";
}

function notificationStatus(type: InterviewNotificationEventType): string | null {
  const statuses = {
    ai_interview_completed: "已结束",
    ai_invitation_accepted: "接受 第一轮 HR 面试",
    ai_invitation_declined: "拒绝 第一轮 HR 面试",
    human_candidate_invitation_requested: "待候选人确认",
    human_interview_cancelled: "已取消",
    human_interview_completed: "已结束",
    human_interview_confirmed: "安排已确认",
    human_interview_reminder: "即将开始",
    human_interview_rescheduled: "时间已调整",
    human_interviewer_confirmation_requested: "待确认",
    human_interviewer_confirmed: "面试官已确认",
    human_interviewer_declined: "面试官无法参加",
    human_invitation_accepted: "候选人已接受",
    human_invitation_declined: "候选人已拒绝",
    human_invitation_exception: "接受异常",
  } satisfies Partial<Record<InterviewNotificationEventType, string>>;
  return notificationCopy(statuses, type) ?? null;
}

function notificationSummary(input: NotificationPresentationInput): string {
  if (input.type === "ai_interview_completed" && input.payload.completionNotice) {
    return input.payload.completionNotice;
  }
  if (input.type === "human_interview_completed" && input.payload.evaluationSummary) {
    return input.payload.evaluationSummary;
  }
  const summaries = {
    ai_interview_invited: "请在邀请有效期内确认是否参加第一轮 HR 初面。",
    ai_invitation_accepted: "候选人已确认参与面试，等待面试开展。",
    ai_invitation_declined: "候选人主动放弃本轮面试，面试流程终止。",
    ai_invitation_exception: "候选人未能完成面试确认，请及时查看异常原因并跟进。",
    human_candidate_invitation_requested: "请在邀请有效期内确认是否参加本次面试。",
    human_interview_cancelled: "本轮面试已取消，对应提醒不再继续发送。",
    human_interview_confirmed: "候选人已接受，面试安排已生效，请按约定时间参加。",
    human_interview_reminder: "面试即将开始，请提前调试设备并准时进入会议。",
    human_interview_rescheduled: "HR 已调整面试时间，请以新时间为准。",
    human_interviewer_confirmation_requested: "请确认你是否可以参加当前面试安排。",
    human_interviewer_confirmed: "已有面试官确认当前安排，系统将继续等待其他参与人确认。",
    human_interviewer_declined: "面试官无法参加当前安排，请 HR 及时改期或更换面试官。",
    human_invitation_accepted: "候选人已确认参加，面试安排已生效并已通知面试官。",
    human_invitation_declined: "候选人拒绝本轮面试，请 HR 及时联系并跟进。",
    human_invitation_exception: "候选人未能完成面试确认，请及时查看异常原因并跟进。",
  } satisfies Partial<Record<InterviewNotificationEventType, string>>;
  return notificationCopy(summaries, input.type) ?? "请查看本次面试的最新状态与安排。";
}

// oxlint-disable-next-line complexity -- notification fields intentionally vary by event and audience.
function buildNotificationFields(input: NotificationPresentationInput): NotificationField[] {
  const { payload } = input;
  const usesUnifiedScheduleCopy =
    input.type === "human_interview_cancelled" ||
    input.type === "human_interview_reminder" ||
    input.type === "human_interview_rescheduled";
  const isCandidateFacing = input.audienceType === "candidate";
  const fields: NotificationField[] = [];
  const add = (label: string, value: string | null | undefined) => {
    const normalized = value?.trim();
    if (normalized) {
      fields.push({ label, value: normalized });
    }
  };
  add("候选人", payload.candidateName);
  if (!usesUnifiedScheduleCopy) {
    add("应聘岗位", payload.jobName);
  }
  if (input.type.startsWith("human_")) {
    add(usesUnifiedScheduleCopy ? "面试轮次" : "面试", payload.roundName);
  }
  if (
    input.type === "ai_interview_invited" ||
    input.type === "human_candidate_invitation_requested"
  ) {
    add(
      "邀请开始时间",
      formatInterviewNotificationDateTime(payload.invitationStartTime, payload.timeZone),
    );
    add(
      "邀请截止时间",
      formatInterviewNotificationDateTime(payload.invitationEndTime, payload.timeZone),
    );
  } else if (input.type === "ai_invitation_accepted" || input.type === "ai_invitation_declined") {
    add("当前状态", notificationStatus(input.type));
    add("反馈时间", formatInterviewNotificationDateTime(payload.responseTime, payload.timeZone));
  } else if (
    input.type === "ai_invitation_exception" ||
    input.type === "human_invitation_exception"
  ) {
    add("异常类型", payload.exceptionType);
    add("发生时间", formatInterviewNotificationDateTime(payload.occurredAt, payload.timeZone));
    add("处理建议", payload.suggestedAction);
  } else if (input.type === "human_interview_rescheduled") {
    add(
      "原面试时间",
      formatInterviewNotificationDateTime(payload.oldInterviewStartTime, payload.timeZone),
    );
    add(
      "新面试时间",
      formatInterviewNotificationDateTime(payload.interviewStartTime, payload.timeZone),
    );
  } else if (input.type === "human_interview_cancelled") {
    add(
      "原面试时间",
      formatInterviewNotificationDateTime(payload.interviewStartTime, payload.timeZone),
    );
  } else {
    add(
      input.type === "human_interview_reminder" ? "正式面试时间" : "面试时间",
      formatInterviewNotificationDateTime(payload.interviewStartTime, payload.timeZone),
    );
  }
  if (input.type === "human_interview_reminder") {
    add("距离开始", payload.reminderLeadTime);
  }
  if (input.type === "human_interview_completed") {
    add("完成时间", formatInterviewNotificationDateTime(payload.completedAt, payload.timeZone));
  }
  if (!(isCandidateFacing || usesUnifiedScheduleCopy)) {
    add("面试官", payload.interviewerNames?.join("、"));
    if (input.type !== "ai_invitation_accepted" && input.type !== "ai_invitation_declined") {
      add("当前状态", notificationStatus(input.type));
    }
    add("变更原因", payload.changeReason);
  }
  return fields;
}

export function InterviewNotificationCard(input: NotificationPresentationInput) {
  const action = resolveNotificationAction(input);
  const fields = buildNotificationFields(input);
  const children: CardChild[] = [Section([CardText(notificationSummary(input))])];
  if (fields.length > 0) {
    children.push(
      Divider(),
      Section([Fields(fields.map((field) => Field({ label: field.label, value: field.value })))]),
    );
  }
  if (action) {
    children.push(
      Divider(),
      Actions([LinkButton({ label: action.label, style: "primary", url: action.url })]),
    );
  }
  return Card({
    children,
    subtitle: input.payload.companyName,
    title: notificationTitle(input),
  });
}

export function renderInterviewNotificationEmailHtml(input: NotificationPresentationInput): string {
  const action = resolveNotificationAction(input);
  if (input.type === "ai_interview_invited") {
    const candidateName = escapeHtml(input.payload.candidateName ?? "候选人");
    const companyName = escapeHtml(input.payload.companyName ?? "AI HR");
    const jobName = escapeHtml(input.payload.jobName ?? "应聘岗位");
    const invitationStartTime = escapeHtml(
      formatInterviewNotificationDateTime(
        input.payload.invitationStartTime,
        input.payload.timeZone,
      ),
    );
    const invitationEndTime = escapeHtml(
      formatInterviewNotificationDateTime(input.payload.invitationEndTime, input.payload.timeZone),
    );
    const actionHtml = action
      ? `<tr><td style="padding:8px 32px 28px;text-align:center;">
        <a href="${escapeHtml(action.url)}" style="display:inline-block;border-radius:8px;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;line-height:22px;padding:12px 24px;text-decoration:none;">${escapeHtml(action.label)}</a>
      </td></tr>`
      : "";
    return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border:1px solid #e4e7ec;border-radius:14px;background:#ffffff;">
          <tr><td style="padding:28px 32px 18px;color:#101828;font-size:22px;font-weight:700;line-height:30px;">在线面试邀请</td></tr>
          <tr><td style="padding:0 32px 12px;color:#344054;font-size:15px;line-height:26px;">${candidateName}，您好！</td></tr>
          <tr><td style="padding:0 32px 20px;color:#344054;font-size:15px;line-height:26px;">您投递应聘的 <strong>${jobName}</strong> 简历已筛选通过，正式进入<strong>第一轮 HR 初面</strong>环节。</td></tr>
          <tr><td style="padding:0 32px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border-radius:10px;background:#f8fafc;">
              <tr>
                <td style="padding:12px;color:#667085;font-size:14px;vertical-align:top;white-space:nowrap;">邀请有效时间</td>
                <td style="padding:12px;color:#101828;font-size:14px;font-weight:600;vertical-align:top;">${invitationStartTime} 至 ${invitationEndTime}</td>
              </tr>
            </table>
          </td></tr>
          ${actionHtml}
          <tr><td style="padding:0 32px 26px;color:#667085;font-size:13px;line-height:22px;">温馨提示：请在有效期内点击链接选择【接受】或【拒绝】面试安排；邀请超时将自动失效。</td></tr>
          <tr><td style="border-top:1px solid #eaecf0;padding:18px 32px;color:#98a2b3;font-size:12px;line-height:18px;">此邮件由 ${companyName} 自动发送，请勿直接回复。</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }
  if (input.type === "human_candidate_invitation_requested" && input.audienceType === "candidate") {
    const candidateName = escapeHtml(input.payload.candidateName ?? "候选人");
    const companyName = escapeHtml(input.payload.companyName ?? "AI HR");
    const roundName = escapeHtml(input.payload.roundName ?? "本轮面试");
    const previousRoundName = escapeHtml(input.payload.previousRoundName ?? "HR 初面");
    const previousRoundNumber = input.payload.previousRoundNumber ?? 1;
    const currentRoundNumber = input.payload.currentRoundNumber ?? previousRoundNumber + 1;
    const invitationStartTime = escapeHtml(
      formatInterviewNotificationDateTime(
        input.payload.invitationStartTime,
        input.payload.timeZone,
      ),
    );
    const invitationEndTime = escapeHtml(
      formatInterviewNotificationDateTime(input.payload.invitationEndTime, input.payload.timeZone),
    );
    const actionHtml = action
      ? `<tr><td style="padding:8px 32px 28px;text-align:center;">
        <a href="${escapeHtml(action.url)}" style="display:inline-block;border-radius:8px;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;line-height:22px;padding:12px 24px;text-decoration:none;">${escapeHtml(action.label)}</a>
      </td></tr>`
      : "";
    return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border:1px solid #e4e7ec;border-radius:14px;background:#ffffff;">
          <tr><td style="padding:28px 32px 18px;color:#101828;font-size:22px;font-weight:700;line-height:30px;">在线面试邀请</td></tr>
          <tr><td style="padding:0 32px 12px;color:#344054;font-size:15px;line-height:26px;">${candidateName}，您好！</td></tr>
          <tr><td style="padding:0 32px 20px;color:#344054;font-size:15px;line-height:26px;">恭喜您通过第 ${previousRoundNumber} 轮 <strong>${previousRoundName}</strong>，进入第 ${currentRoundNumber} 轮 <strong>${roundName}</strong>。</td></tr>
          <tr><td style="padding:0 32px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border-radius:10px;background:#f8fafc;">
              <tr>
                <td style="padding:12px;color:#667085;font-size:14px;vertical-align:top;white-space:nowrap;">邀请有效时间</td>
                <td style="padding:12px;color:#101828;font-size:14px;font-weight:600;vertical-align:top;">${invitationStartTime} 至 ${invitationEndTime}</td>
              </tr>
            </table>
          </td></tr>
          ${actionHtml}
          <tr><td style="padding:0 32px 26px;color:#667085;font-size:13px;line-height:22px;">温馨提示：请在有效期内点击链接选择【接受】或【拒绝】面试安排；邀请超时将自动失效。</td></tr>
          <tr><td style="border-top:1px solid #eaecf0;padding:18px 32px;color:#98a2b3;font-size:12px;line-height:18px;">此邮件由 ${companyName} 自动发送，请勿直接回复。</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }
  const fields = buildNotificationFields(input);
  const fieldRows = fields
    .map(
      (field) => `<tr>
        <td style="padding:8px 12px;color:#667085;font-size:14px;vertical-align:top;white-space:nowrap;">${escapeHtml(field.label)}</td>
        <td style="padding:8px 12px;color:#101828;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(field.value)}</td>
      </tr>`,
    )
    .join("");
  const actionHtml = action
    ? `<tr><td style="padding:8px 32px 32px;text-align:center;">
        <a href="${escapeHtml(action.url)}" style="display:inline-block;border-radius:8px;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;line-height:22px;padding:12px 24px;text-decoration:none;">${escapeHtml(action.label)}</a>
      </td></tr>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border:1px solid #e4e7ec;border-radius:14px;background:#ffffff;">
          <tr><td style="padding:28px 32px 8px;color:#101828;font-size:22px;font-weight:700;line-height:30px;">${escapeHtml(notificationTitle(input))}</td></tr>
          <tr><td style="padding:0 32px 22px;color:#667085;font-size:14px;line-height:22px;white-space:pre-line;">${escapeHtml(notificationSummary(input))}</td></tr>
          <tr><td style="padding:0 20px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border-radius:10px;background:#f8fafc;">${fieldRows}</table>
          </td></tr>
          ${actionHtml}
          <tr><td style="border-top:1px solid #eaecf0;padding:18px 32px;color:#98a2b3;font-size:12px;line-height:18px;">此邮件由 ${escapeHtml(input.payload.companyName ?? "AI HR")} 自动发送，请勿直接回复。</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
