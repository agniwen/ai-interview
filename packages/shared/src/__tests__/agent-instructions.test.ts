import { describe, expect, it } from "vitest";
import { buildAgentInstructions } from "@arc/shared/interview/agent-instructions";

describe("buildAgentInstructions", () => {
  it("requires the interview to stay in Simplified Chinese", () => {
    const out = buildAgentInstructions({
      candidateName: "Alex",
      companyContext: "",
      interviewQuestions: [],
      interviewerPrompt: "",
      jobDescriptionPresetQuestions: [],
      jobDescriptionPrompt: "",
      resumeProfile: null,
      targetRole: "Backend Engineer",
    });

    expect(out).toContain("全程使用简体中文");
    expect(out).toContain("候选人使用其他语言");
    expect(out).not.toContain("以候选人的主要语言为主");
  });

  it("does not include company-question handoff wording", () => {
    const out = buildAgentInstructions({
      candidateName: "Alex",
      companyContext: "",
      interviewQuestions: [],
      interviewerPrompt: "",
      jobDescriptionPresetQuestions: [],
      jobDescriptionPrompt: "",
      resumeProfile: null,
      targetRole: "Backend Engineer",
    });

    expect(out).not.toContain("## 公司情况问答");
    expect(out).not.toContain("后续面试流程");
    expect(out).not.toContain("其他面试官");
  });

  it("uses interview questions and omits resume-derived supplementary questions", () => {
    const out = buildAgentInstructions({
      candidateName: "Alex",
      companyContext: "",
      interviewQuestions: [
        {
          difficulty: "hard",
          evaluationFocus: "不应进入提示词的补充题考核点",
          followUpDirections: "不应进入提示词的补充题追问方向",
          order: 1,
          question: "这道补充题不应该被询问。",
        },
      ],
      interviewerPrompt: "",
      jobDescriptionPresetQuestions: [
        {
          content: "请介绍一个你负责过的后端项目。",
          difficulty: "easy",
        },
      ],
      jobDescriptionPrompt: "",
      resumeProfile: null,
      targetRole: "Backend Engineer",
    });

    expect(out).toContain("## 面试题（必问）");
    expect(out).toContain("请介绍一个你负责过的后端项目。");
    expect(out).not.toContain("岗位预设题");
    expect(out).not.toContain("补充题目");
    expect(out).not.toContain("这道补充题不应该被询问。");
    expect(out).not.toContain("不应进入提示词的补充题考核点");
    expect(out).not.toContain("不应进入提示词的补充题追问方向");
    expect(out).not.toContain("从以下题目中再随机抽取三到五道");
  });

  it("allows up to two follow-up questions for medium questions", () => {
    const out = buildAgentInstructions({
      candidateName: "Alex",
      companyContext: "",
      interviewQuestions: [],
      interviewerPrompt: "",
      jobDescriptionPresetQuestions: [
        {
          content: "请介绍一次线上故障排查经历。",
          difficulty: "medium",
        },
      ],
      jobDescriptionPrompt: "",
      resumeProfile: null,
      targetRole: "Backend Engineer",
    });

    expect(out).toContain("[medium] 题: 最多可针对关键细节追问两次");
    expect(out).toContain('不得超过 [medium] 题"最多两次追问"的上限');
    expect(out).not.toContain("[medium] 题: 仅可针对关键细节追问一次");
    expect(out).not.toContain('不得超过 [medium] 题"仅一次追问"的上限');
  });

  it("includes question metadata as internal guidance", () => {
    const out = buildAgentInstructions({
      candidateName: "Alex",
      companyContext: "",
      interviewQuestions: [
        {
          difficulty: "hard",
          evaluationFocus: "验证系统设计权衡",
          followUpDirections: "追问容量估算和降级策略",
          order: 1,
          question: "如果核心服务不可用，你会如何设计降级方案？",
        },
      ],
      interviewerPrompt: "",
      jobDescriptionPresetQuestions: [
        {
          content: "请介绍一次线上故障排查经历。",
          difficulty: "medium",
          evaluationFocus: "验证排障方法和复盘能力",
          followUpDirections: "追问定位链路、监控信号和后续预防措施",
        },
      ],
      jobDescriptionPrompt: "",
      resumeProfile: null,
      targetRole: "Backend Engineer",
    });

    expect(out).toContain("考核点：验证排障方法和复盘能力");
    expect(out).toContain("追问方向：追问定位链路、监控信号和后续预防措施");
    expect(out).not.toContain("考核点：验证系统设计权衡");
    expect(out).not.toContain("追问方向：追问容量估算和降级策略");
    expect(out).toContain("考核点和追问方向仅供你内部参考，提问时不要念出来");
  });
});
