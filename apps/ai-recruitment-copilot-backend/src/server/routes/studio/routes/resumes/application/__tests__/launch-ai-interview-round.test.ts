import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLaunchAiInterviewRound,
  LaunchAiInterviewMutationError,
} from "../launch-ai-interview-round";

const candidate = {
  jobDescriptionId: "jd_1",
  pipelineStage: "screening" as const,
  resumeParseStatus: "ready" as const,
};

const schedule = { id: "round_1", roundLabel: "AI 面试" };

const deps = {
  buildSchedule: vi.fn(() => schedule),
  clock: { now: vi.fn(() => new Date("2026-07-12T00:00:00.000Z")) },
  commit: vi.fn(),
  createSnapshot: vi.fn(),
  idGenerator: { next: vi.fn() },
  invalidateCache: vi.fn(),
  loadCandidate: vi.fn(),
};

const command = {
  actorId: "user_1",
  interviewQuestions: [],
  interviewRecordId: "record_1",
  organizationId: "org_1",
  visibilityScope: { kind: "all" } as const,
};

describe("launchAiInterviewRound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.loadCandidate.mockResolvedValue(candidate);
    deps.commit.mockImplementation(() => Promise.resolve());
    deps.createSnapshot.mockImplementation(() => Promise.resolve());
    deps.idGenerator.next.mockReturnValueOnce("round_1").mockReturnValueOnce("audit_1");
  });

  it("returns not_found without starting the write workflow", async () => {
    deps.loadCandidate.mockResolvedValue(null);

    const result = await createLaunchAiInterviewRound(deps)(command);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it("rejects a candidate that has already reached a later stage", async () => {
    deps.loadCandidate.mockResolvedValue({ ...candidate, pipelineStage: "human_interview" });

    const result = await createLaunchAiInterviewRound(deps)(command);

    expect(result).toEqual({ ok: false, reason: "stage_conflict" });
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it("commits, snapshots, then invalidates after a successful launch", async () => {
    const calls: string[] = [];
    deps.commit.mockImplementation(() => {
      calls.push("commit");
      return Promise.resolve();
    });
    deps.createSnapshot.mockImplementation(() => {
      calls.push("snapshot");
      return Promise.resolve();
    });
    deps.invalidateCache.mockImplementation(() => calls.push("invalidate"));

    const result = await createLaunchAiInterviewRound(deps)(command);

    expect(result).toEqual({ ok: true, roundId: "round_1" });
    expect(calls).toEqual(["commit", "snapshot", "invalidate"]);
    expect(deps.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user_1",
        auditLogId: "audit_1",
        interviewRecordId: "record_1",
        jobDescriptionId: "jd_1",
        organizationId: "org_1",
        schedule,
      }),
    );
  });

  it("does not invalidate when the post-commit snapshot fails", async () => {
    deps.createSnapshot.mockRejectedValue(new Error("snapshot failed"));

    await expect(createLaunchAiInterviewRound(deps)(command)).rejects.toBeInstanceOf(
      LaunchAiInterviewMutationError,
    );
    expect(deps.invalidateCache).not.toHaveBeenCalled();
  });
});
