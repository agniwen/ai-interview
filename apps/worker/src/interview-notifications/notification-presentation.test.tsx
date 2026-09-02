import { toCardElement } from "chat";
import { describe, expect, it } from "vitest";
import {
  InterviewNotificationCard,
  renderInterviewNotificationEmailHtml,
} from "./notification-presentation";

const input = {
  audienceType: "meeting_interviewer" as const,
  payload: {
    candidateName: "张<script>三",
    companyName: "示例科技",
    interviewLink: "http://localhost:3000/human-interview/interviewer/signed-token",
    interviewStartTime: "2026-08-24T07:55:00.000Z",
    interviewerNames: ["伊森"],
    jobName: "后端工程师",
    roundName: "技术复面",
    schemaVersion: 1 as const,
    timeZone: "Asia/Shanghai",
  },
  renderedContent: "请确认面试安排：http://localhost:3000/human-interview/interviewer/signed-token",
  renderedSubject: null,
  type: "human_interviewer_confirmation_requested" as const,
};

describe("worker interview notification presentation", () => {
  it("renders email details with a button instead of visible token text", () => {
    const html = renderInterviewNotificationEmailHtml(input);
    expect(html).toContain(">确认面试安排</a>");
    expect(html).toContain('href="http://localhost:3000/human-interview/interviewer/signed-token"');
    expect(html).not.toContain(">http://localhost:3000/human-interview/interviewer/signed-token<");
    expect(html).toContain("张&lt;script&gt;三");
    expect(html).not.toContain("张<script>三");
    expect(html).toContain("2026年8月24日（周一）15:55");
    expect(html).toContain("技术复面");
    expect(html).not.toContain("面试轮次");
  });

  it("builds a Feishu-compatible card with fields and a link button", () => {
    const card = toCardElement(InterviewNotificationCard(input));
    expect(card?.title).toBe("面试安排待确认");
    const sections = card?.children.filter((child) => child.type === "section") ?? [];
    expect(
      sections.some((section) => section.children.some((child) => child.type === "fields")),
    ).toBe(true);
    const actions = card?.children.find((child) => child.type === "actions");
    expect(actions?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "确认面试安排",
          type: "link-button",
          url: "http://localhost:3000/human-interview/interviewer/signed-token",
        }),
      ]),
    );
  });

  it("expands the candidate-accepted HR notification into a detailed status card", () => {
    const card = toCardElement(
      InterviewNotificationCard({
        ...input,
        audienceType: "selected_hr_user",
        renderedContent: "张三 已确认参加 技术复面。",
        type: "human_invitation_accepted",
      }),
    );
    expect(card?.title).toBe("候选人已确认");
    const cardText = JSON.stringify(card);
    expect(cardText).toContain("候选人已确认参加");
    expect(cardText).toContain("后端工程师");
    expect(cardText).toContain("面试安排已生效");
    expect(cardText).not.toContain("signed-token");
    expect(cardText).toContain("技术复面");
  });

  it("renders cumulative evaluation placeholders for the HR creator", () => {
    const card = toCardElement(
      InterviewNotificationCard({
        ...input,
        audienceType: "initiator_fallback",
        payload: {
          ...input.payload,
          completedAt: "2026-08-25T10:05:00.000Z",
          evaluationSummary:
            "🗂️ HR 初面评价\n・求职动机：未收集到\n\n🗂️ 业务一面评价\n・面试官：肥仔\n・综合评级：未收集到",
        },
        renderedContent: "面试评价已汇总。",
        type: "human_interview_completed",
      }),
    );
    const cardText = JSON.stringify(card);
    expect(card?.title).toBe("面试评价汇总通知");
    expect(cardText).toContain("HR 初面评价");
    expect(cardText).toContain("面试官：肥仔");
    expect(cardText).toContain("未收集到");
  });

  it("explains partial AI completion and links HR to manual generation", () => {
    const completionNotice =
      "候选人已结束 AI 面试，但部分问题未完成，系统未自动生成候选人评价表。可前往 AI 面试列表，根据已有回答生成。";
    const interviewLink = "http://localhost:3000/w/default/studio/interviews?roundId=round-1";
    const card = toCardElement(
      InterviewNotificationCard({
        ...input,
        audienceType: "selected_hr_user",
        payload: { ...input.payload, completionNotice, interviewLink },
        renderedContent: `${completionNotice}\n${interviewLink}`,
        type: "ai_interview_completed",
      }),
    );

    expect(card?.title).toBe("AI 面试已结束");
    expect(JSON.stringify(card)).toContain(completionNotice);
    expect(card?.children.find((child) => child.type === "actions")?.children).toContainEqual(
      expect.objectContaining({
        label: "前往 AI 面试列表",
        type: "link-button",
        url: interviewLink,
      }),
    );
  });

  it("explains when an AI evaluation cannot be generated", () => {
    const completionNotice =
      "候选人已结束 AI 面试，但未产生有效回答，无法生成候选人评价表。可前往 AI 面试列表查看面试记录。";
    const card = toCardElement(
      InterviewNotificationCard({
        ...input,
        audienceType: "selected_hr_user",
        payload: { ...input.payload, completionNotice },
        renderedContent: completionNotice,
        type: "ai_interview_completed",
      }),
    );

    expect(JSON.stringify(card)).toContain(completionNotice);
  });

  it("renders the first AI HR invitation email with the approved candidate copy", () => {
    const html = renderInterviewNotificationEmailHtml({
      ...input,
      audienceType: "candidate",
      payload: {
        ...input.payload,
        invitationEndTime: "2026-08-31T10:00:00.000Z",
        invitationStartTime: "2026-08-24T10:00:00.000Z",
        jobName: "高级前端开发工程师",
      },
      renderedContent: "[确认并进入面试](http://localhost:3000/ai-interview-invite/signed-token)",
      renderedSubject: "示例科技 | 在线面试邀请",
      type: "ai_interview_invited",
    });
    expect(html).toContain("张&lt;script&gt;三，您好！");
    expect(html).toContain("正式进入<strong>第一轮 HR 初面</strong>环节");
    expect(html).toContain("邀请有效时间");
    expect(html).toContain("2026年8月24日（周一）18:00");
    expect(html).toContain("2026年8月31日（周一）18:00");
    expect(html).toContain("选择【接受】或【拒绝】");
    expect(html).toContain(">确认并进入面试</a>");
  });

  it("renders the human invitation email without internal interviewer or status fields", () => {
    const html = renderInterviewNotificationEmailHtml({
      ...input,
      audienceType: "candidate",
      payload: {
        ...input.payload,
        currentRoundNumber: 3,
        invitationEndTime: "2026-08-31T10:00:00.000Z",
        invitationStartTime: "2026-08-24T10:00:00.000Z",
        previousRoundName: "技术一面",
        previousRoundNumber: 2,
        roundName: "技术二面",
      },
      renderedContent:
        "张三，您好！[确认是否参加](http://localhost:3000/human-interview/signed-token)",
      renderedSubject: "示例科技 | 在线面试邀请",
      type: "human_candidate_invitation_requested",
    });

    expect(html).toContain(
      "恭喜您通过第 2 轮 <strong>技术一面</strong>，进入第 3 轮 <strong>技术二面</strong>。",
    );
    expect(html).toContain("邀请有效时间");
    expect(html).toContain(">确认是否参加</a>");
    expect(html).toContain('href="http://localhost:3000/human-interview/signed-token"');
    expect(html).not.toContain("面试官");
    expect(html).not.toContain("当前状态");
    expect(html).not.toContain("待候选人确认");
    expect(html).not.toContain("interviewer");
  });

  it("keeps candidate schedule emails free of interviewer, status, and change-reason fields", () => {
    for (const type of [
      "human_interview_confirmed",
      "human_interview_rescheduled",
      "human_interview_cancelled",
      "human_interview_reminder",
    ] as const) {
      const html = renderInterviewNotificationEmailHtml({
        ...input,
        audienceType: "candidate",
        payload: {
          ...input.payload,
          changeReason: "内部协调",
          oldInterviewStartTime: "2026-08-23T07:55:00.000Z",
          reminderLeadTime: "1 小时",
        },
        renderedContent: "[进入在线面试](http://localhost:3000/human-interview/signed-token)",
        renderedSubject: "示例科技 | 面试通知",
        type,
      });

      expect(html).not.toContain("面试官");
      expect(html).not.toContain("当前状态");
      expect(html).not.toContain("内部协调");
      expect(html).not.toContain("变更原因");
    }
  });

  it("renders unified schedule fields for cancellation, rescheduling, and reminders", () => {
    const cancellation = toCardElement(
      InterviewNotificationCard({
        ...input,
        payload: { ...input.payload, changeReason: "内部协调" },
        renderedContent: "面试安排已取消",
        type: "human_interview_cancelled",
      }),
    );
    const reschedule = toCardElement(
      InterviewNotificationCard({
        ...input,
        payload: {
          ...input.payload,
          changeReason: "内部协调",
          oldInterviewStartTime: "2026-08-23T07:55:00.000Z",
        },
        renderedContent:
          "[进入在线面试](http://localhost:3000/human-interview/interviewer/signed-token)",
        type: "human_interview_rescheduled",
      }),
    );
    const reminder = toCardElement(
      InterviewNotificationCard({
        ...input,
        payload: { ...input.payload, reminderLeadTime: "1 小时" },
        renderedContent:
          "[进入在线面试](http://localhost:3000/human-interview/interviewer/signed-token)",
        type: "human_interview_reminder",
      }),
    );

    const cancellationText = JSON.stringify(cancellation);
    expect(cancellationText).toContain("面试轮次");
    expect(cancellationText).toContain("原面试时间");
    expect(cancellationText).not.toContain("面试官");
    expect(cancellationText).not.toContain("当前状态");
    expect(cancellationText).not.toContain("内部协调");

    const rescheduleText = JSON.stringify(reschedule);
    expect(rescheduleText).toContain("面试轮次");
    expect(rescheduleText).toContain("原面试时间");
    expect(rescheduleText).toContain("新面试时间");
    expect(rescheduleText).not.toContain("面试官");
    expect(rescheduleText).not.toContain("当前状态");
    expect(rescheduleText).not.toContain("内部协调");

    const reminderText = JSON.stringify(reminder);
    expect(reminderText).toContain("面试轮次");
    expect(reminderText).toContain("正式面试时间");
    expect(reminderText).toContain("1 小时");
    expect(reminderText).not.toContain("面试官");
    expect(reminderText).not.toContain("当前状态");
  });

  it("renders candidate AI invitation responses as HR feedback cards", () => {
    const accepted = toCardElement(
      InterviewNotificationCard({
        ...input,
        audienceType: "initiator_fallback",
        payload: {
          ...input.payload,
          responseTime: "2026-08-24T10:05:00.000Z",
        },
        renderedContent: "张三已接受第一轮 HR 初面。",
        type: "ai_invitation_accepted",
      }),
    );
    const declined = toCardElement(
      InterviewNotificationCard({
        ...input,
        audienceType: "initiator_fallback",
        payload: {
          ...input.payload,
          responseTime: "2026-08-24T10:05:00.000Z",
        },
        renderedContent: "张三已拒绝第一轮 HR 初面。",
        type: "ai_invitation_declined",
      }),
    );

    expect(accepted?.title).toBe("候选人面试反馈通知");
    expect(JSON.stringify(accepted)).toContain("接受 第一轮 HR 面试");
    expect(JSON.stringify(accepted)).toContain("等待面试开展");
    expect(JSON.stringify(accepted)).toContain("2026年8月24日（周一）18:05");
    expect(declined?.title).toBe("候选人面试反馈通知");
    expect(JSON.stringify(declined)).toContain("拒绝 第一轮 HR 面试");
    expect(JSON.stringify(declined)).toContain("面试流程终止");
  });

  it("renders AI invitation exceptions as actionable HR alert cards", () => {
    const card = toCardElement(
      InterviewNotificationCard({
        ...input,
        audienceType: "initiator_fallback",
        payload: {
          ...input.payload,
          exceptionType: "邀请已过期",
          occurredAt: "2026-08-25T10:05:00.000Z",
          suggestedAction: "请重新发起面试邀请，或人工联系候选人确认面试意向。",
        },
        renderedContent: "候选人的 AI 面试邀请已过期。",
        type: "ai_invitation_exception",
      }),
    );
    const cardText = JSON.stringify(card);

    expect(card?.title).toBe("面试接受异常告警");
    expect(cardText).toContain("候选人未能完成面试确认");
    expect(cardText).toContain("邀请已过期");
    expect(cardText).toContain("2026年8月25日（周二）18:05");
    expect(cardText).toContain("请重新发起面试邀请");
  });
});
