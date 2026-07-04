import { describe, expect, it, vi } from "vitest";
import {
  capCandidateComparisonIds,
  createRecruitingActionProposal,
  searchResumeRecordsForCopilot,
} from "../tools/recruiting-copilot";

describe("recruiting copilot tools", () => {
  it("returns candidate summary cards and citations without full resume payloads", async () => {
    const listResumeRecords = vi.fn().mockResolvedValue({
      records: [
        {
          candidateName: "张三",
          id: "resume-1",
          jobDescriptionId: "jd-1",
          jobDescriptionName: "前端工程师",
          notes: "沟通清晰",
          pipelineStage: "screening",
          resumeProfile: { name: "should-not-leak" },
          resumeReviewConclusion: "should-not-leak",
          resumeSkills: ["React", "TypeScript"],
          resumeSummary: "5 年前端，中后台经验",
          resumeText: "full resume text should not leak",
          targetRole: "高级前端",
          updatedAt: "2026-07-04T10:00:00.000Z",
          workYears: 5,
        },
      ],
      total: 1,
    });

    const result = await searchResumeRecordsForCopilot(
      {
        limit: 5,
        organizationId: "org-1",
        query: "找 React 候选人",
      },
      { listResumeRecords },
    );

    expect(listResumeRecords).toHaveBeenCalledWith(
      "org-1",
      {
        jobDescriptionIds: null,
        pipelineStages: null,
        search: "找 React 候选人",
        skills: null,
      },
      {
        page: 1,
        pageSize: 5,
        sortBy: "updatedAt",
        sortOrder: "desc",
      },
    );
    expect(result.candidateSummaryCards).toEqual([
      expect.objectContaining({
        candidateName: "张三",
        id: "resume-1",
        jobDescriptionName: "前端工程师",
        keySkills: ["React", "TypeScript"],
      }),
    ]);
    expect(result.citations).toEqual([
      {
        id: "resume-1",
        label: "张三",
        recordType: "resume_record",
        secondaryLabel: "前端工程师",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("full resume text should not leak");
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
  });

  it("caps candidate comparison at five ids", () => {
    expect(capCandidateComparisonIds(["a", "b", "c", "d", "e", "f"])).toEqual({
      ids: ["a", "b", "c", "d", "e"],
      truncated: true,
    });
  });

  it("creates confirmable recruiting action proposals without executing writes", () => {
    const result = createRecruitingActionProposal({
      explanation: "候选人与岗位技能匹配，可以先绑定岗位。",
      payload: {
        jobDescriptionId: "jd-1",
        resumeRecordId: "resume-1",
      },
      title: "绑定候选人到前端工程师",
      type: "bind_candidate_to_job",
    });

    expect(result.proposal).toEqual({
      explanation: "候选人与岗位技能匹配，可以先绑定岗位。",
      id: expect.any(String),
      payload: {
        jobDescriptionId: "jd-1",
        resumeRecordId: "resume-1",
      },
      title: "绑定候选人到前端工程师",
      type: "bind_candidate_to_job",
    });
  });
});
