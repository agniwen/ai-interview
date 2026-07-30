import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  autoBindApplicableTemplates: vi.fn(),
  buildScheduleRows: vi.fn(),
  createResumeRecordFromStorage: vi.fn(),
  deleteDuplicateMatchesForSource: vi.fn(),
  deleteResumeSemanticIndexBestEffort: vi.fn(),
  deleteReturning: vi.fn(),
  enqueueResumeReassessmentForRecord: vi.fn(),
  enqueueResumeSemanticIndexJobBestEffort: vi.fn(),
  findSemanticResumeDuplicates: vi.fn(),
  insertedValues: [] as Record<string, unknown>[],
  invalidateStudioInterviewCaches: vi.fn(),
  jobDescriptionIdsExist: vi.fn(),
  launchAiInterviewRound: vi.fn(),
  listCandidateRounds: vi.fn(),
  listDuplicateMatchesForSource: vi.fn(),
  loadCandidateTimeline: vi.fn(),
  loadInterviewRoundDetail: vi.fn(),
  loadJobDescriptionById: vi.fn(),
  loadOrCreateActiveInterviewContextSnapshot: vi.fn(),
  loadResumeDetail: vi.fn(),
  loadResumeDetailForWorkspaceMember: vi.fn(),
  loadResumeLibraryMetrics: vi.fn(),
  permissionChecks: [] as [string, string][],
  queryPaginatedResumeRecords: vi.fn(),
  removeImportedInterviewFromConversations: vi.fn(),
  replaceDuplicateMatchesForSource: vi.fn(),
  resetResumeEvaluationForJobChange: vi.fn(),
  resolveRecruitingVisibilityScope: vi.fn(),
  resolveResumeUploadStorage: vi.fn(),
  scheduleResumeEvaluationForRecord: vi.fn(),
  submitResumeEvaluationOnce: vi.fn(),
  transaction: vi.fn(),
  updatePatches: [] as Record<string, unknown>[],
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    delete: () => ({
      where: () => ({ returning: mocks.deleteReturning }),
    }),
    transaction: mocks.transaction,
  },
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  getObjectBytes: vi.fn(),
  getObjectStream: vi.fn(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  resolveRecruitingVisibilityScope: mocks.resolveRecruitingVisibilityScope,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/cache-tags", () => ({
  invalidateStudioInterviewCaches: mocks.invalidateStudioInterviewCaches,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/application/default-launch-ai-interview-round",
  () => ({
    launchAiInterviewRound: mocks.launchAiInterviewRound,
  }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat", () => ({
  removeImportedInterviewFromConversations: mocks.removeImportedInterviewFromConversations,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  parseResumeFastToProfile: vi.fn(),
  validateResumeFile: vi.fn(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission:
    (resource: string, action: string) => (_c: unknown, next: () => Promise<void>) => {
      mocks.permissionChecks.push([resource, action]);
      return next();
    },
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes",
  () => ({
    loadResumeDetail: mocks.loadResumeDetail,
    loadResumeDetailForWorkspaceMember: mocks.loadResumeDetailForWorkspaceMember,
    queryPaginatedResumeRecords: mocks.queryPaginatedResumeRecords,
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics",
  () => ({
    loadResumeLibraryMetrics: mocks.loadResumeLibraryMetrics,
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/evaluation",
  () => ({
    resetResumeEvaluationForJobChange: mocks.resetResumeEvaluationForJobChange,
    submitResumeEvaluationOnce: mocks.submitResumeEvaluationOnce,
    updateResumeEvaluationStatus: vi.fn(),
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/timeline",
  () => ({ loadCandidateTimeline: mocks.loadCandidateTimeline }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills",
  () => ({ listOrgSkillSuggestions: vi.fn(), syncResumeSkills: vi.fn() }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/interview/utils", () => ({
  buildScheduleRows: mocks.buildScheduleRows,
  normalizeResumeFile: () => null,
  resolveResumeUploadStorage: mocks.resolveResumeUploadStorage,
  storeInterviewResume: vi.fn(),
  toBadRequest: (error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
    status: 400,
  }),
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds",
  () => ({
    listInterviewRoundsForCandidate: mocks.listCandidateRounds,
    loadInterviewRoundDetail: mocks.loadInterviewRoundDetail,
  }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service", () => ({
  findSemanticResumeDuplicates: mocks.findSemanticResumeDuplicates,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches", () => ({
  deleteDuplicateMatchesForSource: mocks.deleteDuplicateMatchesForSource,
  listDuplicateMatchesForSource: mocks.listDuplicateMatchesForSource,
  replaceDuplicateMatchesForSource: mocks.replaceDuplicateMatchesForSource,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue", () => ({
  enqueueResumeSemanticIndexJobBestEffort: mocks.enqueueResumeSemanticIndexJobBestEffort,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/lifecycle", () => ({
  deleteResumeSemanticIndexBestEffort: mocks.deleteResumeSemanticIndexBestEffort,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/bindings",
  () => ({ autoBindApplicableTemplates: mocks.autoBindApplicableTemplates }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots",
  () => ({
    loadOrCreateActiveInterviewContextSnapshot: mocks.loadOrCreateActiveInterviewContextSnapshot,
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao",
  () => ({
    jobDescriptionIdsExist: mocks.jobDescriptionIdsExist,
    loadJobDescriptionById: mocks.loadJobDescriptionById,
    loadRecruitingJobDescriptionById: mocks.loadJobDescriptionById,
    recruitingJobDescriptionIdsExist: mocks.jobDescriptionIdsExist,
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/create-from-storage",
  () => ({ createResumeRecordFromStorage: mocks.createResumeRecordFromStorage }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/profile-sync",
  () => ({ syncResumeProfileIdentity: (profile: unknown) => profile }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-generation",
  () => ({
    generateResumeReviewBestEffort: vi.fn(),
    generateResumeScreeningBestEffort: vi.fn(),
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue",
  () => ({
    enqueueResumeReassessmentForRecord: mocks.enqueueResumeReassessmentForRecord,
    scheduleResumeEvaluationForRecord: mocks.scheduleResumeEvaluationForRecord,
  }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-worker",
  () => ({ reassessResumeRecord: vi.fn() }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview", () => ({
  createPptxPreviewPdfResponse: vi.fn(),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { resumeLibraryRouter } from "../route";

const ORGANIZATION_ID = "org_resume_routes";
const USER_ID = "user_resume_routes";
const RECORD_ID = "resume-record-1";
const SCHEDULE_ROW = { id: "round-1", roundLabel: "AI 一面" };

const EXISTING_RECORD = {
  candidateName: "候选人",
  hrResumeAssessment: null,
  jobDescriptionId: "jd-old",
  jobDescriptionName: "旧岗位",
  outcome: "in_pipeline",
  pipelineStage: "screening",
  resumeContentHash: null,
  resumeEvaluationStatus: "pass",
  resumeFileName: null,
  resumeParseStatus: "ready",
  resumeProfile: null,
  resumeReview: null,
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: ORGANIZATION_ID } as never);
      c.set("member", { role: "owner" } as never);
      c.set("user", { id: USER_ID } as never);
      await next();
    })
    .route("/resumes", resumeLibraryRouter);
}

describe("resumeLibraryRouter behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedValues.length = 0;
    mocks.permissionChecks.length = 0;
    mocks.updatePatches.length = 0;
    mocks.resolveRecruitingVisibilityScope.mockResolvedValue({ kind: "all" });
    mocks.resolveResumeUploadStorage.mockResolvedValue(null);
    mocks.jobDescriptionIdsExist.mockResolvedValue(true);
    mocks.enqueueResumeReassessmentForRecord.mockResolvedValue("enqueued");
    mocks.scheduleResumeEvaluationForRecord.mockResolvedValue({
      status: "enqueued",
    });
    mocks.loadJobDescriptionById.mockResolvedValue({
      evaluationMode: "legacy",
      id: "jd-new",
      name: "新岗位",
    });
    mocks.buildScheduleRows.mockReturnValue([SCHEDULE_ROW]);
    mocks.loadInterviewRoundDetail.mockResolvedValue({ id: SCHEDULE_ROW.id });
    mocks.launchAiInterviewRound.mockResolvedValue({
      ok: true,
      roundId: SCHEDULE_ROW.id,
    });
    mocks.queryPaginatedResumeRecords.mockResolvedValue({
      page: 2,
      pageSize: 20,
      records: [],
      total: 1103,
      totalPages: 56,
    });
    mocks.loadResumeLibraryMetrics.mockResolvedValue({
      byPipeline: [],
      conversion: { withInterview: 0, withoutInterview: 0 },
      dailyAdded: [],
    });
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Drizzle transactions use a callback API.
    mocks.transaction.mockImplementation((callback) => {
      const tx = {
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            mocks.insertedValues.push(values);
            return Promise.resolve();
          },
        }),
        update: () => ({
          set: (patch: Record<string, unknown>) => {
            mocks.updatePatches.push(patch);
            return { where: () => Promise.resolve() };
          },
        }),
      };
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- invoke the supplied transaction callback.
      return callback(tx);
    });
  });

  it("passes a known total to later list pages", async () => {
    const response = await makeApp().request("/resumes?page=2&pageSize=20&knownTotal=1103");

    expect(response.status).toBe(200);
    expect(mocks.queryPaginatedResumeRecords).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      expect.any(Object),
      expect.objectContaining({ page: "2", pageSize: "20" }),
      { kind: "all" },
      1103,
    );
  });

  it("returns resume-library metrics behind page and resource permissions", async () => {
    const response = await makeApp().request("/resumes/metrics");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      byPipeline: [],
      conversion: { withInterview: 0, withoutInterview: 0 },
      dailyAdded: [],
    });
    expect(mocks.loadResumeLibraryMetrics).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(mocks.permissionChecks).toEqual([
      ["page", "resumes"],
      ["resumeLibrary", "read"],
    ]);
  });

  it("persists duplicate matches after creating a resume-library record", async () => {
    const matches = [{ id: "duplicate-1" }];
    mocks.findSemanticResumeDuplicates.mockResolvedValue(matches);
    mocks.createResumeRecordFromStorage.mockResolvedValue(RECORD_ID);
    mocks.loadResumeDetail.mockResolvedValue({ id: RECORD_ID });

    const formData = new FormData();
    formData.set("candidateName", "候选人");
    formData.set("jobDescriptionId", "jd-new");

    const response = await makeApp().request("/resumes", { body: formData, method: "POST" });

    expect(response.status).toBe(201);
    expect(mocks.replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
      matches,
      organizationId: ORGANIZATION_ID,
      sourceId: RECORD_ID,
      sourceType: "studio_interview",
    });
  });

  it("returns duplicate details only after the record passes visibility checks", async () => {
    const matches = [{ id: "duplicate-1" }];
    mocks.loadResumeDetail.mockResolvedValue({ id: RECORD_ID });
    mocks.listDuplicateMatchesForSource.mockResolvedValue(matches);

    const response = await makeApp().request(`/resumes/${RECORD_ID}/duplicate-matches`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matches });
    expect(mocks.listDuplicateMatchesForSource).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolOwnerUserId: USER_ID,
      sourceId: RECORD_ID,
      sourceType: "studio_interview",
    });
  });

  it("delegates AI interview launch to the atomic command", async () => {
    mocks.loadResumeDetail.mockResolvedValue(EXISTING_RECORD);

    const response = await makeApp().request(`/resumes/${RECORD_ID}/launch-interview`, {
      body: JSON.stringify({ interviewQuestions: [] }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(mocks.launchAiInterviewRound).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: USER_ID,
        interviewRecordId: RECORD_ID,
        organizationId: ORGANIZATION_ID,
      }),
    );
  });

  it("blocks launching AI interview after the candidate reaches a later stage", async () => {
    mocks.launchAiInterviewRound.mockResolvedValue({
      ok: false,
      reason: "stage_conflict",
    });

    const response = await makeApp().request(`/resumes/${RECORD_ID}/launch-interview`, {
      body: JSON.stringify({ interviewQuestions: [] }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "AI_INTERVIEW_STAGE_CONFLICT",
    });
  });

  it("returns a confirmation conflict when the current structured evaluation needs acknowledgement", async () => {
    mocks.launchAiInterviewRound.mockResolvedValue({
      ok: false,
      reason: "structured_evaluation_confirmation_required",
    });

    const response = await makeApp().request(`/resumes/${RECORD_ID}/launch-interview`, {
      body: JSON.stringify({ interviewQuestions: [] }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "AI_INTERVIEW_CONFIRMATION_REQUIRED",
    });
  });

  it("exposes workspace review data and records a one-time evaluation", async () => {
    mocks.loadResumeDetailForWorkspaceMember
      .mockResolvedValueOnce({ id: RECORD_ID })
      .mockResolvedValueOnce({ id: RECORD_ID })
      .mockResolvedValueOnce({ id: RECORD_ID, resumeEvaluationStatus: "pass" });
    mocks.submitResumeEvaluationOnce.mockResolvedValue({ status: "updated" });

    const detailResponse = await makeApp().request(`/resumes/${RECORD_ID}/review`);
    const evaluationResponse = await makeApp().request(`/resumes/${RECORD_ID}/review/evaluation`, {
      body: JSON.stringify({ status: "pass" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(detailResponse.status).toBe(200);
    expect(evaluationResponse.status).toBe(200);
    expect(mocks.submitResumeEvaluationOnce).toHaveBeenCalledWith({
      id: RECORD_ID,
      operatorId: USER_ID,
      organizationId: ORGANIZATION_ID,
      status: "pass",
    });
  });

  it("audits a full-form job change and resets both evaluation paths", async () => {
    const existingWithProfile = {
      ...EXISTING_RECORD,
      resumeProfile: { name: "候选人", targetRoles: [] },
    };
    mocks.loadResumeDetail
      .mockResolvedValueOnce(existingWithProfile)
      .mockResolvedValueOnce({ ...existingWithProfile, jobDescriptionId: "jd-new" });
    mocks.loadJobDescriptionById.mockResolvedValue({ id: "jd-new", name: "新岗位" });

    const formData = new FormData();
    formData.set("candidateName", "候选人");
    formData.set("jobDescriptionId", "jd-new");
    formData.set("resumeEvaluationStatus", "pass");

    const response = await makeApp().request(`/resumes/${RECORD_ID}`, {
      body: formData,
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        action: "job_description_changed",
        detail: {
          fromJobDescriptionId: "jd-old",
          fromJobDescriptionName: "旧岗位",
          toJobDescriptionId: "jd-new",
          toJobDescriptionName: "新岗位",
        },
      }),
    );
    expect(mocks.resetResumeEvaluationForJobChange).toHaveBeenCalledWith({
      id: RECORD_ID,
      nextJobDescriptionId: "jd-new",
      operatorId: USER_ID,
      organizationId: ORGANIZATION_ID,
      previousJobDescriptionId: "jd-old",
      previousStatus: "pass",
    });
    expect(mocks.enqueueResumeReassessmentForRecord).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      resumeRecordId: RECORD_ID,
    });
  });

  it("invalidates stale AI scoring and queues a new assessment when the job changes", async () => {
    const processingRecord = {
      ...EXISTING_RECORD,
      resumeProfile: { name: "候选人", targetRoles: [] },
      resumeReview: { overall: { conclusion: "旧岗位评分" } },
      resumeReviewRunId: "old-run",
      resumeReviewStatus: "processing",
      resumeScreeningResult: { recommendation: "pass" },
      resumeScreeningStatus: "processing",
    };
    mocks.loadResumeDetail.mockResolvedValueOnce(processingRecord).mockResolvedValueOnce({
      ...processingRecord,
      jobDescriptionId: "jd-new",
      resumeReview: null,
      resumeReviewStatus: "queued",
    });
    mocks.loadJobDescriptionById.mockResolvedValue({ id: "jd-new", name: "新岗位" });

    const response = await makeApp().request(`/resumes/${RECORD_ID}/identity`, {
      body: JSON.stringify({
        age: null,
        candidateEmail: "",
        candidateName: "候选人",
        candidatePhone: "",
        gender: "",
        jobDescriptionId: "jd-new",
        resumeEvaluationStatus: "pass",
        targetRole: "",
        workYears: null,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(mocks.updatePatches).toContainEqual(
      expect.objectContaining({
        resumeReview: null,
        resumeReviewError: null,
        resumeReviewGeneratedAt: null,
        resumeReviewQueuedAt: null,
        resumeReviewRunId: null,
        resumeReviewStatus: "idle",
        resumeScreeningError: null,
        resumeScreeningEvaluatedAt: null,
        resumeScreeningResult: null,
        resumeScreeningStatus: "idle",
      }),
    );
    expect(mocks.enqueueResumeReassessmentForRecord).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      resumeRecordId: RECORD_ID,
    });
  });

  it("cleans semantic and duplicate state after deleting a resume", async () => {
    mocks.loadResumeDetail.mockResolvedValue(EXISTING_RECORD);
    mocks.deleteReturning.mockResolvedValue([{ id: RECORD_ID }]);

    const response = await makeApp().request(`/resumes/${RECORD_ID}`, { method: "DELETE" });

    expect(response.status).toBe(200);
    expect(mocks.deleteResumeSemanticIndexBestEffort).toHaveBeenCalledWith({
      sourceId: RECORD_ID,
      sourceType: "studio_interview",
    });
    expect(mocks.deleteDuplicateMatchesForSource).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceId: RECORD_ID,
      sourceType: "studio_interview",
    });
    expect(mocks.removeImportedInterviewFromConversations).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      RECORD_ID,
    );
  });
});
