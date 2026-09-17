import { describe, expect, it } from "vitest";
import { renderInterviewSummaryEmail, renderRoundInviteEmail } from "../templates";

describe("renderRoundInviteEmail", () => {
  it("uses scoped manual invitation copy with the real expiry and job", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "张居正",
      companyName: "ACE科技",
      interviewUrl: "https://example.com/interview/current",
      manualInvitation: {
        expiresAt: new Date("2026-09-12T02:00:00Z"),
        jobName: "高级前端开发工程师",
      },
      roundLabel: "内部轮次标签",
      scheduledAt: new Date("2026-09-10T02:00:00Z"),
    });
    expect(result.subject).toBe("ACE科技 | AI HR 初面 邀请");
    for (const body of [result.html, result.text]) {
      expect(body).toContain("高级前端开发工程师");
      expect(body).toContain("有效期至");
      expect(body).toContain("2026年9月12日");
      expect(body).toContain("查看面试邀请");
      expect(body).toContain("请联系招聘负责人");
      expect(body).not.toContain("内部轮次标签");
      expect(body).not.toContain("随时");
      expect(body).not.toContain("接受");
      expect(body).not.toContain("拒绝");
    }
    expect(result.html).toContain('href="https://example.com/interview/current"');
  });

  it("does not invent a deadline or job for manual invitations", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "张居正",
      companyName: "",
      interviewUrl: "https://example.com/interview/current",
      manualInvitation: { expiresAt: null, jobName: null },
      roundLabel: "AI HR 初面",
      scheduledAt: new Date("2026-09-10T02:00:00Z"),
    });
    expect(result.text).toContain("您的简历已通过筛选");
    expect(result.text).not.toContain("有效期至");
    expect(result.text).not.toContain("2026年9月10日");
    expect(result.text).not.toContain("随时");
    expect(result.text).not.toContain("永久");
  });

  it("preserves the legacy invitation wording without the manual option", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "张三",
      interviewUrl: "https://example.com/interview/legacy",
      roundLabel: "旧轮次",
      scheduledAt: null,
    });
    expect(result.text).toContain("你的 AI 面试已准备好");
    expect(result.text).toContain("准备好后随时");
    expect(result.text).toContain("进入 AI 面试");
    expect(result.text).not.toContain("查看面试邀请");
  });
  it("uses companyName as subject + body prefix when provided", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "郭靖",
      companyName: "Acme 科技",
      heroImageUrl: "https://example.com/email/interview-clouds-monet.jpg",
      interviewUrl: "https://example.com/interview/abc/r1",
      roundLabel: "技术终面",
      scheduledAt: new Date("2026-05-20T10:00:00.000Z"),
    });
    expect(result.subject).toBe("Acme 科技 | 技术终面 邀请");
    expect(result.html).toContain("郭靖");
    expect(result.html).toContain("Acme 科技");
    expect(result.html).toContain("AI 面试");
    expect(result.html).toContain("https://example.com/interview/abc/r1");
    expect(result.text).toContain("Acme 科技");
    expect(result.text).toContain("AI 面试");
    expect(result.html).toContain("interview-clouds-monet.jpg");
  });

  it("falls back to 'AI 面试' subject when companyName is blank", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "李四",
      companyName: "",
      interviewUrl: "https://example.com/x/y",
      roundLabel: "初筛",
      scheduledAt: null,
    });
    expect(result.subject).toBe("AI 面试 | 初筛 邀请");
    expect(result.text).toContain("AI 面试");
  });

  it("includes interview tips section", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "王五",
      companyName: "Acme",
      interviewUrl: "https://example.com/x/z",
      roundLabel: "初筛",
      scheduledAt: new Date("2026-05-21T02:00:00.000Z"),
    });
    expect(result.text).toContain("面试前请准备");
    expect(result.text).toContain("麦克风");
    expect(result.text).toContain("网络");
  });

  it("renders scheduledAt label when provided, otherwise shows 准备好后随时", async () => {
    const withTime = await renderRoundInviteEmail({
      candidateName: "甲",
      interviewUrl: "https://x/y",
      roundLabel: "Round",
      scheduledAt: new Date("2026-05-22T01:00:00.000Z"),
    });
    expect(withTime.text).toContain("预计时间");

    const noTime = await renderRoundInviteEmail({
      candidateName: "乙",
      interviewUrl: "https://x/y",
      roundLabel: "Round",
      scheduledAt: null,
    });
    expect(noTime.text).not.toContain("预计时间");
    expect(noTime.text).toContain("准备好后");
  });

  it("renders summary-ready email with report fields and hero image", async () => {
    const result = await renderInterviewSummaryEmail({
      assessment: "基础扎实，沟通清晰。",
      candidateName: "赵六",
      companyName: "Acme 科技",
      detailUrl: "https://example.com/w/acme/studio/interviews?roundId=r1",
      heroImageUrl: "https://example.com/email/interview-clouds-monet.jpg",
      overallScore: "86/100",
      recommendation: "建议进入下一轮",
      summary: "候选人完整回答了项目经历与协作问题。",
      targetRole: "前端工程师",
    });

    expect(result.subject).toBe("Acme 科技 | 赵六 的 AI 面试报告已生成");
    expect(result.text).toContain("赵六");
    expect(result.text).toContain("86/100");
    expect(result.text).toContain("建议进入下一轮");
    expect(result.text).toContain("前端工程师");
    expect(result.html).toContain("interview-clouds-monet.jpg");
  });
});
