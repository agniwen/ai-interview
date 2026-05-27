import { describe, expect, it } from "vitest";
import { renderInterviewSummaryEmail, renderRoundInviteEmail } from "../templates";

describe("renderRoundInviteEmail", () => {
  it("uses companyName as subject + body prefix when provided", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "张三",
      companyName: "Acme 科技",
      heroImageUrl: "https://example.com/email/interview-clouds-monet.jpg",
      interviewUrl: "https://example.com/interview/abc/r1",
      roundLabel: "技术终面",
      scheduledAt: new Date("2026-05-20T10:00:00.000Z"),
    });
    expect(result.subject).toBe("Acme 科技 | 技术终面 邀请");
    expect(result.html).toContain("张三");
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
