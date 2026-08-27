import type { CandidateInterviewView } from "@arc/shared/interview/interview-record";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InterviewPreparationView } from "../interview-preparation-view";

const interviewView = {
  aiReview: {
    baseScore: 86,
    conclusion: "旧的候选人初步了解不应展示",
    dimensions: [],
    strengths: [],
  },
  candidateName: "王临朔",
  companyContext: "一家尊重专业与创造力的公司。",
  currentRoundAllowTextInput: true,
  currentRoundCanResume: false,
  currentRoundFeedback: null,
  currentRoundId: "round-id",
  currentRoundLabel: "一面",
  currentRoundRecoverableUntil: null,
  currentRoundStatus: "pending",
  currentRoundTime: null,
  id: "interview-id",
  interviewQuestions: [],
  jobDescriptionDescription: "旧岗位简介不应展示。",
  jobDescriptionName: "内容运营经理",
  jobDescriptionPrompt: "**负责内容策略**\n\n- 推动跨团队协作",
  resumeProfile: null,
  targetRole: "内容运营经理",
} satisfies CandidateInterviewView;

describe("InterviewPreparationView", () => {
  it("stacks company and role context, omits the AI review, and uses the Monet artwork", () => {
    const markup = renderToStaticMarkup(
      <InterviewPreparationView hasForms interviewView={interviewView} onContinue={vi.fn()} />,
    );

    expect(markup).toContain("interview-scene-editorial-light-v2.png");
    expect(markup).toContain("interview-scene-editorial-dark-v2.png");
    expect(markup).toContain('data-layout="stacked-context"');
    expect(markup.indexOf("关于公司")).toBeLessThan(markup.indexOf("关于岗位"));
    expect(markup).toContain("内容运营经理");
    expect(markup).toContain("typeset typeset-compact");
    expect(markup).toContain("<strong>负责内容策略</strong>");
    expect(markup).toContain("推动跨团队协作");
    expect(markup).toContain("继续填写信息");
    expect(markup).not.toContain("旧岗位简介不应展示");
    expect(markup).not.toContain("AI 对您的初步了解");
    expect(markup).not.toContain("旧的候选人初步了解不应展示");
  });
});
