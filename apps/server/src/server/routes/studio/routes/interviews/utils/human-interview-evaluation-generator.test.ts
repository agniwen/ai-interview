import { describe, expect, it, vi } from "vitest";
import { generateHumanInterviewEvaluation } from "./human-interview-evaluation-generator";

const supportedReview = { generate: vi.fn(() => Promise.resolve({ text: '{"issues":[]}' })) };

describe("generateHumanInterviewEvaluation", () => {
  it("retains a negative rating supported by an explicit business experience conflict", async () => {
    const evaluation = {
      detailedAnalysis: "岗位要求独立负责海外渠道，候选人明确表示从未做过海外渠道。",
      evidenceTurnIds: ["sales-1"],
      overallEvaluation: "海外渠道经验与岗位明确要求存在冲突。",
      professionalSkill: "差",
      rating: "C",
      risks: "候选人明确表示没有岗位要求的海外渠道经验。",
      rolePosition: "-",
      salaryRecommendation: "-",
      seniorityPosition: "-",
      strengths: "-",
    };
    const generate = vi.fn().mockResolvedValue({ text: JSON.stringify(evaluation) });
    await expect(
      generateHumanInterviewEvaluation(
        {
          candidateName: "候选人",
          jobDescription: "必须具备独立负责海外渠道的经验",
          resume: "国内销售经验",
          salaryRange: null,
          turns: [
            {
              attribution: { method: "track", role: "candidate" },
              id: "sales-1",
              speakerDisplayName: "候选人",
              speakerKey: "candidate",
              text: "我从未做过海外渠道。",
            },
          ],
        },
        { generate },
        supportedReview,
      ),
    ).resolves.toEqual(evaluation);
    expect(generate).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "repairs unsupported negative judgments and refuses persistently invalid drafts (%s)",
    async (persistent) => {
      const unsupported = {
        detailedAnalysis: "没有问管理经历。",
        evidenceTurnIds: ["turn-1"],
        overallEvaluation: "未展示管理经验，与岗位明显不匹配。",
        professionalSkill: "差",
        rating: "C",
        risks: "项目名称不明，沟通清晰度不足。",
        rolePosition: "-",
        salaryRecommendation: "-",
        seniorityPosition: "-",
        strengths: "-",
      };
      const supported = {
        ...unsupported,
        overallEvaluation: "回答涉及项目性能优化。",
        professionalSkill: "中",
        rating: "B",
        risks: "-",
      };
      const generate = vi
        .fn()
        .mockResolvedValueOnce({ text: JSON.stringify(unsupported) })
        .mockResolvedValueOnce({ text: JSON.stringify(supported) });
      const issue = "未提问管理经验及转录名称歧义不能作为负面评级或沟通风险依据";
      const review = vi
        .fn()
        .mockResolvedValueOnce({ text: JSON.stringify({ issues: [issue] }) })
        .mockResolvedValueOnce({ text: JSON.stringify({ issues: persistent ? [issue] : [] }) });
      const result = generateHumanInterviewEvaluation(
        {
          candidateName: "候选人",
          jobDescription: "需要项目性能优化和管理经验",
          resume: "带过团队",
          salaryRange: null,
          turns: [
            {
              attribution: { method: "track", role: "candidate" },
              id: "turn-1",
              speakerDisplayName: "候选人",
              speakerKey: "candidate",
              text: "通过压缩解决加载延迟。",
            },
          ],
        },
        { generate },
        { generate: review },
      );
      await (persistent
        ? expect(result).rejects.toThrow("证据复核")
        : expect(result).resolves.toEqual(supported));
      expect(generate).toHaveBeenCalledTimes(2);
      expect(String(generate.mock.calls[1]?.[0])).toContain(issue);
      expect(review).toHaveBeenCalledTimes(2);
      expect(String(review.mock.calls[0]?.[0])).toContain("通过压缩解决加载延迟");
    },
  );
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
        supportedReview,
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
    expect(prompt).toContain("自动语音识别可能误写项目名、产品名、行业术语、缩写和数字");
    expect(prompt).toContain("不得据此评价沟通清晰度、理解力、专业能力或诚信，也不得降低评级");
    expect(prompt).toContain("不得把简历内容写成面试中已验证的表现");
    expect(prompt).toContain("risks 只写有可靠证据支持的实质性岗位风险；没有时必须返回 -");
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
        supportedReview,
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
      supportedReview,
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
        supportedReview,
      ),
    ).rejects.toThrow("真人复面转录尚未可靠识别候选人发言");
    expect(generate).not.toHaveBeenCalled();
  });
});
