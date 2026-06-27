import { describe, expect, it } from "vitest";
import { buildStudioResumeChatContextBlock } from "../utils/studio-resume-chat-context";

describe("buildStudioResumeChatContextBlock", () => {
  it("formats analyzed resume data as bounded model-only context", () => {
    const block = buildStudioResumeChatContextBlock({
      candidateEmail: "zhang@example.com",
      candidateName: "张三",
      candidatePhone: "13800000000",
      jobDescription: {
        name: "前端工程师",
        prompt: "负责 React 产品研发",
      },
      resumeProfile: {
        basics: { name: "张三" },
        skills: ["React", "TypeScript"],
      },
      resumeReview: {
        overall: { conclusion: "建议进入面试", scoreRationale: "项目匹配度较高" },
      },
      resumeText: "这是一份很长的简历原文".repeat(1000),
      targetRole: "前端",
    });

    expect(block).toContain("当前聊天绑定的是 Studio 简历库中的候选人");
    expect(block).toContain("候选人：张三");
    expect(block).toContain("目标岗位：前端");
    expect(block).toContain("绑定 JD：前端工程师");
    expect(block).toContain("React");
    expect(block).toContain("建议进入面试");
    expect(block.length).toBeLessThan(16_000);
  });
});
