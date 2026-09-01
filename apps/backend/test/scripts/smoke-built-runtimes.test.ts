/* oxlint-disable unicorn/prefer-event-target -- ChildProcess is an EventEmitter; the test double must preserve once(child, "exit") semantics. */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { SmokeChild } from "../../scripts/smoke-built-runtimes.mjs";
import { stop, waitForCompletedJob } from "../../scripts/smoke-built-runtimes.mjs";

class ChildStub extends EventEmitter implements SmokeChild {
  exitCode: number | null = null;
  readonly signals: NodeJS.Signals[] = [];
  exitOnTerminate = true;

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    if (signal === "SIGKILL" || this.exitOnTerminate) {
      this.exitCode = signal === "SIGKILL" ? 137 : 0;
      queueMicrotask(() => this.emit("exit", this.exitCode, signal));
    }
    return true;
  }
}

describe("built runtime smoke helpers", () => {
  it("accepts a graceful SIGTERM shutdown", async () => {
    const child = new ChildStub();

    await stop(child, () => "logs", 10);

    expect(child.signals).toEqual(["SIGTERM"]);
  });

  it("fails explicitly after killing a runtime that ignores SIGTERM", async () => {
    const child = new ChildStub();
    child.exitOnTerminate = false;

    await expect(stop(child, () => "last runtime logs", 1)).rejects.toThrow("required SIGKILL");
    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("returns only after the worker marks the smoke job completed", async () => {
    const child = new ChildStub();
    const job = {
      getState: vi.fn(async () => "completed"),
      remove: vi.fn(async () => {}),
    };
    const queue = { getJob: vi.fn(async () => job) };

    await expect(
      waitForCompletedJob({
        child,
        jobId: "meeting-answer-runtime-smoke",
        output: () => "logs",
        pollMs: 1,
        queue,
        timeoutMs: 10,
      }),
    ).resolves.toBe(job);
    expect(queue.getJob).toHaveBeenCalledWith("meeting-answer-runtime-smoke");
  });

  it("surfaces a processor failure with runtime logs", async () => {
    const child = new ChildStub();
    const queue = {
      getJob: vi.fn(async () => ({
        failedReason: "database unavailable",
        getState: vi.fn(async () => "failed"),
        remove: vi.fn(async () => {}),
      })),
    };

    await expect(
      waitForCompletedJob({
        child,
        jobId: "meeting-answer-runtime-smoke",
        output: () => "captured backend logs",
        pollMs: 1,
        queue,
        timeoutMs: 10,
      }),
    ).rejects.toThrow("database unavailable");
  });
});
