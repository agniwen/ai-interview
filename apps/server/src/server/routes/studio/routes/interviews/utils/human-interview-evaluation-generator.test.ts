import { describe, expect, it, vi } from "vitest";
import { generateHumanInterviewEvaluation } from "./human-interview-evaluation-generator";

describe("generateHumanInterviewEvaluation", () => {
  it("提供完整输出结构，并用具体校验反馈纠正非法评级和多余字段", async () => {
    const evaluation = {
      detailedAnalysis: "候选人说明了系统架构设计与实施过程。",
      evidenceTurnIds: ["turn-1"],
      overallEvaluation: "架构经验符合岗位要求。",
      professionalSkill: "良",
      rating: "A",
      risks: "-",
      rolePosition: "架构工程师",
      salaryRecommendation: "-",
      seniorityPosition: "-",
      strengths: "具备系统架构实施经验。",
    };
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify({ ...evaluation, rating: "-", score: 80 }) })
      .mockResolvedValueOnce({ text: JSON.stringify(evaluation) });

    await expect(
      generateHumanInterviewEvaluation(
        {
          candidateName: "候选人",
          jobDescription: "负责核心系统架构。",
          resume: "具有系统架构经验。",
          salaryRange: null,
          turns: [
            {
              attribution: { method: "track", role: "candidate" },
              id: "turn-1",
              speakerDisplayName: "候选人",
              speakerKey: "remote-1",
              text: "我负责过核心系统架构。",
            },
          ],
        },
        { generate },
      ),
    ).resolves.toEqual(evaluation);

    const prompt = String(generate.mock.calls[0]?.[0]);
    const schemaLine = prompt.split("\n").find((line) => line.startsWith('{"$schema":'));
    expect(JSON.parse(schemaLine ?? "null")).toMatchObject({
      additionalProperties: false,
      properties: {
        evidenceTurnIds: { items: { type: "string" }, type: "array" },
        rating: { enum: ["S", "A", "B", "C"], type: "string" },
      },
      required: [
        "detailedAnalysis",
        "evidenceTurnIds",
        "overallEvaluation",
        "professionalSkill",
        "rating",
        "risks",
        "rolePosition",
        "salaryRecommendation",
        "seniorityPosition",
        "strengths",
      ],
    });
    const retryPrompt = String(generate.mock.calls[1]?.[0]);
    expect(prompt).toContain("rating 不适用缺失文字占位规则");
    expect(prompt).toContain("没有可引用证据时返回 []");
    expect(retryPrompt).toContain('"received":"-"');
    expect(retryPrompt).toContain('"values":["S","A","B","C"]');
    expect(retryPrompt).toContain('"keys":["score"]');
  });

  it.each(["unknown", "interviewer"] as const)("不信任名称伪装为候选人的 %s 发言", async (role) => {
    const generate = vi.fn();
    await expect(
      generateHumanInterviewEvaluation(
        {
          candidateName: "候选人",
          jobDescription: "岗位",
          resume: "简历",
          salaryRange: null,
          turns: [
            {
              attribution: { method: "track", role },
              id: "wrong",
              speakerDisplayName: "候选人",
              speakerKey: "remote-1",
              text: "我负责项目",
            },
          ],
        },
        { generate },
      ),
    ).rejects.toThrow("尚未可靠识别候选人");
    expect(generate).not.toHaveBeenCalled();
  });
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
    expect(generate.mock.calls[0]?.[0]).toContain("无法判断或没有内容的描述类文字字段统一填写 -");
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
