import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLaunchAiInterviewRound,
  isStructuredEvaluationConfirmationValid,
  LaunchAiInterviewMutationError,
} from "../launch-ai-interview-round";

const schedule = { id: "round_1", roundLabel: "AI 面试" };

const deps = {
  buildSchedule: vi.fn<() => typeof schedule | null>(() => schedule),
  clock: { now: vi.fn(() => new Date("2026-07-12T00:00:00.000Z")) },
  idGenerator: { next: vi.fn() },
  invalidateCache: vi.fn(),
  persist: vi.fn(),
};

const command = {
  actorId: "user_1",
  interviewRecordId: "record_1",
  organizationId: "org_1",
  visibilityScope: { kind: "all" } as const,
};

describe("launchAiInterviewRound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.idGenerator.next
      .mockReturnValueOnce("round_1")
      .mockReturnValueOnce("decision_audit_1")
      .mockReturnValueOnce("launch_audit_1");
    deps.persist.mockResolvedValue({ ok: true, roundId: "round_1" });
  });

  it("delegates all durable work to one persistence boundary", async () => {
    const result = await createLaunchAiInterviewRound(deps)(command);

    expect(result).toEqual({ ok: true, roundId: "round_1" });
    expect(deps.persist).toHaveBeenCalledTimes(1);
    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user_1",
        decisionAuditLogId: "decision_audit_1",
        launchAuditLogId: "launch_audit_1",
        schedule,
      }),
    );
    expect(deps.invalidateCache).toHaveBeenCalledWith("org_1");
  });

  it("returns a locked persistence conflict without invalidating", async () => {
    deps.persist.mockResolvedValue({ ok: false, reason: "stage_conflict" });

    const result = await createLaunchAiInterviewRound(deps)(command);

    expect(result).toEqual({ ok: false, reason: "stage_conflict" });
    expect(deps.invalidateCache).not.toHaveBeenCalled();
  });

  it("does not enter persistence when a round cannot be prepared", async () => {
    deps.buildSchedule.mockReturnValueOnce(null);

    const result = await createLaunchAiInterviewRound(deps)(command);

    expect(result).toEqual({ ok: false, reason: "round_not_created" });
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("wraps any transactional failure and does not invalidate", async () => {
    deps.persist.mockRejectedValue(new Error("snapshot failed"));

    await expect(createLaunchAiInterviewRound(deps)(command)).rejects.toBeInstanceOf(
      LaunchAiInterviewMutationError,
    );
    expect(deps.invalidateCache).not.toHaveBeenCalled();
  });

  it("requires an exact acknowledgement of the current risky structured evaluation", () => {
    const current = {
      gateStatus: "failed" as const,
      grade: "matched" as const,
      runId: "run-current",
    };

    expect(isStructuredEvaluationConfirmationValid(current, null)).toBe(false);
    expect(
      isStructuredEvaluationConfirmationValid(current, {
        ...current,
        gateStatus: "passed",
      }),
    ).toBe(false);
    expect(isStructuredEvaluationConfirmationValid(current, current)).toBe(true);
    expect(
      isStructuredEvaluationConfirmationValid(
        { ...current, gateStatus: "passed", grade: "matched" },
        null,
      ),
    ).toBe(true);
  });
});
