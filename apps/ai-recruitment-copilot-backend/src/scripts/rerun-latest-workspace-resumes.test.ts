import { describe, expect, it } from "vitest";
import {
  buildRerunExecutionPlan,
  buildTargetFingerprint,
  parseRerunLatestWorkspaceResumesOptions,
  shouldRetryEvaluation,
} from "./rerun-latest-workspace-resumes";

describe("latest workspace resume rerun", () => {
  it("defaults to a dry run and requires a fingerprint for apply mode", () => {
    expect(parseRerunLatestWorkspaceResumesOptions([])).toEqual({
      apply: false,
      expectedFingerprint: null,
      outputPath: null,
      retryFailedEvaluations: false,
    });
    expect(() => parseRerunLatestWorkspaceResumesOptions(["--apply"])).toThrow(
      "--expected-fingerprint",
    );
    expect(
      parseRerunLatestWorkspaceResumesOptions([
        "--apply",
        `--expected-fingerprint=${"a".repeat(64)}`,
        "--output=/tmp/report.json",
      ]),
    ).toEqual({
      apply: true,
      expectedFingerprint: "a".repeat(64),
      outputPath: "/tmp/report.json",
      retryFailedEvaluations: false,
    });
  });

  it("only allows failed-evaluation recovery in guarded apply mode", () => {
    expect(() => parseRerunLatestWorkspaceResumesOptions(["--retry-failed-evaluations"])).toThrow(
      "--apply",
    );
    expect(
      parseRerunLatestWorkspaceResumesOptions([
        "--apply",
        "--retry-failed-evaluations",
        `--expected-fingerprint=${"b".repeat(64)}`,
      ]),
    ).toMatchObject({ apply: true, retryFailedEvaluations: true });
  });

  it("selects only failed or incomplete evaluations for recovery", () => {
    expect(
      shouldRetryEvaluation({
        resumeReviewError: null,
        resumeReviewStatus: "ready",
        structuredResumeEvaluation: {},
      }),
    ).toBe(false);
    expect(
      shouldRetryEvaluation({
        resumeReviewError: "invalid output",
        resumeReviewStatus: "failed",
        structuredResumeEvaluation: null,
      }),
    ).toBe(true);
    expect(
      shouldRetryEvaluation({
        resumeReviewError: null,
        resumeReviewStatus: "ready",
        structuredResumeEvaluation: null,
      }),
    ).toBe(true);
  });

  it("plans full reruns and failed-evaluation recovery without reprocessing successful PDFs", () => {
    const snapshots = [
      {
        resumeReviewError: null,
        resumeReviewStatus: "ready",
        structuredResumeEvaluation: {},
      },
      {
        resumeReviewError: "invalid output",
        resumeReviewStatus: "failed",
        structuredResumeEvaluation: null,
      },
    ];

    expect(buildRerunExecutionPlan(false, snapshots)).toEqual([
      { evaluate: true, reparse: true },
      { evaluate: true, reparse: true },
    ]);
    expect(buildRerunExecutionPlan(true, snapshots)).toEqual([
      { evaluate: false, reparse: false },
      { evaluate: true, reparse: false },
    ]);
  });

  it("rejects malformed and unknown arguments", () => {
    expect(() => parseRerunLatestWorkspaceResumesOptions(["--expected-fingerprint=bad"])).toThrow(
      "64 位",
    );
    expect(() => parseRerunLatestWorkspaceResumesOptions(["--limit=9"])).toThrow("未知参数");
  });

  it("builds a stable fingerprint that changes with target identity", () => {
    const targets = [
      {
        createdAt: new Date("2026-08-21T01:00:00.000Z"),
        id: "resume-1",
        jobDescriptionId: "job-1",
      },
      {
        createdAt: new Date("2026-08-21T00:00:00.000Z"),
        id: "resume-2",
        jobDescriptionId: "job-2",
      },
    ];
    const fingerprint = buildTargetFingerprint(targets);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(buildTargetFingerprint(targets)).toBe(fingerprint);
    expect(buildTargetFingerprint([{ ...targets[0], id: "resume-3" }, targets[1]])).not.toBe(
      fingerprint,
    );
  });
});
