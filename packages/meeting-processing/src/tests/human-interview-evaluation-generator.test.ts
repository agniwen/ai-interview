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
            quote: "候选人明确表示没有带过正式团队",
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
          { quote: "管理经验", reason: compliant, violation: false },
          { quote: "跨部门协作", reason: violation, violation: true },
        ],
      }),
    });

    const result = generateHumanInterviewEvaluation(input, { generate }, { generate: review });

    await expect(result).rejects.toThrow(violation);
    await expect(result).rejects.not.toThrow(compliant);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(review).toHaveBeenCalledTimes(3);
    const retryPrompt = String(generate.mock.calls[1]?.[0]);
    expect(retryPrompt).toContain(violation);
    expect(retryPrompt).not.toContain(compliant);
  });

  it("asks for a revision before review when judgment fields cite uncovered material", async () => {
    const uncovered = "面试未展示跨部门协作经验，评级 C";
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({ ...evaluation, overallEvaluation: `${uncovered}。` }),
      })
      .mockResolvedValueOnce({ text: JSON.stringify(evaluation) });
    const review = vi.fn().mockResolvedValue({ text: JSON.stringify({ findings: [] }) });

    await expect(
      generateHumanInterviewEvaluation(input, { generate }, { generate: review }),
    ).resolves.toEqual(evaluation);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(review).toHaveBeenCalledOnce();
    expect(String(generate.mock.calls[1]?.[0])).toContain(uncovered);
  });

  it("keeps candidate statements that mention uncovered work", async () => {
    const stated = {
      ...evaluation,
      risks: "候选人明确表示从未涉及团队管理，岗位要求 5 人以上团队管理经验。",
    };
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(stated) });
    const review = vi.fn().mockResolvedValue({ text: JSON.stringify({ findings: [] }) });

    await expect(
      generateHumanInterviewEvaluation(input, { generate }, { generate: review }),
    ).resolves.toEqual(stated);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("leaves the neutral unassessed list in the overall evaluation alone", async () => {
    const listed = {
      ...evaluation,
      overallEvaluation:
        "管理经验与岗位硬性要求冲突，评级 C。\n面试未考察：未涉及的跨部门协作、海外市场理解",
    };
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(listed) });
    const review = vi.fn().mockResolvedValue({ text: JSON.stringify({ findings: [] }) });

    await expect(
      generateHumanInterviewEvaluation(input, { generate }, { generate: review }),
    ).resolves.toEqual(listed);
    expect(generate).toHaveBeenCalledOnce();
  });
});
