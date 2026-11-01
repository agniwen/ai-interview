import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import {
  createResumeProfileDraft,
  createWorkExperienceDraft,
  isResumeProfileDraftChanged,
  toResumeProfileEditInput,
} from "../resume-profile-draft";

const profile: ResumeProfile = {
  age: null,
  educationExperiences: [
    {
      degree: null,
      educationLevel: "本科",
      graduationYear: "2018",
      major: "计算机",
      period: null,
      school: "浙江大学",
      summary: null,
    },
  ],
  email: "lan@example.com",
  gender: "未发现信息",
  name: "兰星",
  personalStrengths: ["沟通清晰", "未发现信息", "抗压"],
  phone: null,
  projectExperiences: [],
  schools: ["浙江大学"],
  skills: ["Go", "Kafka"],
  targetRoles: ["后端工程师"],
  workExperiences: [
    { company: "字节跳动", period: "2020 - 至今", role: "未发现信息", summary: "负责推荐" },
  ],
  workYears: 6,
};

describe("resume profile draft", () => {
  it("shows the AI unknown placeholder as empty input", () => {
    const draft = createResumeProfileDraft(profile);

    expect(draft.gender).toBe("");
    expect(draft.workExperiences[0]?.role).toBe("");
    expect(draft.personalStrengths).toBe("沟通清晰\n抗压");
    expect(draft.workYears).toBe("6");
    expect(draft.age).toBe("");
  });

  it("treats an untouched draft as unchanged so saving does not trigger reassessment", () => {
    const initial = createResumeProfileDraft(profile);
    const reopened = createResumeProfileDraft(profile);

    expect(isResumeProfileDraftChanged(initial, reopened)).toBe(false);
    expect(isResumeProfileDraftChanged(initial, { ...reopened, skills: ["Go"] })).toBe(true);
  });

  it("converts edits back to the profile contract", () => {
    const draft = createResumeProfileDraft(profile);
    const [firstWork] = draft.workExperiences;
    if (!firstWork) {
      throw new Error("expected a work experience draft");
    }
    const input = toResumeProfileEditInput({
      ...draft,
      age: "29",
      personalStrengths: "  沟通清晰 \n\n 带团队 ",
      workExperiences: [{ ...firstWork, role: " 高级工程师 " }, createWorkExperienceDraft()],
      workYears: "",
    });

    expect(input.age).toBe(29);
    expect(input.workYears).toBeNull();
    expect(input.gender).toBeNull();
    expect(input.personalStrengths).toEqual(["沟通清晰", "带团队"]);
    // 新增但未填写的空条目不会写入画像。Empty new entries are dropped.
    expect(input.workExperiences).toEqual([
      { company: "字节跳动", period: "2020 - 至今", role: "高级工程师", summary: "负责推荐" },
    ]);
  });
});
