import { describe, expect, it } from "vitest";
import { isCollectorLeaseExpired, isIdleHumanTranscriptionRun } from "../human-transcription-state";
import { buildHumanTranscriptionStopPatch } from "../human-transcription-stop";

const idleRun = {
  dispatchId: null,
  endedAt: null,
  error: null,
  executionId: null,
  status: "pending",
};

describe("isIdleHumanTranscriptionRun", () => {
  it("recognizes a collector that left because nobody could be captured", () => {
    expect(isIdleHumanTranscriptionRun(idleRun)).toBe(true);
  });

  it("keeps lost collectors and dispatched runs out of the idle state", () => {
    expect(isIdleHumanTranscriptionRun({ ...idleRun, error: "实时采集曾中断，需录音补救" })).toBe(
      false,
    );
    expect(isIdleHumanTranscriptionRun({ ...idleRun, dispatchId: "dispatch-1" })).toBe(false);
    expect(isIdleHumanTranscriptionRun({ ...idleRun, executionId: "execution-1" })).toBe(false);
    expect(isIdleHumanTranscriptionRun({ ...idleRun, status: "capturing" })).toBe(false);
    expect(isIdleHumanTranscriptionRun({ ...idleRun, endedAt: new Date() })).toBe(false);
  });
});

const unclaimedRun = { cutoffAt: null, drainedAt: null, endedAt: null, executionId: null };

describe("buildHumanTranscriptionStopPatch", () => {
  it("marks an unclaimed run drained so it can publish without a timeout error", () => {
    const now = new Date("2026-10-16T02:00:00.000Z");
    expect(buildHumanTranscriptionStopPatch(unclaimedRun, now)).toEqual({
      cutoffAt: now,
      drainedAt: now,
      endedAt: now,
      status: "finalizing",
    });
  });

  it("leaves draining to an active collector", () => {
    const now = new Date("2026-10-16T02:00:00.000Z");
    expect(
      buildHumanTranscriptionStopPatch({ ...unclaimedRun, executionId: "execution-1" }, now),
    ).toEqual({ endedAt: now, status: "finalizing" });
  });
});

describe("isCollectorLeaseExpired", () => {
  const now = new Date("2026-10-19T06:42:00.000Z");
  const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it("tolerates LiveKit re-dispatch and dispatch delays before declaring a collector lost", () => {
    // LiveKit needs ~15s to notice a lost agent and dispatches can lag further.
    expect(isCollectorLeaseExpired(secondsAgo(45), now)).toBe(false);
    expect(isCollectorLeaseExpired(secondsAgo(61), now)).toBe(true);
  });

  it("treats a collector that never reported as expired", () => {
    expect(isCollectorLeaseExpired(null, now)).toBe(true);
  });
});
