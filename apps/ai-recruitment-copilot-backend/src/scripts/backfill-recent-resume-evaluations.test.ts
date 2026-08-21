import { describe, expect, it } from "vitest";
import {
  BATCH_SIZE,
  buildChinaDateWindow,
  chunkResumeTargets,
  classifyRecentResumeTarget,
  parseBackfillRecentResumeOptions,
} from "./backfill-recent-resume-evaluations";
import type { RecentResumeRow } from "./backfill-recent-resume-evaluations";

function row(overrides: Partial<RecentResumeRow> = {}): RecentResumeRow {
  return {
    candidateName: "候选人",
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    deductionRuleSetVersion: 1,
    evaluationBlueprint: {},
    evaluationBlueprintHash: "blueprint-hash",
    evaluationMode: "structured" as const,
    id: "resume-1",
    jobDescriptionId: "job-1",
    jobDescriptionName: "岗位",
    lifecycleStatus: "published" as const,
    resumeContentHash: "resume-content-hash",
    resumeParseStatus: "ready",
    resumeProfile: {
      age: null,
      email: null,
      gender: null,
      name: "候选人",
      personalStrengths: [],
      phone: null,
      projectExperiences: [],
      schools: [],
      skills: [],
      targetRoles: [],
      workExperiences: [],
      workYears: null,
    },
    resumeReviewQueuedAt: null,
    resumeReviewRunId: null,
    resumeReviewStatus: "ready",
    resumeText: "候选人简历正文",
    structuredConfig: {},
    structuredResumeEvaluation: null,
    ...overrides,
  };
}

describe("recent resume evaluation backfill", () => {
  it("defaults to a 500-row dry run and validates options", () => {
    const parsed = parseBackfillRecentResumeOptions([]);
    expect(parsed.apply).toBe(false);
    expect(parsed.concurrency).toBe(12);
    expect(parsed.limit).toBe(500);
    expect(parsed.campaign).toMatch(/^recent-resume-rescore-\d{8}$/);
    expect(
      parseBackfillRecentResumeOptions([
        "--apply",
        "--as-of=2026-08-19T09:38:20.978Z",
        "--campaign=job-upgrade-rescore-20260820",
        "--concurrency=3",
        "--job-id=job-1",
        "--limit=12",
        "--resume-id=resume-1",
      ]),
    ).toEqual({
      apply: true,
      asOf: "2026-08-19T09:38:20.978Z",
      campaign: "job-upgrade-rescore-20260820",
      concurrency: 3,
      jobId: "job-1",
      limit: 12,
      resumeId: "resume-1",
    });
    expect(() => parseBackfillRecentResumeOptions(["--limit=501"])).toThrow("1 到 500");
    expect(() => parseBackfillRecentResumeOptions(["--concurrency=25"])).toThrow("1 到 24");
    expect(() => parseBackfillRecentResumeOptions(["--campaign=不合法"])).toThrow("--campaign");
    expect(() => parseBackfillRecentResumeOptions(["--as-of=not-a-date"])).toThrow("--as-of");
    expect(parseBackfillRecentResumeOptions(["--date=2026-08-20"]).date).toBe("2026-08-20");
    expect(() => parseBackfillRecentResumeOptions(["--date=2026-02-30"])).toThrow("--date");
    expect(() =>
      parseBackfillRecentResumeOptions(["--date=2026-08-20", "--as-of=2026-08-20T00:00:00.000Z"]),
    ).toThrow("不能同时使用");
  });

  it("uses the exact Beijing calendar-day boundary", () => {
    const window = buildChinaDateWindow("2026-08-21");
    expect(window.from.toISOString()).toBe("2026-08-20T16:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-08-21T16:00:00.000Z");
  });

  it("chunks targets into batches of twelve", () => {
    const batches = chunkResumeTargets(Array.from({ length: 25 }, (_, index) => index));
    expect(BATCH_SIZE).toBe(12);
    expect(batches.map((batch) => batch.length)).toEqual([12, 12, 1]);
  });

  it("skips unbound, legacy, unparsed, and busy records", () => {
    expect(classifyRecentResumeTarget(row({ jobDescriptionId: null }), "campaign")).toEqual({
      reason: "unbound",
      status: "skip",
    });
    expect(classifyRecentResumeTarget(row({ evaluationMode: "legacy" }), "campaign")).toEqual({
      reason: "job_not_current",
      status: "skip",
    });
    expect(classifyRecentResumeTarget(row({ resumeProfile: null }), "campaign")).toEqual({
      reason: "resume_not_ready",
      status: "skip",
    });
    expect(
      classifyRecentResumeTarget(row({ resumeReviewStatus: "processing" }), "campaign"),
    ).toEqual({ reason: "busy", status: "skip" });
  });
});
