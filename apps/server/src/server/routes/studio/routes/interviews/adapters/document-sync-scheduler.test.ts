import { afterEach, describe, expect, it, vi } from "vitest";
import { startHumanInterviewDocumentSyncScheduler } from "./document-sync-scheduler";
afterEach(() => vi.useRealTimers());
describe("human evaluation document scheduler", () => {
  it("recovers pending work at startup without an HTTP request or manual poll", async () => {
    const processOne = vi.fn(() => Promise.resolve(false));
    const scheduler = startHumanInterviewDocumentSyncScheduler(processOne);
    try {
      await vi.waitFor(() => expect(processOne).toHaveBeenCalledTimes(1));
    } finally {
      await scheduler.close();
    }
  });

  it("polls durable work and stops on shutdown", async () => {
    vi.useFakeTimers();
    const processOne = vi.fn(() => Promise.resolve(false));
    const scheduler = startHumanInterviewDocumentSyncScheduler(processOne);
    await scheduler.runOnce();
    expect(processOne).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(processOne).toHaveBeenCalledTimes(2);
    await scheduler.close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(processOne).toHaveBeenCalledTimes(2);
  });
  it("does not overlap a slow document update", async () => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers<boolean>();
    const processOne = vi.fn(() => pending.promise);
    const scheduler = startHumanInterviewDocumentSyncScheduler(processOne);
    const running = scheduler.runOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(processOne).toHaveBeenCalledTimes(1);
    pending.resolve(false);
    await running;
    await scheduler.close();
  });

  it("waits for an active update on shutdown and does not claim another task", async () => {
    const pending = Promise.withResolvers<boolean>();
    const processOne = vi.fn(() => pending.promise);
    const scheduler = startHumanInterviewDocumentSyncScheduler(processOne);
    await vi.waitFor(() => expect(processOne).toHaveBeenCalledTimes(1));
    const closed = vi.fn();
    const closing = scheduler.close().then(closed);
    await Promise.resolve();
    expect(closed).not.toHaveBeenCalled();
    pending.resolve(true);
    await closing;
    expect(closed).toHaveBeenCalledTimes(1);
    expect(processOne).toHaveBeenCalledTimes(1);
  });
});
