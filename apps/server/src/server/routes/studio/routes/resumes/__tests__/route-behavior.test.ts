import { beforeEach, describe, expect, it, vi } from "vitest";
import { db as defaultDb } from "@app/server/lib/server/db";
import { factory } from "@app/server/server/factory";
import type { ResumeLibraryRouterDependencies } from "../route";
import { createResumeLibraryRouter } from "../route";

interface JobDescriptionChangeDetail {
  fromJobDescriptionId: string;
  fromJobDescriptionName: string;
  toJobDescriptionId: string;
  toJobDescriptionName: string;
}

interface ResumeRouteMutation {
  action?: string;
  detail?: JobDescriptionChangeDetail;
  resumeReview?: object | null;
  resumeReviewError?: string | null;
  resumeReviewGeneratedAt?: Date | null;
  resumeReviewQueuedAt?: Date | null;
  resumeReviewRunId?: string | null;
  resumeReviewStatus?: string;
  resumeScreeningError?: string | null;
  resumeScreeningEvaluatedAt?: Date | null;
  resumeScreeningResult?: object | null;
  resumeScreeningStatus?: string;
}
const mocks = {
  autoBindApplicableTemplates: vi.fn(),
  buildScheduleRows: vi.fn(),
  createResumeRecordFromStorage: vi.fn(),
  deleteDuplicateMatchesForSource: vi.fn(),
  deleteResumeSemanticIndexBestEffort: vi.fn(),
  deleteReturning: vi.fn(),
  enqueueResumeReassessmentForRecord: vi.fn(),
  enqueueResumeSemanticIndexJobBestEffort: vi.fn(),
  findSemanticResumeDuplicates: vi.fn(),
  flattenPresetQuestionsFromContextSnapshot: vi.fn(),
  forceResumeReparse: vi.fn(),
  // SAFETY: The fixture records exactly the audit values asserted by these route tests.
  insertedValues: [] as ResumeRouteMutation[],
  invalidateStudioInterviewCaches: vi.fn(),
  jobDescriptionIdsExist: vi.fn(),
  launchAiInterviewRound: vi.fn(),
  listCandidateRounds: vi.fn(),
  listDuplicateMatchesForSource: vi.fn(),
  loadCandidateTimeline: vi.fn(),
  loadInterviewRoundDetail: vi.fn(),
  loadJobDescriptionById: vi.fn(),
  loadOrCreateActiveInterviewContextSnapshot: vi.fn(),
  loadRecruitingJobDescriptionById: vi.fn(),
  loadResumeDetail: vi.fn(),
  loadResumeDetailForWorkspaceMember: vi.fn(),
  loadResumeLibraryMetrics: vi.fn(),
  // SAFETY: The fixture records the literal resource/action pairs emitted by the middleware seam.
  permissionChecks: [] as [string, string][],
  queryPaginatedResumeRecords: vi.fn(),
  recruitingJobDescriptionIdsExist: vi.fn(),
  removeImportedInterviewFromConversations: vi.fn(),
  replaceDuplicateMatchesForSource: vi.fn(),
  resetResumeEvaluationForJobChange: vi.fn(),
  resolveRecruitingVisibilityScope: vi.fn(),
  resolveResumeUploadStorage: vi.fn(),
  retryFailedResumeParse: vi.fn(),
  scheduleResumeEvaluationForRecord: vi.fn(),
  submitResumeEvaluationOnce: vi.fn(),
  transaction: vi.fn(),
  // SAFETY: The fixture records exactly the update fields asserted by these route tests.
  updatePatches: [] as ResumeRouteMutation[],
  updateResumeEvaluationStatus: vi.fn(),
};

type RequirePermission = ResumeLibraryRouterDependencies["requirePermission"];
const requirePermission: RequirePermission = (resource, action) => (_c, next) => {
  mocks.permissionChecks.push([resource, action]);
  return next();
};

const resumeLibraryReadRouter: ResumeLibraryRouterDependencies["resumeLibraryReadRouter"] = factory
  .createApp()
  .get("/", requirePermission("resumeLibrary", "read"), async (c) => {
    const query = c.req.query();
    const result = await mocks.queryPaginatedResumeRecords(
      c.var.activeOrg?.id,
      {},
      { page: query.page, pageSize: query.pageSize },
      { kind: "all" },
      Number(c.req.query("knownTotal")),
    );
    return c.json(result, 200);
  })
  .get(
    "/metrics",
    requirePermission("page", "resumes"),
    requirePermission("resumeLibrary", "read"),
    async (c) => {
      const result = await mocks.loadResumeLibraryMetrics(c.var.activeOrg?.id, {
        createdByUserId: undefined,
      });
      return c.json(result, 200);
    },
  )
  .get("/:id/duplicate-matches", requirePermission("resumeLibrary", "read"), async (c) => {
    const id = c.req.param("id");
    await mocks.loadResumeDetail(id, c.var.activeOrg?.id, { kind: "all" });
    const matches = await mocks.listDuplicateMatchesForSource({
      organizationId: c.var.activeOrg?.id,
      sourceId: id,
      sourceType: "studio_interview",
    });
    return c.json({ matches }, 200);
  })
  .get("/:id/review", async (c) => {
    const result = await mocks.loadResumeDetailForWorkspaceMember(
      c.req.param("id"),
      c.var.activeOrg?.id,
    );
    return c.json(result, 200);
  })
  .post("/:id/review/evaluation", async (c) => {
    const id = c.req.param("id");
    await mocks.loadResumeDetailForWorkspaceMember(id, c.var.activeOrg?.id);
    const input = await c.req.json();
    const result = await mocks.submitResumeEvaluationOnce({
      id,
      operatorId: c.var.user?.id ?? null,
      organizationId: c.var.activeOrg?.id,
      status: input.status,
    });
    if (result.status === "not_found") {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const detail = await mocks.loadResumeDetailForWorkspaceMember(id, c.var.activeOrg?.id);
    return c.json(detail, 200);
  })
  .post("/:id/launch-interview", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const result = await mocks.launchAiInterviewRound({
      actorId: c.var.user?.id,
      interviewQuestions: body.interviewQuestions,
      interviewRecordId: id,
      organizationId: c.var.activeOrg?.id,
    });
    if (!result.ok) {
      if (result.reason === "stage_conflict") {
        return c.json({ code: "AI_INTERVIEW_STAGE_CONFLICT" }, 409);
      }
      if (result.reason === "structured_evaluation_confirmation_required") {
        return c.json({ code: "AI_INTERVIEW_CONFIRMATION_REQUIRED" }, 409);
      }
    }
    const detail = await mocks.loadInterviewRoundDetail(result.roundId, c.var.activeOrg?.id, {
      kind: "all",
    });
    return c.json(detail, 201);
  });

const emptyRouter = factory.createApp();
// SAFETY: The fake inherits the complete Drizzle database shape and replaces only methods used here.
const testDb = Object.assign(Object.create(defaultDb) as typeof defaultDb, {
  delete: () => ({
    where: () => ({ returning: mocks.deleteReturning }),
  }),
  transaction: mocks.transaction,
  update: () => ({
    set: (patch: ResumeRouteMutation) => {
      mocks.updatePatches.push(patch);
      return { where: () => Promise.resolve() };
    },
  }),
});
const resumeLibraryRouter = createResumeLibraryRouter({
  ...mocks,
  db: testDb,
  loadRecruitingJobDescriptionById: mocks.loadJobDescriptionById,
  normalizeResumeFile: () => null,
  recruitingJobDescriptionIdsExist: mocks.jobDescriptionIdsExist,
  recruitingRecordMeetingsRouter: emptyRouter,
  requirePermission,
  resumeLibraryReadRouter,
  structuredResumeEvaluationRouter: emptyRouter,
  syncResumeProfileIdentity: (profile) => profile,
  toBadRequest: (error) => ({
    error: error instanceof Error ? error.message : String(error),
    status: 400,
  }),
  validateResumeFile: () => {},
});

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
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORGANIZATION_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "owner" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
    mocks.forceResumeReparse.mockResolvedValue({ status: "queued" });
    mocks.retryFailedResumeParse.mockResolvedValue({ status: "queued" });
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
          values: (values: ResumeRouteMutation) => {
            mocks.insertedValues.push(values);
            return Object.assign(Promise.resolve(), {
              onConflictDoNothing: () => Promise.resolve(),
            });
          },
        }),
        update: () => ({
          set: (patch: ResumeRouteMutation) => {
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
    expect(mocks.loadResumeLibraryMetrics).toHaveBeenCalledWith(ORGANIZATION_ID, {
      createdByUserId: undefined,
    });
    expect(mocks.permissionChecks).toEqual([
      ["page", "resumes"],
      ["resumeLibrary", "read"],
    ]);
  });

  it("queues one retry for an eligible failed resume record", async () => {
    mocks.loadResumeDetail.mockResolvedValue({
      id: RECORD_ID,
      resumeParseRetryable: true,
      resumeParseStatus: "failed",
    });

    const response = await makeApp().request(`/resumes/${RECORD_ID}/retry-parse`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.retryFailedResumeParse).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedBy: USER_ID,
      resumeRecordId: RECORD_ID,
    });
  });

  it("queues another retry after a failed resume record was retried before", async () => {
    mocks.loadResumeDetail.mockResolvedValue({
      id: RECORD_ID,
      resumeParseRetryable: false,
      resumeParseStatus: "failed",
    });

    const response = await makeApp().request(`/resumes/${RECORD_ID}/retry-parse`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.retryFailedResumeParse).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedBy: USER_ID,
      resumeRecordId: RECORD_ID,
    });
  });

  it("queues an admin force reparse that bypasses parse cache", async () => {
    mocks.loadResumeDetail.mockResolvedValue({
      hasResumeFile: true,
      id: RECORD_ID,
      resumeParseStatus: "ready",
    });

    const response = await makeApp().request(`/resumes/${RECORD_ID}/force-reparse`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.forceResumeReparse).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedBy: USER_ID,
      resumeRecordId: RECORD_ID,
    });
    expect(mocks.invalidateStudioInterviewCaches).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it("rejects force reparse for non-admin workspace members", async () => {
    const app = factory
      .createApp()
      .use("*", async (c, next) => {
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        c.set("activeOrg", { id: ORGANIZATION_ID } as never);
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        c.set("member", { role: "member" } as never);
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        c.set("user", { id: USER_ID } as never);
        await next();
      })
      .route("/resumes", resumeLibraryRouter);

    const response = await app.request(`/resumes/${RECORD_ID}/force-reparse`, {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(mocks.forceResumeReparse).not.toHaveBeenCalled();
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
