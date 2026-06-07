// src/server/agents/__tests__/resume-parser-agent.test.ts
//
// `projectAttachmentToResumeProfile` 把 chat_attachment 行的 superset
// 投影到 ResumeProfile 子集，形状不符时返回 null。
import { describe, expect, it } from "vitest";
import {
  projectAttachmentToResumeProfile,
  toResumeProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-parser-agent";

const MINIMAL_STRUCTURED = {
  age: 28,
  degree: null,
  education: null,
  email: null,
  gender: "男",
  graduationYear: null,
  links: [],
  major: null,
  name: "郭靖",
  personalStrengths: ["沟通"],
  phone: null,
  projectExperiences: [],
  schools: ["清华大学"],
  skills: ["TypeScript"],
  targetRoles: ["前端工程师"],
  timelineSummary: {
    currentStatus: null,
    dateRanges: [],
    estimatedExperienceYears: null,
    riskSignals: [],
  },
  workExperiences: [],
  workYears: 5,
};

describe("projectAttachmentToResumeProfile", () => {
  it("returns null when input is null", () => {
    expect(projectAttachmentToResumeProfile(null)).toBeNull();
  });

  it("returns null when input does not match structured schema", () => {
    expect(projectAttachmentToResumeProfile({ random: "shape" })).toBeNull();
  });

  it("projects a valid superset down to ResumeProfile", () => {
    const result = projectAttachmentToResumeProfile(MINIMAL_STRUCTURED);
    expect(result).not.toBeNull();
    expect(result).toEqual(toResumeProfile(MINIMAL_STRUCTURED));
  });

  it("normalizes empty name to '未发现信息'", () => {
    const result = projectAttachmentToResumeProfile({ ...MINIMAL_STRUCTURED, name: "   " });
    expect(result?.name).toBe("未发现信息");
  });
});
