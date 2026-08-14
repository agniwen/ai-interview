import { describe, expect, it, vi } from "vitest";
import { retryFailedResumeParse } from "./retry";

const INPUT = {
  organizationId: "org-1",
  requestedBy: "request-user-1",
  resumeRecordId: "resume-1",
};

describe("retryFailedResumeParse", () => {
  it("claims the failed item and enqueues exactly one parse job", async () => {
    const enqueue = vi.fn().mockImplementation(async () => {});
    const rollback = vi.fn();
    const job = {
      batchId: "batch-1",
      itemId: "item-1",
      organizationId: "org-1",
      userId: "user-1",
    };

    const result = await retryFailedResumeParse(INPUT, {
      claim: vi.fn().mockResolvedValue({
        errorMessage: "解析失败",
        job,
        status: "claimed",
      }),
      enqueue,
      isQueueConfigured: () => true,
      rollback,
    });

    expect(result).toEqual({ status: "queued" });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith([job]);
    expect(rollback).not.toHaveBeenCalled();
  });

  it("rolls the database state back when enqueue fails", async () => {
    const rollback = vi.fn().mockImplementation(async () => {});
    const job = {
      batchId: "batch-1",
      itemId: "item-1",
      organizationId: "org-1",
      userId: "user-1",
    };

    await expect(
      retryFailedResumeParse(INPUT, {
        claim: vi.fn().mockResolvedValue({
          errorMessage: "解析失败",
          job,
          status: "claimed",
        }),
        enqueue: vi.fn().mockRejectedValue(new Error("redis unavailable")),
        isQueueConfigured: () => true,
        rollback,
      }),
    ).rejects.toThrow("简历解析队列入队失败");

    expect(rollback).toHaveBeenCalledWith({
      errorMessage: "解析失败",
      job,
      target: INPUT,
    });
  });

  it("does not enqueue an already retried item", async () => {
    const enqueue = vi.fn();

    const result = await retryFailedResumeParse(INPUT, {
      claim: vi.fn().mockResolvedValue({ status: "retry_exhausted" }),
      enqueue,
      isQueueConfigured: () => true,
      rollback: vi.fn(),
    });

    expect(result).toEqual({ status: "retry_exhausted" });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
