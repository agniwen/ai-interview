import { describe, expect, it, vi } from "vitest";
import {
  capCandidateComparisonIds,
  createRecruitingActionProposal,
  createRecruitingCopilotTools,
  searchResumeRecordsForCopilot,
} from "../tools/recruiting-copilot";
import { normalizeResumePoolItemId } from "../tools/resume-pool-id";

describe("recruiting copilot tools", () => {
  it("returns candidate summary cards and citations without full resume payloads", async () => {
    const listResumeRecords = vi.fn().mockResolvedValue({
      records: [
        {
          candidateName: "张三",
          hasResumeFile: true,
          id: "resume-1",
          jobDescriptionId: "jd-1",
          jobDescriptionName: "前端工程师",
          notes: "沟通清晰",
          pipelineStage: "screening",
          resumeFileName: "zhangsan.pdf",
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
        visibilityScope: { kind: "restricted", userIds: ["user-1"] },
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
      { kind: "restricted", userIds: ["user-1"] },
    );
    expect(result.candidateSummaryCards).toEqual([
      expect.objectContaining({
        candidateName: "张三",
        hasResumeFile: true,
        id: "resume-1",
        jobDescriptionName: "前端工程师",
        keySkills: ["React", "TypeScript"],
        resumeFileName: "zhangsan.pdf",
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
    expect(result.retrievalMode).toBe("structured_text");
    expect(result.semanticHitCount).toBe(0);
    expect(JSON.stringify(result)).not.toContain("full resume text should not leak");
    expect(JSON.stringify(result)).not.toContain("should-not-leak");
  });

  it("merges semantic candidate cards without duplicating structured hits", async () => {
    const listResumeRecords = vi.fn().mockResolvedValue({
      records: [
        {
          candidateName: "张三",
          hasResumeFile: true,
          id: "resume-1",
          jobDescriptionId: "jd-1",
          jobDescriptionName: "前端工程师",
          notes: null,
          pipelineStage: "screening",
          resumeFileName: "zhangsan.pdf",
          resumeSkills: ["React"],
          resumeSummary: "React 候选人",
          targetRole: "前端",
          updatedAt: "2026-07-04T10:00:00.000Z",
        },
      ],
      total: 1,
    });
    const semanticSearch = vi.fn().mockResolvedValue([
      {
        candidateName: "张三",
        hasResumeFile: true,
        id: "resume-1",
        jobDescriptionId: "jd-1",
        jobDescriptionName: "前端工程师",
        keySkills: ["React"],
        notes: null,
        pipelineStage: "screening",
        resumeFileName: "zhangsan.pdf",
        resumeSummary: "duplicate",
        targetRole: "前端",
        updatedAt: "2026-07-04T10:00:00.000Z",
        workYears: null,
      },
      {
        candidateName: "李四",
        hasResumeFile: false,
        id: "resume-2",
        jobDescriptionId: "jd-2",
        jobDescriptionName: "后端工程师",
        keySkills: ["Node.js"],
        notes: null,
        pipelineStage: "screening",
        resumeFileName: null,
        resumeSummary: "semantic hit",
        targetRole: "后端",
        updatedAt: "2026-07-04T11:00:00.000Z",
        workYears: 4,
      },
    ]);

    const result = await searchResumeRecordsForCopilot(
      {
        limit: 5,
        organizationId: "org-1",
        query: "找全栈候选人",
        visibilityScope: { kind: "all" },
      },
      { listResumeRecords, semanticSearch },
    );

    expect(semanticSearch).toHaveBeenCalledWith({
      jobDescriptionId: undefined,
      limit: 5,
      organizationId: "org-1",
      pipelineStages: undefined,
      query: "找全栈候选人",
      skills: undefined,
      visibilityScope: { kind: "all" },
    });
    expect(result.retrievalMode).toBe("combined");
    expect(result.semanticHitCount).toBe(2);
    expect(result.candidateSummaryCards.map((card) => card.id)).toEqual(["resume-1", "resume-2"]);
    expect(result.citations.map((citation) => citation.id)).toEqual(["resume-1", "resume-2"]);
  });

  it("caps candidate comparison at five ids", () => {
    expect(capCandidateComparisonIds(["a", "b", "c", "d", "e", "f"])).toEqual({
      ids: ["a", "b", "c", "d", "e"],
      truncated: true,
    });
  });

  it("creates confirmable recruiting action proposals with stable bind ids", () => {
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
      id: "conversation-bind:resume_record:resume-1",
      payload: {
        jobDescriptionId: "jd-1",
        resumeRecordId: "resume-1",
      },
      title: "绑定候选人到前端工程师",
      type: "bind_candidate_to_job",
    });
  });

  it("normalizes pool mention ids for resume pool tools", () => {
    expect(normalizeResumePoolItemId("pool:abc-123")).toBe("abc-123");
    expect(normalizeResumePoolItemId("abc-123")).toBe("abc-123");
  });

  it("creates confirmable pool bind proposals with stable ids", () => {
    const result = createRecruitingActionProposal({
      explanation: "人才库条目尚未绑定岗位，先请用户选择。",
      payload: {
        poolItemId: "pool-1",
      },
      title: "绑定人才库条目到岗位",
      type: "bind_pool_item_to_job",
    });

    expect(result.proposal.type).toBe("bind_pool_item_to_job");
    expect(result.proposal.id).toBe("conversation-bind:resume_pool_item:pool-1");
    expect(result.proposal.payload).toEqual({ poolItemId: "pool-1" });
  });

  it("registers propose_recruiting_action with requireApproval", () => {
    const tools = createRecruitingCopilotTools({
      organizationId: "org-1",
      visibilityScope: { kind: "all" },
    });
    expect(tools.propose_recruiting_action.requireApproval).toBe(true);
    expect(tools.propose_recruiting_action.description).toContain("必须主动、立即调用");
    expect(tools.get_resume_record_detail.description).toContain(
      "必须立刻调用 propose_recruiting_action",
    );
    expect(tools.get_resume_pool_detail.description).toContain(
      "必须立刻调用 propose_recruiting_action",
    );
  });
});
