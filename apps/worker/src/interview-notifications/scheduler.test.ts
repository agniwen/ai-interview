/* oxlint-disable avoid-new, no-non-null-assertion, no-useless-undefined, require-await -- Controlled promises and assertions model scheduler overlap. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterviewNotificationEventRecord } from "./dao";
import type { InterviewNotificationSchedulerDependencies } from "./scheduler";
import {
  getInterviewNotificationSchedulerSnapshot,
  startInterviewNotificationScheduler,
} from "./scheduler";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("interview notification scheduler", () => {
  it("stays off unless the dedicated feature flag is enabled", () => {
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "false");
    const scheduler = startInterviewNotificationScheduler({
      claimEvents: vi.fn(async () => []),
      processEvent: vi.fn(async () => undefined),
    });
    expect(scheduler).toBeNull();
    expect(getInterviewNotificationSchedulerSnapshot().enabled).toBe(false);
  });

  it("does not overlap polling runs", async () => {
    vi.useFakeTimers();
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "true");
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const claimEvents = vi.fn(async () => {
      await blocked;
      return [];
    });
    const dependencies = {
      claimEvents,
      processEvent: vi.fn(async () => undefined),
    } satisfies InterviewNotificationSchedulerDependencies;
    const scheduler = startInterviewNotificationScheduler(dependencies);
    expect(scheduler).not.toBeNull();
    const first = scheduler!.runOnce();
    const second = scheduler!.runOnce();
    release?.();
    await Promise.all([first, second]);
    expect(claimEvents).toHaveBeenCalledTimes(1);
    expect(claimEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseDurationMs: 120_000,
        limit: 1,
      }),
    );
    await scheduler!.close();
  });

  it("drains the active poll when closing", async () => {
    vi.useFakeTimers();
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "true");
    const { promise, resolve } = Promise.withResolvers<InterviewNotificationEventRecord[]>();
    const scheduler = startInterviewNotificationScheduler({
      claimEvents: vi.fn(() => promise),
      processEvent: vi.fn(async () => undefined),
    });
    await vi.advanceTimersByTimeAsync(0);

    let closed = false;
    const closing = scheduler!.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    resolve([]);
    await closing;
    expect(closed).toBe(true);
  });
});
