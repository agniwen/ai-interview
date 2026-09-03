import { describe, expect, it } from "vitest";
import { bulkResumeBatchRefetchInterval } from "../bulk-resume-batch-query";

describe("bulkResumeBatchRefetchInterval", () => {
  it("does not poll when there are no batches", () => {
    expect(bulkResumeBatchRefetchInterval()).toBe(false);
    expect(bulkResumeBatchRefetchInterval([])).toBe(false);
  });

  it("does not poll when every batch is already finished", () => {
    expect(bulkResumeBatchRefetchInterval([{ status: "completed" }, { status: "cancelled" }])).toBe(
      false,
    );
  });

  it("polls while any batch is still pending or running", () => {
    expect(bulkResumeBatchRefetchInterval([{ status: "pending" }])).toBe(10_000);
    expect(bulkResumeBatchRefetchInterval([{ status: "completed" }, { status: "running" }])).toBe(
      10_000,
    );
  });
});
