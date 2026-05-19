import { describe, expect, it } from "vitest";
import { renderRoundInviteEmail } from "../templates";

describe("renderRoundInviteEmail", () => {
  it("renders subject from roundLabel", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "张三",
      interviewUrl: "https://example.com/interview/abc/r1",
      roundLabel: "技术终面",
      scheduledAt: new Date("2026-05-20T10:00:00.000Z"),
    });
    expect(result.subject).toBe("技术终面 面试邀请");
    expect(result.html).toContain("张三");
    expect(result.html).toContain("https://example.com/interview/abc/r1");
    expect(result.text).toContain("张三");
    expect(result.text).toContain("https://example.com/interview/abc/r1");
  });

  it("omits time block when scheduledAt is null", async () => {
    const result = await renderRoundInviteEmail({
      candidateName: "李四",
      interviewUrl: "https://example.com/x/y",
      roundLabel: "初筛",
      scheduledAt: null,
    });
    expect(result.subject).toBe("初筛 面试邀请");
    expect(result.text).not.toMatch(/排期|时间/);
  });
});
