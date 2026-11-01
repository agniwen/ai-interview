import { describe, expect, it } from "vitest";
import { mcpCandidateDetailCardSchema } from "@app/shared/recruiting-mcp-cards";
import { toMcpCandidateCard, toMcpCandidateDetailCard } from "../candidate-cards";
import type { CandidateDetailCardSource } from "../candidate-cards";

const profileLine = (primary: string) => ({ period: null, primary, secondary: null });

const record: CandidateDetailCardSource = {
  candidateEmail: "  zhangyan@example.com ",
  candidateName: "张妍",
  candidatePhone: null,
  hrResumeAssessment: "   ",
  id: "resume-1",
  jobDescriptionName: "前端工程师",
  outcome: "in_pipeline",
  pipelineStage: "second_interview",
  qualitativeRecommendationLevel: "highly_recommended",
  qualitativeResumeSummary: null,
  resumeProfile: null,
  resumeProfileSnapshot: {
    education: ["浙大", "清华", "北大"].map(profileLine),
    educationHasMore: true,
    projects: [],
    projectsHasMore: false,
    work: ["A", "B", "C", "D"].map(profileLine),
    workHasMore: true,
  },
  resumeSkills: Array.from({ length: 10 }, (_, index) => `skill-${index}`),
  resumeSummary: "五年 React 经验",
  targetRole: " ",
  updatedAt: "2026-10-20T08:00:00.000Z",
};

describe("MCP candidate cards", () => {
  it("resolves Chinese labels and trims the card to what the view shows", () => {
    const card = toMcpCandidateCard(record, (id) => `https://hire.example.com/c/${id}`);

    expect(card).toMatchObject({
      outcome: null,
      recommendation: { label: "非常推荐", value: "highly_recommended" },
      stage: { label: "复试", value: "second_interview" },
      summary: "五年 React 经验",
      targetRole: null,
      url: "https://hire.example.com/c/resume-1",
    });
    expect(card.skills).toHaveLength(8);
    expect(card.experience).toHaveLength(3);
    expect(card.education).toHaveLength(2);
  });

  it("reports the closing outcome instead of the stage once a candidate leaves the pipeline", () => {
    const card = toMcpCandidateCard({ ...record, outcome: "hired", pipelineStage: "closed" });

    expect(card.outcome).toEqual({ label: "已入职", value: "hired" });
    expect(card.url).toBeNull();
  });

  it("produces a detail card that satisfies the shared output schema", () => {
    const card = toMcpCandidateDetailCard(record);

    expect(mcpCandidateDetailCardSchema.parse(card)).toEqual(card);
    expect(card.candidate).toMatchObject({
      email: "zhangyan@example.com",
      phone: null,
      recruiterAssessment: null,
      workYears: null,
    });
  });
});
