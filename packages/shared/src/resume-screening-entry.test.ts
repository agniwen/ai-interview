import { describe, expect, it } from "vitest";
import {
  canLaunchInterviewFromResume,
  createResumeLibraryFormValues,
  resumeIdentityUpdateSchema,
  resumeLibraryEditFormSchema,
} from "./studio-resumes";

describe("人工简历筛选入口边界", () => {
  it.each([null, "fail"] as const)("%s 不能发起 AI 面试", (evaluationStatus) => {
    expect(canLaunchInterviewFromResume("ready", "screening", evaluationStatus)).toBe(false);
    expect(canLaunchInterviewFromResume("ready", "ai_interview", evaluationStatus)).toBe(false);
  });

  it("通过后仍需满足解析状态及当前阶段", () => {
    expect(canLaunchInterviewFromResume("ready", "screening", "pass")).toBe(true);
    expect(canLaunchInterviewFromResume("ready", "ai_interview", "pass")).toBe(true);
    expect(canLaunchInterviewFromResume("failed", "screening", "pass")).toBe(false);
    expect(canLaunchInterviewFromResume("ready", "final_interview", "pass")).toBe(false);
  });

  it("候选人信息请求丢弃客户端夹带的筛选结论", () => {
    const identity = resumeIdentityUpdateSchema.parse({
      age: null,
      candidateEmail: "",
      candidateName: "候选人",
      candidatePhone: "",
      gender: "",
      jobDescriptionId: "job",
      resumeEvaluationStatus: "pass",
      targetRole: "",
      workYears: null,
    });
    const form = resumeLibraryEditFormSchema.parse({
      ...createResumeLibraryFormValues(),
      candidateName: "候选人",
      jobDescriptionId: "job",
      resumeEvaluationStatus: "fail",
    });
    expect(identity).not.toHaveProperty("resumeEvaluationStatus");
    expect(form).not.toHaveProperty("resumeEvaluationStatus");
  });
});
