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
  it("stays off when neither notifications nor Feishu meeting sync is enabled", () => {
    vi.stubEnv("FEISHU_HUMAN_INTERVIEW_ENABLED", "false");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "false");
    const scheduler = startInterviewNotificationScheduler({
      claimEvents: vi.fn(async () => []),
      processEvent: vi.fn(async () => undefined),
    });
    expect(scheduler).toBeNull();
    expect(getInterviewNotificationSchedulerSnapshot().enabled).toBe(false);
  });

  it("runs only cancelled calendar retries when Feishu meetings are enabled", async () => {
    vi.useFakeTimers();
    vi.stubEnv("FEISHU_HUMAN_INTERVIEW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "false");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "false");
    const claimEvents = vi.fn(async () => []);
    const retryCancelledHumanInterviewCalendars = vi.fn(async () => undefined);
    const scheduler = startInterviewNotificationScheduler({
      claimEvents,
      processEvent: vi.fn(async () => undefined),
      retryCancelledHumanInterviewCalendars,
    });

    expect(scheduler).not.toBeNull();
    await scheduler!.runOnce();
    expect(retryCancelledHumanInterviewCalendars).toHaveBeenCalledTimes(1);
    expect(claimEvents).not.toHaveBeenCalled();
    await scheduler!.close();
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

  it("reconciles human interview attendance before claiming notifications", async () => {
    vi.useFakeTimers();
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "true");
    const calls: string[] = [];
    const scheduler = startInterviewNotificationScheduler({
      claimEvents: vi.fn(async () => {
        calls.push("claim");
        return [];
      }),
      processEvent: vi.fn(async () => undefined),
      reconcileHumanInterviewAttendance: vi.fn(async () => {
        calls.push("reconcile");
      }),
    });
    await scheduler!.runOnce();
    expect(calls).toEqual(["reconcile", "claim"]);
    await scheduler!.close();
  });

  it("retries cancelled Feishu calendars before claiming notifications", async () => {
    vi.useFakeTimers();
    vi.stubEnv("FEISHU_HUMAN_INTERVIEW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "true");
    const calls: string[] = [];
    const scheduler = startInterviewNotificationScheduler({
      claimEvents: vi.fn(async () => {
        calls.push("claim");
        return [];
      }),
      processEvent: vi.fn(async () => undefined),
      retryCancelledHumanInterviewCalendars: vi.fn(async () => {
        calls.push("retry-cancelled-calendar");
      }),
    });

    await scheduler!.runOnce();

    expect(calls).toEqual(["retry-cancelled-calendar", "claim"]);
    await scheduler!.close();
  });

  it("continues delivering notifications when cancelled calendar retry fails", async () => {
    vi.useFakeTimers();
    vi.stubEnv("FEISHU_HUMAN_INTERVIEW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "true");
    // SAFETY: The scheduler treats this fixture opaquely and forwards it unchanged to processEvent.
    const event = { id: "queued-after-calendar-retry-failure" } as InterviewNotificationEventRecord;
    const claimEvents = vi
      .fn<InterviewNotificationSchedulerDependencies["claimEvents"]>()
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([]);
    const processEvent = vi.fn(async () => undefined);
    const scheduler = startInterviewNotificationScheduler({
      claimEvents,
      processEvent,
      retryCancelledHumanInterviewCalendars: vi.fn(async () => {
        throw new Error("temporary Feishu failure");
      }),
    });

    await scheduler!.runOnce();

    expect(processEvent).toHaveBeenCalledWith(event, expect.any(String));
    await scheduler!.close();
  });

  it("continues delivering queued notifications when attendance reconciliation fails", async () => {
    vi.useFakeTimers();
    vi.stubEnv("INTERVIEW_NOTIFICATION_FLOW_ENABLED", "true");
    vi.stubEnv("INTERVIEW_NOTIFICATION_WORKER_ENABLED", "true");
    // SAFETY: The scheduler treats this fixture opaquely and forwards it unchanged to processEvent.
    const event = { id: "queued-after-reconciliation-failure" } as InterviewNotificationEventRecord;
    const claimEvents = vi
      .fn<InterviewNotificationSchedulerDependencies["claimEvents"]>()
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([]);
    const processEvent = vi.fn(async () => undefined);
    const scheduler = startInterviewNotificationScheduler({
      claimEvents,
      processEvent,
      reconcileHumanInterviewAttendance: vi.fn(async () => {
        throw new Error("temporary reconciliation failure");
      }),
    });

    await scheduler!.runOnce();

    expect(processEvent).toHaveBeenCalledWith(event, expect.any(String));
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
