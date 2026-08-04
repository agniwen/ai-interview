import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeReview } from "@arc/db-schema/resume-review";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";
import { runResumeAssessmentLifecycle } from "./review-lifecycle";
import type {
  GeneratedResumeAssessment,
  ResumeAssessmentLifecycleDeps,
  ResumeAssessmentRecord,
} from "./review-lifecycle";

const PROFILE = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "张三",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["TypeScript"],
  targetRoles: ["工程师"],
  workExperiences: [],
  workYears: 3,
} satisfies ResumeProfile;

const OLD_REVIEW = { overall: { conclusion: "上一次成功结果" } } as ResumeReview;
const OLD_SCREENING = { recommendation: "flag" } as ResumeScreeningResult;
const NEW_REVIEW = { overall: { conclusion: "本次结果" } } as ResumeReview;
const NEW_SCREENING = { recommendation: "pass" } as ResumeScreeningResult;
const GENERATED: GeneratedResumeAssessment = {
  mode: "legacy",
  resumeReview: NEW_REVIEW,
  review: "本次结果",
  screeningResult: NEW_SCREENING,
};

interface MutableRecord extends ResumeAssessmentRecord {
  resumeReviewError: string | null;
  resumeReviewStatus: string;
  resumeScreeningError: string | null;
  resumeScreeningStatus: string;
}

function createStore(overrides: Partial<ResumeAssessmentRecord> = {}) {
  const record: MutableRecord = {
    evaluationMode: "legacy",
    jobDescriptionId: "jd-1",
    outcome: "in_pipeline",
    pipelineStage: "screening",
    resumeContentHash: "file-hash",
    resumeEvaluationArtifactMode: "legacy",
    resumeEvaluationAttemptMode: "legacy",
    resumeParseStatus: "ready",
    resumeProfile: PROFILE,
    resumeReview: OLD_REVIEW,
    resumeReviewError: null,
    resumeReviewQueuedAt: new Date("2026-07-29T08:00:00.000Z"),
    resumeReviewRunId: "run-1",
    resumeReviewStatus: "queued",
    resumeScreeningError: null,
    resumeScreeningResult: OLD_SCREENING,
    resumeScreeningStatus: "ready",
    resumeText: "简历正文",
    structuredResumeEvaluation: null,
    ...overrides,
  };
  const deps: ResumeAssessmentLifecycleDeps = {
    generate: () => Promise.resolve(GENERATED),
    loadRecord: () => Promise.resolve(record),
    markExistingReady: () => Promise.resolve(true),
    markFailed: ({ errorMessage, expectedJobDescriptionId, runId }) => {
      if (
        record.jobDescriptionId !== expectedJobDescriptionId ||
        (runId !== undefined && record.resumeReviewRunId !== runId)
      ) {
        return Promise.resolve(false);
      }
      record.resumeReviewError = errorMessage;
      record.resumeReviewStatus = "failed";
      record.resumeScreeningError = errorMessage;
      record.resumeScreeningStatus = "failed";
      return Promise.resolve(true);
    },
    markProcessing: ({ expectedJobDescriptionId, runId }) => {
      if (
        record.jobDescriptionId !== expectedJobDescriptionId ||
        record.resumeReviewRunId !== runId
      ) {
        return Promise.resolve(false);
      }
      record.resumeReviewStatus = "processing";
      record.resumeScreeningStatus = "processing";
      return Promise.resolve(true);
    },
    markReady: ({ assessment, expectedJobDescriptionId, runId }) => {
      if (
        record.jobDescriptionId !== expectedJobDescriptionId ||
        record.resumeReviewRunId !== runId
      ) {
        return Promise.resolve(false);
      }
      if (assessment.mode === "legacy") {
        record.resumeReview = assessment.resumeReview;
        record.resumeScreeningResult = assessment.screeningResult;
        record.resumeScreeningStatus = "ready";
      }
      record.resumeReviewStatus = "ready";
      return Promise.resolve(true);
    },
  };
  return { deps, record };
}

const RUN_INPUT = {
  expectedJobDescriptionId: "jd-1",
  expectedRunId: "run-1",
  force: true,
  organizationId: "org-1",
  resumeRecordId: "resume-1",
};

describe("runResumeAssessmentLifecycle", () => {
  it("reuses the persisted run identity and queued date", async () => {
    const { deps, record } = createStore();
    let generationInput: Parameters<ResumeAssessmentLifecycleDeps["generate"]>[0] | undefined;
    deps.generate = (input) => {
      generationInput = input;
      return Promise.resolve(GENERATED);
    };

    await expect(runResumeAssessmentLifecycle(RUN_INPUT, deps)).resolves.toEqual({
      status: "ready",
    });
    expect(generationInput).toMatchObject({
      evaluationAsOf: "2026-07-29",
      runId: "run-1",
    });
    expect(record.resumeReview).toEqual(NEW_REVIEW);
    expect(record.resumeScreeningResult).toEqual(NEW_SCREENING);
  });

  it("keeps the invalidated artifact absent when generation fails", async () => {
    const { deps, record } = createStore({
      resumeReview: null,
      resumeScreeningResult: null,
    });
    deps.generate = () => Promise.reject(new Error("model unavailable"));

    await expect(runResumeAssessmentLifecycle(RUN_INPUT, deps)).rejects.toThrow(
      "model unavailable",
    );
    expect(record.resumeReview).toBeNull();
    expect(record.resumeReviewStatus).toBe("failed");
  });

  it("treats a legacy artifact as current after its job upgrades", async () => {
    const { deps } = createStore({
      evaluationMode: "structured",
      resumeEvaluationArtifactMode: "legacy",
      resumeEvaluationAttemptMode: null,
    });

    await expect(
      runResumeAssessmentLifecycle({ ...RUN_INPUT, force: false }, deps),
    ).resolves.toEqual({ reason: "already_ready", status: "skipped" });
  });

  it("rejects a stale job binding before generation", async () => {
    const { deps } = createStore({ jobDescriptionId: "jd-new" });
    const result = await runResumeAssessmentLifecycle(RUN_INPUT, deps);
    expect(result).toEqual({
      reason: "stale_job_description",
      status: "skipped",
    });
  });

  it("rejects a superseded run before generation", async () => {
    const { deps } = createStore({ resumeReviewRunId: "run-new" });
    const result = await runResumeAssessmentLifecycle(RUN_INPUT, deps);
    expect(result).toEqual({ reason: "superseded", status: "skipped" });
  });

  it("discards completion after evidence changes during generation", async () => {
    const { deps, record } = createStore({ resumeReview: null });
    deps.generate = () => {
      record.resumeReviewRunId = "replacement-run";
      return Promise.resolve(GENERATED);
    };
    const result = await runResumeAssessmentLifecycle(RUN_INPUT, deps);
    expect(result).toEqual({ reason: "superseded", status: "skipped" });
    expect(record.resumeReview).toBeNull();
  });

  it("rejects an assessment generated for a different job evaluation mode", async () => {
    const { deps, record } = createStore({
      evaluationMode: "structured",
      resumeEvaluationAttemptMode: "structured",
      resumeReview: null,
      structuredResumeEvaluation: null,
    });

    await expect(runResumeAssessmentLifecycle(RUN_INPUT, deps)).rejects.toThrow(
      "评估结果模式与本次评估模式不一致",
    );
    expect(record.resumeReview).toBeNull();
    expect(record.resumeReviewStatus).toBe("failed");
  });
});
