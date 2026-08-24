import { describe, expect, it, vi } from "vitest";
import {
  capCandidateComparisonIds,
  createRecruitingActionProposal,
  createRecruitingCopilotTools,
  getJobDescriptionDetailInputSchema,
  getRecruitingActionInputSchema,
  getResumePoolDetailInputSchema,
  getResumeRecordDetailInputSchema,
  getResumeRecordDetailOutputSchema,
  searchResumeRecordsInputSchema,
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
      jobDescriptionIds: undefined,
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

  it("accepts bounded batches for every detail reader", () => {
    expect(
      getResumeRecordDetailInputSchema.parse({
        requests: [{ id: "resume-1", includeResumeText: true }, { id: "resume-2" }],
      }),
    ).toEqual({
      requests: [{ id: "resume-1", includeResumeText: true }, { id: "resume-2" }],
    });
    expect(
      getResumePoolDetailInputSchema.safeParse({
        requests: [{ id: "pool:pool-1", includeResumeText: true }, { id: "pool-2" }],
      }).success,
    ).toBe(true);
    expect(getJobDescriptionDetailInputSchema.safeParse({ ids: ["jd-1", "jd-2"] }).success).toBe(
      true,
    );
    expect(
      getResumeRecordDetailInputSchema.safeParse({
        requests: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id })),
      }).success,
    ).toBe(false);
  });

  it("supports filtering a candidate search by multiple jobs", () => {
    expect(searchResumeRecordsInputSchema.parse({ jobDescriptionIds: ["jd-1", "jd-2"] })).toEqual({
      jobDescriptionIds: ["jd-1", "jd-2"],
    });
  });

  it("exposes stored six-dimension review data in resume detail tool results", () => {
    const result = getResumeRecordDetailOutputSchema.parse({
      missingIds: [],
      resumeRecords: [
        {
          candidateName: "张三",
          citation: {
            id: "resume-1",
            label: "张三",
            recordType: "resume_record",
            secondaryLabel: "前端工程师",
          },
          id: "resume-1",
          interviewQuestions: [],
          jobDescriptionId: "jd-1",
          jobDescriptionName: "前端工程师",
          notes: null,
          pipelineStage: "screening",
          resumeEvaluationArtifactMode: "legacy",
          resumeProfile: null,
          resumeReview: {
            biasScan: { items: [] },
            dimensions: {
              educationBackground: { rationale: "学历符合要求", score: 80 },
              experienceRelevance: { rationale: "经验相关", score: 88 },
              potential: { rationale: "成长性良好", score: 82 },
              projectMatch: { rationale: "项目匹配", score: 86 },
              skillMatch: { rationale: "核心技能匹配", score: 92 },
              stability: { rationale: "履历稳定", score: 78 },
            },
            levelRecommendation: { level: "高级", rationale: "经验充分" },
            nextStep: {
              action: "interview",
              disclaimer: "以上为初步结论",
              interviewFocus: ["系统设计"],
              rationale: "建议进入面试",
            },
            overall: {
              baseScore: 87,
              conclusion: "整体匹配",
              scoreRationale: "六维加权",
            },
            schemaVersion: 4,
            strengths: [{ evidence: "项目经历", impact: "可快速上手", point: "经验丰富" }],
            teamPositioning: { rationale: "能力匹配", suggestion: "核心开发" },
            weaknesses: [{ evidence: null, impact: "需要验证", point: "管理经验有限" }],
          },
          resumeReviewError: null,
          resumeReviewStatus: "ready",
          resumeSummary: "5 年前端经验",
          resumeText: null,
          structuredResumeReview: null,
          targetRole: "高级前端",
        },
      ],
    });

    expect(result.resumeRecords[0]?.resumeReview?.dimensions.skillMatch?.score).toBe(92);
  });

  it("exposes the current structured score when the legacy review is empty", () => {
    const result = getResumeRecordDetailOutputSchema.parse({
      missingIds: [],
      resumeRecords: [
        {
          candidateName: "结构化候选人",
          citation: {
            id: "resume-structured",
            label: "结构化候选人",
            recordType: "resume_record",
            secondaryLabel: "运营岗位",
          },
          id: "resume-structured",
          interviewQuestions: [],
          jobDescriptionId: "jd-community-operations",
          jobDescriptionName: "运营岗位",
          notes: null,
          pipelineStage: "screening",
          resumeEvaluationArtifactMode: "structured",
          resumeProfile: null,
          resumeReview: null,
          resumeReviewError: null,
          resumeReviewStatus: "ready",
          resumeSummary: "具备社区运营经验",
          resumeText: null,
          structuredResumeReview: {
            adjustments: [],
            compositeScore: 100,
            dimensions: {
              educationBackground: { rationale: "学历符合岗位要求", score: 100, weight: 10 },
              experienceRelevance: { rationale: "运营经验高度相关", score: 100, weight: 25 },
              potential: { rationale: "具备成长潜力", score: 100, weight: 8 },
              projectMatch: { rationale: "项目经验匹配", score: 100, weight: 15 },
              skillMatch: { rationale: "核心技能匹配", score: 100, weight: 35 },
              stability: { rationale: "履历稳定", score: 100, weight: 7 },
            },
            gateJudgments: [],
            gateStatus: "passed",
            grade: "recommended",
            overallComment: "岗位匹配度高",
            recommendation: "建议进入下一轮",
            summary: "六维表现均衡",
          },
          targetRole: "运营岗位",
        },
      ],
    });

    expect(result.resumeRecords[0]?.resumeEvaluationArtifactMode).toBe("structured");
    expect(result.resumeRecords[0]?.structuredResumeReview?.compositeScore).toBe(100);
    expect(result.resumeRecords[0]?.resumeReview).toBeNull();
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
    expect(tools.propose_recruiting_action.description).toContain("用户随后明确同意绑定后调用");
    expect(tools.get_resume_record_detail.description).toContain(
      "先输出不写库的通用 Markdown 评价",
    );
    expect(tools.get_resume_record_detail.description).toContain("一次读取 1 到 5 人");
    expect(tools.get_resume_record_detail.description).toContain("用户明确同意前不要调用");
    expect(tools.get_resume_record_detail.description).toContain("旧版六维评分或新版结构化评分");
    expect(tools.get_resume_record_detail.description).toContain("主动展示数据库评分卡");
    expect(tools.get_resume_pool_detail.description).toContain("再询问是否绑定");
  });

  it("does not expose conversation binding proposals without explicit consent", () => {
    const bindProposal = {
      explanation: "绑定后进行岗位分析",
      payload: { jobDescriptionId: "jd-1", resumeRecordId: "resume-1" },
      title: "绑定岗位",
      type: "bind_candidate_to_job",
    };

    expect(getRecruitingActionInputSchema(false).safeParse(bindProposal).success).toBe(false);
    expect(getRecruitingActionInputSchema(true).safeParse(bindProposal).success).toBe(true);
  });
});
