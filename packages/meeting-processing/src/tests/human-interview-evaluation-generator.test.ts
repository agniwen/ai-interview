import { describe, expect, it, vi } from "vitest";
import { generateHumanInterviewEvaluation } from "../human-interview-evaluation-generator";

const evaluation = {
  detailedAnalysis: "候选人明确表示未担任正式管理岗，仅带过实习生和外包。",
  evidenceTurnIds: ["candidate-turn"],
  overallEvaluation: "管理经验与岗位要求存在差距，评级 C。",
  professionalSkill: "中",
  rating: "C",
  risks: "候选人明确表示没有带过正式团队，岗位要求 5 人以上团队管理经验。",
  rolePosition: "-",
  salaryRecommendation: "-",
  seniorityPosition: "-",
  strengths: "-",
};

const input = {
  candidateName: "候选人",
  jobDescription: "需要 5 人以上团队管理经验",
  resume: "产品经理",
  salaryRange: null,
  turns: [
    {
      attribution: { method: "track", role: "candidate" } as const,
      id: "candidate-turn",
      speakerDisplayName: "候选人",
      speakerKey: "candidate",
      text: "我没有带过正职，只带过实习生和外包，最多三个人。",
    },
  ],
};

describe("generateHumanInterviewEvaluation evidence review", () => {
  it("publishes the draft when the reviewer only reports compliant judgments", async () => {
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(evaluation) });
    const review = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        findings: [
          {
            reason: "候选人明确回答未带过正职，属于合规的劣势缺点，不构成违规。",
            violation: false,
          },
        ],
      }),
    });

    await expect(
      generateHumanInterviewEvaluation(input, { generate }, { generate: review }),
    ).resolves.toEqual(evaluation);
    expect(generate).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
  });

  it("regenerates with only the violations and refuses drafts that keep violating", async () => {
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(evaluation) });
    const compliant = "risks 第 1 条有候选人明确回答支持，不构成违规。";
    const violation = "risks 把未提问的跨部门协作当作候选人短板。";
    const review = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        findings: [
          { reason: compliant, violation: false },
          { reason: violation, violation: true },
        ],
      }),
    });

    const result = generateHumanInterviewEvaluation(input, { generate }, { generate: review });

    await expect(result).rejects.toThrow(violation);
    await expect(result).rejects.not.toThrow(compliant);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(review).toHaveBeenCalledTimes(2);
    const retryPrompt = String(generate.mock.calls[1]?.[0]);
    expect(retryPrompt).toContain(violation);
    expect(retryPrompt).not.toContain(compliant);
  });
});
