import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailIngestScheduler } from "./scheduler";
import type { MailIngestConfig } from "./config";

const config: MailIngestConfig = {
  enabled: true,
  intervalMs: 15 * 60 * 1000,
  maxAccountsPerRun: 20,
  maxMessagesPerAccount: 20,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("mail ingest scheduler", () => {
  it("runs immediately and postpones the next scheduled poll by 15 minutes", async () => {
    vi.useFakeTimers();
    const runMailIngestOnce = vi.fn().mockResolvedValue({ accounts: 1 });
    const scheduler = createMailIngestScheduler(config, runMailIngestOnce);
    await vi.advanceTimersByTimeAsync(0);
    expect(runMailIngestOnce).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await scheduler.runNow({ organizationId: "org_1" });
    expect(runMailIngestOnce).toHaveBeenLastCalledWith(config, { organizationId: "org_1" });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(runMailIngestOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(runMailIngestOnce).toHaveBeenCalledTimes(3);

    await scheduler.close();
  });

  it("runs a requested workspace after an in-flight automatic poll", async () => {
    vi.useFakeTimers();
    const { promise: automaticRun, resolve: finishAutomatic } = Promise.withResolvers<{
      accounts: number;
    }>();
    const runMailIngestOnce = vi
      .fn()
      .mockReturnValueOnce(automaticRun)
      .mockResolvedValue({ accounts: 1 });
    const scheduler = createMailIngestScheduler(config, runMailIngestOnce);
    await vi.advanceTimersByTimeAsync(0);

    const manualRun = scheduler.runNow({ organizationId: "org_1" });
    expect(runMailIngestOnce).toHaveBeenCalledTimes(1);

    finishAutomatic({ accounts: 1 });
    await manualRun;
    expect(runMailIngestOnce).toHaveBeenCalledTimes(2);
    expect(runMailIngestOnce).toHaveBeenLastCalledWith(config, { organizationId: "org_1" });

    await scheduler.close();
  });

  it("schedules the next poll 15 minutes after the manual trigger time", async () => {
    vi.useFakeTimers();
    const { promise: manualResult, resolve: finishManual } = Promise.withResolvers<{
      accounts: number;
    }>();
    const runMailIngestOnce = vi
      .fn()
      .mockResolvedValueOnce({ accounts: 1 })
      .mockReturnValueOnce(manualResult)
      .mockResolvedValue({ accounts: 1 });
    const scheduler = createMailIngestScheduler(config, runMailIngestOnce);
    await vi.advanceTimersByTimeAsync(0);

    const manualRun = scheduler.runNow({ organizationId: "org_1" });
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    finishManual({ accounts: 1 });
    await manualRun;

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 - 1);
    expect(runMailIngestOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailIngestOnce).toHaveBeenCalledTimes(3);

    await scheduler.close();
  });

  it("drains the active mailbox poll when closing", async () => {
    vi.useFakeTimers();
    const { promise, resolve } = Promise.withResolvers<{
      accounts: number;
      messagesFailed: number;
      messagesQueued: number;
      messagesSkipped: number;
    }>();
    const scheduler = createMailIngestScheduler(
      config,
      vi.fn(() => promise),
    );
    await vi.advanceTimersByTimeAsync(0);

    let closed = false;
    const closing = scheduler.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    resolve({ accounts: 1, messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 });
    await closing;
    expect(closed).toBe(true);
  });

  it("does not start another scan after closing", async () => {
    vi.useFakeTimers();
    const runMailIngestOnce = vi.fn().mockResolvedValue({
      accounts: 0,
      messagesFailed: 0,
      messagesQueued: 0,
      messagesSkipped: 0,
    });
    const scheduler = createMailIngestScheduler(config, runMailIngestOnce);
    await scheduler.close();

    await scheduler.runNow({ organizationId: "org_1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(runMailIngestOnce).not.toHaveBeenCalled();
  });
});
