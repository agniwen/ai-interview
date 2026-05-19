import { describe, expect, it } from "vitest";
import { renderRoundInviteEmail } from "../templates";

describe("renderRoundInviteEmail", () => {
  it("uses companyName as subject + body prefix when provided", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "张三",
      companyName: "Acme 科技",
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
    expect(result.text).not.toMatch(/排期|预计时间/);
  });

  it("omits time block when scheduledAt is null", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "王五",
      interviewUrl: "https://example.com/x/z",
      roundLabel: "初筛",
      scheduledAt: null,
    });
    expect(result.text).not.toMatch(/排期|预计时间/);
  });
});
