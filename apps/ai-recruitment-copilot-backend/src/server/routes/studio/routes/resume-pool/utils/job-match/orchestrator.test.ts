import { describe, expect, it, vi } from "vitest";
import {
  createDefaultJobDescriptionStructuredConfig,
  createDefaultResumeScreeningPolicy,
} from "@arc/shared/job-descriptions";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { runNewMailResumeJobMatch } from "./orchestrator";
import type {
  NewMailResumeJobMatchContext,
  NewMailResumeJobMatchDependencies,
} from "./orchestrator";

const profile: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "张三",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 4,
};

function job(id: string, name: string): JobDescriptionListRecord {
  return {
    allowCrossDepartmentInterviewers: false,
    code: id.toUpperCase(),
    createdAt: new Date(),
    createdBy: null,
    deductionRuleSetVersion: null,
    departmentId: "department-1",
    departmentName: "技术部",
    description: `${name}岗位描述`,
    evaluationBlueprint: null,
    evaluationBlueprintHash: null,
    evaluationBlueprintPreview: null,
    evaluationBlueprintPreviewGeneratedAt: null,
    evaluationBlueprintPreviewHash: null,
    evaluationBlueprintPreviewInputHash: null,
    evaluationBlueprintSchemaVersion: null,
    evaluationMode: "legacy",
    evaluationUpgradedAt: null,
    evaluationUpgradedBy: null,
    hasEvaluationUpgradeDraft: false,
    id,
    interviewerIds: [],
    interviewers: [],
    lifecycleStatus: "published",
    name,
    presetQuestions: [],
    prompt: "",
    publishedAt: new Date(),
    resumeCount: 0,
    resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
    resumeScreeningPolicyHash: null,
    resumeScreeningPolicyVersion: 1,
    structuredConfig: createDefaultJobDescriptionStructuredConfig(),
    updatedAt: new Date(),
  } satisfies JobDescriptionListRecord;
}

const frontend = job("jd-frontend", "前端工程师");
const fullstack = job("jd-fullstack", "全栈工程师");

function context(
  overrides: Partial<NewMailResumeJobMatchContext> = {},
): NewMailResumeJobMatchContext {
  return {
    batchItemId: "batch-item-1",
    currentJobDescriptionId: null,
    explicitJobDescriptionId: null,
    explicitSelectionMethod: null,
    organizationId: "org-1",
    poolItemId: "pool-1",
    resumeFileName: "张三个人简历.pdf",
    resumeProfile: profile,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<NewMailResumeJobMatchDependencies> = {},
): NewMailResumeJobMatchDependencies {
  return {
    listPublishedJobs: vi.fn(() => Promise.resolve([frontend, fullstack])),
    persistOutcome: vi.fn(() => Promise.resolve()),
    rankCandidates: vi.fn(() =>
      Promise.resolve({
        candidates: [
          {
            jobDescriptionId: "jd-fullstack",
            matchScore: 83,
            rank: 1,
            reason: "综合能力更匹配",
          },
          {
            jobDescriptionId: "jd-frontend",
            matchScore: 76,
            rank: 2,
            reason: "前端技能匹配",
          },
        ],
        selectedJobDescriptionId: "jd-fullstack",
      }),
    ),
    recallCandidates: vi.fn(() =>
      Promise.resolve({
        diagnostics: { aboveThresholdCount: 2, eligibleCount: 2, vectorHitCount: 2 },
        recommendations: [
          {
            departmentName: "技术部",
            description: null,
            id: "jd-frontend",
            name: "前端工程师",
            reasons: [],
            score: 20,
            similarity: { skillRole: 0.2 },
          },
          {
            departmentName: "技术部",
            description: null,
            id: "jd-fullstack",
            name: "全栈工程师",
            reasons: [],
            score: 18,
            similarity: { skillRole: 0.18 },
          },
        ],
        resume: { id: "pool-1" },
        status: "ready" as const,
      }),
    ),
    ...overrides,
  };
}

describe("runNewMailResumeJobMatch", () => {
  it("records an explicit subject-code binding without vector or AI calls", async () => {
    const deps = dependencies();
    await runNewMailResumeJobMatch(
      context({
        currentJobDescriptionId: "jd-frontend",
        explicitJobDescriptionId: "jd-frontend",
        explicitSelectionMethod: "mail_subject_code_exact",
      }),
      deps,
    );

    expect(deps.recallCandidates).not.toHaveBeenCalled();
    expect(deps.rankCandidates).not.toHaveBeenCalled();
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedJobDescriptionId: "jd-frontend",
        selectionMethod: "mail_subject_code_exact",
        status: "succeeded",
      }),
    );
  });

  it("binds a unique exact filename match without invoking AI", async () => {
    const deps = dependencies();
    await runNewMailResumeJobMatch(context({ resumeFileName: "张三-前端工程师-4年.pdf" }), deps);

    expect(deps.rankCandidates).not.toHaveBeenCalled();
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedJobDescriptionId: "jd-frontend",
        selectionMethod: "filename_exact",
        status: "succeeded",
      }),
    );
  });

  it("sends conflicting subject-code jobs to AI instead of directly binding the filename match", async () => {
    const deps = dependencies();
    await runNewMailResumeJobMatch(
      context({
        resumeFileName: "张三-前端工程师.pdf",
        subjectJobCodes: ["JD-FRONTEND", "JD-FULLSTACK"],
      }),
      deps,
    );

    expect(deps.rankCandidates).toHaveBeenCalled();
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            jobDescriptionId: "jd-frontend",
            recallSource: "subject_code",
          }),
          expect.objectContaining({
            jobDescriptionId: "jd-fullstack",
            recallSource: "subject_code",
          }),
        ]),
        selectionMethod: "ai_rerank",
      }),
    );
  });

  it("sends conflicting subject-code jobs to AI instead of falling back to the account-fixed job", async () => {
    const deps = dependencies();
    await runNewMailResumeJobMatch(
      context({
        currentJobDescriptionId: "jd-frontend",
        explicitJobDescriptionId: "jd-frontend",
        explicitSelectionMethod: "account_fixed",
        subjectJobCodes: ["JD-FRONTEND", "JD-FULLSTACK"],
      }),
      deps,
    );

    expect(deps.rankCandidates).toHaveBeenCalled();
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedJobDescriptionId: "jd-fullstack",
        selectionMethod: "ai_rerank",
      }),
    );
  });

  it("normalizes published job codes before comparing subject codes", async () => {
    const lowerCaseCodeJob = { ...frontend, code: " jd-frontend " };
    const deps = dependencies({
      listPublishedJobs: vi.fn(() => Promise.resolve([lowerCaseCodeJob, fullstack])),
    });
    await runNewMailResumeJobMatch(
      context({
        resumeFileName: "张三个人简历.pdf",
        subjectJobCodes: ["JD-FRONTEND"],
      }),
      deps,
    );

    expect(deps.rankCandidates).not.toHaveBeenCalled();
    expect(deps.recallCandidates).not.toHaveBeenCalled();
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [expect.objectContaining({ recallSource: "subject_code" })],
        selectedJobDescriptionId: "jd-frontend",
        selectionMethod: "mail_subject_code_exact",
        status: "succeeded",
      }),
    );
  });

  it("prefers one exact subject-code job over a conflicting filename job", async () => {
    const deps = dependencies();
    await runNewMailResumeJobMatch(
      context({
        resumeFileName: "张三-全栈工程师.pdf",
        subjectJobCodes: ["JD-FRONTEND"],
      }),
      deps,
    );

    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedJobDescriptionId: "jd-frontend",
        selectionMethod: "mail_subject_code_exact",
      }),
    );
  });

  it("keeps low-vector-score jobs and binds the AI-ranked Top1", async () => {
    const deps = dependencies();
    await runNewMailResumeJobMatch(context(), deps);

    expect(deps.recallCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ minimumScore: 0 }),
    );
    expect(deps.rankCandidates).toHaveBeenCalled();
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({ jobDescriptionId: "jd-frontend", vectorScore: 20 }),
          expect.objectContaining({ jobDescriptionId: "jd-fullstack", vectorScore: 18 }),
        ]),
        selectedJobDescriptionId: "jd-fullstack",
        selectionMethod: "ai_rerank",
        status: "succeeded",
      }),
    );
  });

  it("merges target-role and filename-core strong candidates ahead of vector candidates", async () => {
    const commercial = job("jd-commercial", "商业化运营经理");
    const content = job("jd-content", "内容运营总监");
    const game = job("jd-game", "游戏平台运营总监");
    const deps = dependencies({
      listPublishedJobs: vi.fn(() => Promise.resolve([commercial, content, game])),
      rankCandidates: vi.fn(() =>
        Promise.resolve({
          candidates: [
            {
              jobDescriptionId: "jd-content",
              matchScore: 91,
              rank: 1,
              reason: "明确目标岗位优先",
            },
            {
              jobDescriptionId: "jd-commercial",
              matchScore: 86,
              rank: 2,
              reason: "文件名投递岗位匹配",
            },
            {
              jobDescriptionId: "jd-game",
              matchScore: 60,
              rank: 3,
              reason: "向量召回补充",
            },
          ],
          selectedJobDescriptionId: "jd-content",
        }),
      ),
      recallCandidates: vi.fn(() =>
        Promise.resolve({
          diagnostics: { aboveThresholdCount: 1, eligibleCount: 1, vectorHitCount: 1 },
          recommendations: [
            {
              departmentName: "运营部",
              description: null,
              id: "jd-game",
              name: "游戏平台运营总监",
              reasons: [],
              score: 49,
              similarity: { skillRole: 0.65, workProject: 0.57 },
            },
          ],
          resume: { id: "pool-1" },
          status: "ready" as const,
        }),
      ),
    });

    await runNewMailResumeJobMatch(
      context({
        resumeFileName: "【商业化运营_深圳_25-40K】张净淅_15年.pdf",
        resumeProfile: { ...profile, targetRoles: ["内容运营"] },
      }),
      deps,
    );

    expect(deps.rankCandidates).toHaveBeenCalledWith(
      expect.any(Object),
      [content, commercial, game],
      expect.any(Object),
    );
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            jobDescriptionId: "jd-content",
            recallSource: "target_role_core",
          }),
          expect.objectContaining({
            jobDescriptionId: "jd-commercial",
            recallSource: "filename",
          }),
          expect.objectContaining({
            jobDescriptionId: "jd-game",
            recallSource: "vector",
          }),
        ]),
        selectedJobDescriptionId: "jd-content",
        selectionMethod: "ai_rerank",
      }),
    );
  });

  it("records target-role as the dominant source when the same candidate has multiple signals", async () => {
    const content = job("jd-content", "内容运营总监");
    const deps = dependencies({
      listPublishedJobs: vi.fn(() => Promise.resolve([content, fullstack])),
      rankCandidates: vi.fn(() =>
        Promise.resolve({
          candidates: [
            {
              jobDescriptionId: "jd-content",
              matchScore: 90,
              rank: 1,
              reason: "目标岗位优先",
            },
            {
              jobDescriptionId: "jd-fullstack",
              matchScore: 50,
              rank: 2,
              reason: "向量补充",
            },
          ],
          selectedJobDescriptionId: "jd-content",
        }),
      ),
      recallCandidates: vi.fn(() =>
        Promise.resolve({
          diagnostics: { aboveThresholdCount: 1, eligibleCount: 1, vectorHitCount: 1 },
          recommendations: [
            {
              departmentName: "技术部",
              description: null,
              id: "jd-content",
              name: "内容运营总监",
              reasons: [],
              score: 48,
              similarity: { skillRole: 0.63 },
            },
          ],
          resume: { id: "pool-1" },
          status: "ready" as const,
        }),
      ),
    });

    await runNewMailResumeJobMatch(
      context({
        resumeFileName: "张净淅-内容运营.pdf",
        resumeProfile: { ...profile, targetRoles: ["内容运营"] },
      }),
      deps,
    );

    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            jobDescriptionId: "jd-content",
            recallSource: "target_role_core",
            vectorScore: 48,
          }),
        ]),
      }),
    );
  });

  it("falls back to vector Top1 when AI ranking fails", async () => {
    const deps = dependencies({
      rankCandidates: vi.fn(() => Promise.reject(new Error("AI unavailable"))),
    });
    await runNewMailResumeJobMatch(
      context({ resumeProfile: { ...profile, targetRoles: ["不存在的岗位"] } }),
      deps,
    );

    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedJobDescriptionId: "jd-frontend",
        selectionMethod: "vector_fallback",
        status: "succeeded",
      }),
    );
  });

  it("falls back to the strongest target-role candidate when AI ranking fails", async () => {
    const target = job("jd-target", "内容运营总监");
    const filename = job("jd-filename", "商业化运营经理");
    const vector = job("jd-vector", "游戏平台运营总监");
    const deps = dependencies({
      listPublishedJobs: vi.fn(() => Promise.resolve([target, filename, vector])),
      rankCandidates: vi.fn(() => Promise.reject(new Error("AI unavailable"))),
      recallCandidates: vi.fn(() =>
        Promise.resolve({
          diagnostics: { aboveThresholdCount: 1, eligibleCount: 1, vectorHitCount: 1 },
          recommendations: [
            {
              departmentName: "运营部",
              description: null,
              id: "jd-vector",
              name: "游戏平台运营总监",
              reasons: [],
              score: 80,
              similarity: { skillRole: 0.8 },
            },
          ],
          resume: { id: "pool-1" },
          status: "ready" as const,
        }),
      ),
    });

    await runNewMailResumeJobMatch(
      context({
        resumeFileName: "【商业化运营_深圳】候选人.pdf",
        resumeProfile: { ...profile, targetRoles: ["内容运营总监"] },
      }),
      deps,
    );

    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            jobDescriptionId: "jd-target",
            recallSource: "target_role_exact",
          }),
        ]),
        selectedJobDescriptionId: "jd-target",
        selectionMethod: "strong_signal_fallback",
        status: "succeeded",
      }),
    );
  });

  it("keeps a unique exact filename job when conflicting subject codes require AI ranking", async () => {
    const commercial = job("jd-commercial", "商业化运营经理");
    const subjectA = job("jd-subject-a", "前端工程师");
    const subjectB = job("jd-subject-b", "全栈工程师");
    const deps = dependencies({
      listPublishedJobs: vi.fn(() => Promise.resolve([commercial, subjectA, subjectB])),
      rankCandidates: vi.fn((_profile: ResumeProfile, candidates: JobDescriptionListRecord[]) =>
        Promise.resolve({
          candidates: candidates.map((candidate, index) => ({
            jobDescriptionId: candidate.id,
            matchScore: 90 - index,
            rank: index + 1,
            reason: "测试排序",
          })),
          selectedJobDescriptionId: candidates[0]?.id ?? "jd-commercial",
        }),
      ),
      recallCandidates: vi.fn(() =>
        Promise.resolve({
          diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
          recommendations: [],
          resume: { id: "pool-1" },
          status: "ready" as const,
        }),
      ),
    });

    await runNewMailResumeJobMatch(
      context({
        resumeFileName: "【商业化运营经理】候选人.pdf",
        subjectJobCodes: ["JD-SUBJECT-A", "JD-SUBJECT-B"],
      }),
      deps,
    );

    expect(deps.rankCandidates).toHaveBeenCalledWith(
      expect.any(Object),
      expect.arrayContaining([commercial, subjectA, subjectB]),
      expect.any(Object),
    );
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            jobDescriptionId: "jd-commercial",
            recallSource: "filename",
          }),
        ]),
      }),
    );
  });

  it("does not convert a successful AI result into vector fallback when persistence fails", async () => {
    const persistenceError = new Error("database unavailable");
    const deps = dependencies({
      persistOutcome: vi.fn(() => Promise.reject(persistenceError)),
    });

    await expect(runNewMailResumeJobMatch(context(), deps)).rejects.toBe(persistenceError);
    expect(deps.persistOutcome).toHaveBeenCalledTimes(1);
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ selectionMethod: "ai_rerank", status: "succeeded" }),
    );
  });

  it("records no_candidates when the organization has no published jobs", async () => {
    const deps = dependencies({ listPublishedJobs: vi.fn(() => Promise.resolve([])) });
    await runNewMailResumeJobMatch(context(), deps);
    expect(deps.persistOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: [], status: "no_candidates" }),
    );
  });
});
