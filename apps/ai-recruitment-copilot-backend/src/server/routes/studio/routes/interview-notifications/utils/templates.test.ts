import { describe, expect, it } from "vitest";
import {
  CORE_INTERVIEW_NOTIFICATION_TEMPLATES,
  getInterviewNotificationTemplateVariables,
  renderInterviewNotificationTemplateContent,
} from "./templates";

describe("interview notification templates", () => {
  it("keeps every core template inside the variable allowlist", () => {
    for (const template of CORE_INTERVIEW_NOTIFICATION_TEMPLATES) {
      expect(() => getInterviewNotificationTemplateVariables(template)).not.toThrow();
    }
  });

  it("uses direct confirmation copy and no interviewer confirmation request templates", () => {
    expect(JSON.stringify(CORE_INTERVIEW_NOTIFICATION_TEMPLATES)).not.toContain(
      '"human_interviewer_confirmation_requested"',
    );
    const interviewerTemplate = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.find(
      (item) =>
        item.eventType === "human_interview_confirmed" &&
        item.audienceType === "meeting_interviewer" &&
        item.channel === "feishu",
    );
    expect(interviewerTemplate?.contentTemplate).not.toContain("全部面试官确认");
    expect(interviewerTemplate?.contentTemplate).not.toContain("请确认");
  });

  it("renders candidate arrays and missing optional values deterministically", () => {
    const template = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.find(
      (item) => item.eventType === "human_interview_confirmed" && item.audienceType === "candidate",
    );
    if (!template) {
      throw new Error("候选人真人面试确认模板不存在");
    }
    expect(
      renderInterviewNotificationTemplateContent(template, {
        candidateName: "张三",
        companyName: "示例科技",
        interviewLink: "https://example.test/interview",
        interviewStartTime: "2026-08-21 10:00",
        interviewerNames: ["李四", "王五"],
        roundName: "技术复试",
        schemaVersion: 1,
        timeZone: "Asia/Shanghai",
      }),
    ).toEqual({
      content:
        "张三，您好！\n您已确认参加本次面试。\n面试时间：2026-08-21 10:00\n[进入在线面试](https://example.test/interview)\n请提前调试麦克风、摄像头等设备，准时进入会议。",
      subject: "示例科技 | 面试安排确认",
    });
  });

  it("keeps candidate-facing human interview copy free of interviewer and internal fields", () => {
    const candidateTemplates = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.filter(
      (item) =>
        item.audienceType === "candidate" &&
        [
          "human_interview_confirmed",
          "human_interview_rescheduled",
          "human_interview_cancelled",
          "human_interview_reminder",
        ].includes(item.eventType),
    );

    expect(candidateTemplates).toHaveLength(4);
    for (const template of candidateTemplates) {
      expect(template.contentTemplate).not.toContain("{{interviewerNames}}");
      expect(template.contentTemplate).not.toContain("当前状态");
      expect(template.contentTemplate).not.toContain("{{changeReason}}");
    }
  });

  it("uses the unified round-aware copy for reschedule, cancellation, and reminders", () => {
    const templates = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.filter((item) =>
      [
        "human_interview_rescheduled",
        "human_interview_cancelled",
        "human_interview_reminder",
      ].includes(item.eventType),
    );

    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      if (template.eventType === "human_interview_reminder") {
        expect(template.contentTemplate).toContain(
          "{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动",
        );
      } else {
        expect(template.contentTemplate).toContain("候选人：{{candidateName}}");
      }
      expect(template.contentTemplate).toContain("面试轮次：{{roundName}}");
      expect(template.contentTemplate).not.toContain("{{interviewerNames}}");
      expect(template.contentTemplate).not.toContain("{{changeReason}}");
    }
  });

  it("formats ISO interview times in the payload time zone", () => {
    const template = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.find(
      (item) =>
        item.eventType === "human_candidate_invitation_requested" &&
        item.audienceType === "candidate",
    );
    if (!template) {
      throw new Error("候选人真人面试邀请模板不存在");
    }
    const rendered = renderInterviewNotificationTemplateContent(template, {
      candidateName: "张三",
      companyName: "示例科技",
      currentRoundNumber: 3,
      interviewLink: "https://example.test/interview",
      interviewStartTime: "2026-08-24T07:55:00.000Z",
      invitationEndTime: "2026-08-31T07:55:00.000Z",
      invitationStartTime: "2026-08-24T07:55:00.000Z",
      previousRoundName: "技术一面",
      previousRoundNumber: 2,
      roundName: "技术复试",
      schemaVersion: 1,
      timeZone: "Asia/Shanghai",
    });
    expect(rendered.content).toContain("邀请有效时间：2026年8月24日（周一）15:55");
    expect(rendered.content).toContain("通过第 2 轮 技术一面，进入第 3 轮 技术复试");
    expect(rendered.content).not.toContain("2026-08-24T07:55:00.000Z");
  });

  it("renders the first AI HR invitation with its invitation validity window", () => {
    const template = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.find(
      (item) => item.eventType === "ai_interview_invited" && item.audienceType === "candidate",
    );
    if (!template) {
      throw new Error("候选人 AI 初面邀请模板不存在");
    }
    expect(
      renderInterviewNotificationTemplateContent(template, {
        candidateName: "张三",
        companyName: "示例科技",
        interviewLink: "https://example.test/ai-interview",
        invitationEndTime: "2026-08-31T10:00:00.000Z",
        invitationStartTime: "2026-08-24T10:00:00.000Z",
        jobName: "高级前端开发工程师",
        schemaVersion: 1,
        timeZone: "Asia/Shanghai",
      }),
    ).toEqual({
      content:
        "张三，您好！\n您投递应聘的 高级前端开发工程师 简历已筛选通过，正式进入第一轮 HR 初面环节。\n邀请有效时间：2026年8月24日（周一）18:00 至 2026年8月31日（周一）18:00\n[确认并进入面试](https://example.test/ai-interview)\n温馨提示：请在有效期内点击链接选择【接受】或【拒绝】面试安排；邀请超时将自动失效。",
      subject: "示例科技 | 在线面试邀请",
    });
  });

  it("renders an AI invitation exception with a concrete HR action", () => {
    const template = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.find(
      (item) =>
        item.eventType === "ai_invitation_exception" && item.audienceType === "initiator_fallback",
    );
    if (!template) {
      throw new Error("AI 面试接受异常模板不存在");
    }
    const rendered = renderInterviewNotificationTemplateContent(template, {
      candidateName: "张三",
      exceptionType: "邀请已过期",
      jobName: "高级前端开发工程师",
      occurredAt: "2026-08-25T10:05:00.000Z",
      schemaVersion: 1,
      suggestedAction: "请重新发起面试邀请。",
      timeZone: "Asia/Shanghai",
    });

    expect(rendered.content).toContain("异常类型：邀请已过期");
    expect(rendered.content).toContain("发生时间：2026年8月25日（周二）18:05");
    expect(rendered.content).toContain("处理建议：请重新发起面试邀请。");
  });

  it("renders a candidate email when an AI invitation response fails", () => {
    const template = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.find(
      (item) =>
        item.eventType === "ai_invitation_exception" &&
        item.audienceType === "candidate" &&
        item.channel === "email",
    );
    if (!template) {
      throw new Error("候选人 AI 面试接受异常邮件模板不存在");
    }
    expect(
      renderInterviewNotificationTemplateContent(template, {
        candidateName: "张三",
        companyName: "示例科技",
        exceptionType: "邀请已过期",
        occurredAt: "2026-08-25T10:05:00.000Z",
        schemaVersion: 1,
        timeZone: "Asia/Shanghai",
      }),
    ).toEqual({
      content:
        "张三，您好！\n暂时无法完成您的面试确认操作，请稍后重新尝试。\n异常情况：邀请已过期\n发生时间：2026年8月25日（周二）18:05\n若面试邀请已过期失效，或您需要调整之前的确认结果，请联系招聘负责人协调重新发起邀请。",
      subject: "示例科技 | 接受面试异常",
    });
  });
});
