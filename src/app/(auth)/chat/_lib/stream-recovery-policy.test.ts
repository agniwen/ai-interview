import { describe, expect, it } from "vitest";
import {
  getStreamRecoveryDecision,
  getStreamRecoveryDelayMs,
  shouldScheduleStallRecovery,
  STREAM_RECOVERY_MIN_INTERVAL_MS,
  STREAM_RECOVERY_STALL_MS,
} from "./stream-recovery-policy";

describe("getStreamRecoveryDecision", () => {
  const baseOptions = {
    hasAssistantRenderableContent: false,
    inFlightStartedAt: null as number | null,
    lastRecoveryAt: 0,
    now: 1_000_000,
  };

  it("returns 'none' when within min interval", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        lastRecoveryAt: 1_000_000 - 1000,
        status: "error",
      }),
    ).toBe("none");
  });

  it("returns 'retry' on error status after min interval", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        lastRecoveryAt: 1_000_000 - STREAM_RECOVERY_MIN_INTERVAL_MS - 1,
        status: "error",
      }),
    ).toBe("retry");
  });

  it("returns 'retry' on visibility recovery + ready status", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        isVisibilityRecovery: true,
        status: "ready",
      }),
    ).toBe("retry");
  });

  it("returns 'none' on ready status without visibility recovery", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        status: "ready",
      }),
    ).toBe("none");
  });

  it("returns 'none' on submitted with renderable content (stream is progressing)", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        hasAssistantRenderableContent: true,
        inFlightStartedAt: 1_000_000 - STREAM_RECOVERY_STALL_MS - 1,
        status: "submitted",
      }),
    ).toBe("none");
  });

  it("returns 'none' on submitted within stall threshold", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        inFlightStartedAt: 1_000_000 - 1000,
        status: "submitted",
      }),
    ).toBe("none");
  });

  it("returns 'retry' on submitted past stall threshold without content", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        inFlightStartedAt: 1_000_000 - STREAM_RECOVERY_STALL_MS - 1,
        status: "submitted",
      }),
    ).toBe("retry");
  });

  it("returns 'none' on submitted with null inFlightStartedAt", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        inFlightStartedAt: null,
        status: "submitted",
      }),
    ).toBe("none");
  });

  it("returns 'none' on streaming (already receiving content)", () => {
    expect(
      getStreamRecoveryDecision({
        ...baseOptions,
        status: "streaming",
      }),
    ).toBe("none");
  });
});

describe("shouldScheduleStallRecovery", () => {
  it("schedules when in flight with no content and visible", () => {
    expect(
      shouldScheduleStallRecovery({
        hasAssistantRenderableContent: false,
        isChatInFlight: true,
        isDocumentVisible: true,
      }),
    ).toBe(true);
  });

  it("does not schedule when not in flight", () => {
    expect(
      shouldScheduleStallRecovery({
        hasAssistantRenderableContent: false,
        isChatInFlight: false,
        isDocumentVisible: true,
      }),
    ).toBe(false);
  });

  it("does not schedule when content is already rendered", () => {
    expect(
      shouldScheduleStallRecovery({
        hasAssistantRenderableContent: true,
        isChatInFlight: true,
        isDocumentVisible: true,
      }),
    ).toBe(false);
  });

  it("does not schedule when document is hidden", () => {
    expect(
      shouldScheduleStallRecovery({
        hasAssistantRenderableContent: false,
        isChatInFlight: true,
        isDocumentVisible: false,
      }),
    ).toBe(false);
  });
});

describe("getStreamRecoveryDelayMs", () => {
  it("returns full stall window when never started", () => {
    expect(
      getStreamRecoveryDelayMs({
        inFlightStartedAt: null,
        now: 1_000_000,
      }),
    ).toBe(STREAM_RECOVERY_STALL_MS);
  });

  it("returns remaining time when partially elapsed", () => {
    const now = 1_000_000;
    const elapsed = 1500;
    expect(
      getStreamRecoveryDelayMs({
        inFlightStartedAt: now - elapsed,
        now,
      }),
    ).toBe(STREAM_RECOVERY_STALL_MS - elapsed);
  });

  it("returns 0 when stall threshold already passed", () => {
    const now = 1_000_000;
    expect(
      getStreamRecoveryDelayMs({
        inFlightStartedAt: now - STREAM_RECOVERY_STALL_MS - 5000,
        now,
      }),
    ).toBe(0);
  });
});
