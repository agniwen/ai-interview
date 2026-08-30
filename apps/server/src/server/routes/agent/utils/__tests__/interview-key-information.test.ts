import { beforeEach, describe, expect, it, vi } from "vitest";
import { interviewKeyInformationSchema } from "@arc/db-schema/interview-key-information";
import { interviewKeyInformationAgent } from "@app/server/server/agents/mastra/agents/simple-generators";
import { generateInterviewKeyInformation } from "../interview-key-information";
import type { InterviewKeyInformationDependencies } from "../interview-key-information";

const KEY_INFORMATION = {
  quantitativeInformation: [
    {
      content: "候选人期望税前年包 60 万元。",
      evidence: [{ quote: "我的期望是税前年包六十万", timeInCallSecs: 32, turnIndex: 4 }],
    },
  ],
  risks: [
    {
      content: "候选人未能说明高并发方案中的容量估算依据。",
      evidence: [{ quote: "具体容量我没有算过", timeInCallSecs: 55, turnIndex: 6 }],
      type: "needs_verification" as const,
    },
  ],
  skillEvidence: [
    {
      content: "候选人用 React 重构招聘系统前端，并负责组件架构。",
      evidence: [{ quote: "我用 React 重构了招聘系统前端", timeInCallSecs: 12, turnIndex: 2 }],
    },
  ],
};

describe("generateInterviewKeyInformation", () => {
  const generate = vi.fn();
  const dependencies: InterviewKeyInformationDependencies = {
    agent: interviewKeyInformationAgent,
    // SAFETY: the test controls this fake and resolves each invocation with InterviewKeyInformation.
    generate: generate as InterviewKeyInformationDependencies["generate"],
  };

  beforeEach(() => {
    generate.mockReset();
  });

  it("uses frozen job context only to prioritize candidate transcript evidence", async () => {
    generate.mockResolvedValue(KEY_INFORMATION);

    await expect(
      generateInterviewKeyInformation(
        {
          jobDescription: {
            description: "负责高并发招聘平台开发",
            id: "jd-1",
            name: "高级前端工程师",
            prompt: "重点考察 React 架构和性能优化",
          },
          questions: [
            {
              difficulty: "hard",
              evaluationFocus: "容量设计",
              order: 1,
              question: "你如何设计高并发接口？",
            },
          ],
          targetRole: "高级前端工程师",
          transcript: [
            { message: "请介绍你的项目。", role: "agent", timeInCallSecs: 1 },
            {
              message: "我用 React 重构了招聘系统前端。",
              role: "user",
              timeInCallSecs: 12,
            },
          ],
        },
        dependencies,
      ),
    ).resolves.toEqual(KEY_INFORMATION);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: dependencies.agent,
        prompt: expect.stringMatching(
          /高级前端工程师[\s\S]*重点考察 React 架构和性能优化[\s\S]*容量设计[\s\S]*我用 React 重构了招聘系统前端/,
        ),
        schema: expect.any(Object),
        temperature: 0,
      }),
    );
    expect(generate.mock.calls[0]?.[0].prompt).toMatch(
      /只能把候选人在本轮对话中明确表达的内容作为重点信息/,
    );
    expect(generate.mock.calls[0]?.[0].prompt).toMatch(/不得输出推进建议/);
  });

  it("does not call the model for an empty transcript", async () => {
    await expect(
      generateInterviewKeyInformation(
        {
          jobDescription: null,
          questions: [],
          targetRole: null,
          transcript: [],
        },
        dependencies,
      ),
    ).resolves.toEqual({
      quantitativeInformation: [],
      risks: [],
      skillEvidence: [],
    });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("interviewKeyInformationSchema", () => {
  it("requires traceable evidence and caps every category at three items", () => {
    expect(
      interviewKeyInformationSchema.safeParse({
        quantitativeInformation: [],
        risks: [],
        skillEvidence: [{ content: "熟悉 React", evidence: [] }],
      }).success,
    ).toBe(false);

    expect(
      interviewKeyInformationSchema.safeParse({
        quantitativeInformation: [],
        risks: [],
        skillEvidence: Array.from({ length: 4 }, (_, index) => ({
          content: `技能证据 ${index + 1}`,
          evidence: [{ quote: `候选人原话 ${index + 1}`, turnIndex: index + 1 }],
        })),
      }).success,
    ).toBe(false);
  });
});
