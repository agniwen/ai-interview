import { describe, expect, it, vi } from "vitest";
import { generateHumanInterviewEvaluation } from "./human-interview-evaluation-generator";

describe("generateHumanInterviewEvaluation", () => {
  it("将缺失内容归一化为横线，并把专业技能压缩为简短等级", async () => {
    const generate = vi.fn((_prompt: string) =>
      Promise.resolve({
        object: {
          detailedAnalysis: "对全部问答进行了逐项分析。",
          evidenceTurnIds: ["turn-1"],
          overallEvaluation: "整体满足要求。",
          professionalSkill: "优。具备完整的系统架构与前端工程化能力。",
          rating: "A",
          risks: "规模经验仍需确认。",
          rolePosition: "",
          salaryRecommendation: "",
          seniorityPosition: "高级专家",
          strengths: "架构拆解清晰。",
        },
        text: "",
      }),
    );
    const result = await generateHumanInterviewEvaluation(
      {
        candidateName: "候选人",
        jobDescription: "负责核心系统架构。",
        resume: "具有系统架构经验。",
        salaryRange: null,
        turns: [
          {
            id: "turn-1",
            speakerDisplayName: "候选人",
            speakerKey: "remote-1",
            text: "我负责过核心系统架构。",
          },
        ],
      },
      { generate },
    );
    expect(result.rating).toBe("A");
    expect(result.professionalSkill).toBe("优");
    expect(result.rolePosition).toBe("-");
    expect(result.salaryRecommendation).toBe("-");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0]).toContain(
      "匿名 speakerKey 或 remote track 不代表候选人身份",
    );
    expect(generate.mock.calls[0]?.[0]).toContain("无法可靠归属给候选人的内容不得作为评价证据");
    expect(generate.mock.calls[0]?.[0]).toContain("professionalSkill 只能填写：优、良、中、差或 -");
    expect(generate.mock.calls[0]?.[0]).toContain("无法判断或没有内容的字段统一填写 -");
  });

  it("没有可靠候选人身份时拒绝生成评价", async () => {
    const generate = vi.fn();

    await expect(
      generateHumanInterviewEvaluation(
        {
          candidateName: "刘夏江",
          jobDescription: "负责核心系统架构。",
          resume: "具有系统架构经验。",
          salaryRange: null,
          turns: [
            {
              id: "turn-1",
              speakerDisplayName: null,
              speakerKey: "remote-1",
              text: "我负责过核心系统架构。",
            },
          ],
        },
        { generate },
      ),
    ).rejects.toThrow("真人复面转录尚未可靠识别候选人发言");
    expect(generate).not.toHaveBeenCalled();
  });
});
