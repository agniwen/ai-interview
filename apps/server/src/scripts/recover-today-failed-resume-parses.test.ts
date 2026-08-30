import { describe, expect, it, vi } from "vitest";
import { parseRecoveryOptions, runDirectRecoveryJobs } from "./recover-today-failed-resume-parses";

describe("failed resume parse recovery options", () => {
  it("defaults to a read-only recovery preview", () => {
    expect(parseRecoveryOptions([], "2026-08-21")).toEqual({
      date: "2026-08-21",
      mode: "preview-all",
    });
  });

  it("supports direct pool-only recovery", () => {
    expect(
      parseRecoveryOptions(
        ["--apply", "--direct", "--pool-only", "--date=2026-08-20"],
        "2026-08-21",
      ),
    ).toEqual({
      date: "2026-08-20",
      mode: "direct-pool",
    });
  });

  it("maps every preview and queued scope to an explicit mode", () => {
    expect(parseRecoveryOptions(["--pool-only"], "2026-08-21").mode).toBe("preview-pool");
    expect(parseRecoveryOptions(["--apply"], "2026-08-21").mode).toBe("queue-all");
    expect(parseRecoveryOptions(["--apply", "--pool-only"], "2026-08-21").mode).toBe("queue-pool");
  });

  it("rejects direct execution without apply and invalid dates", () => {
    expect(() => parseRecoveryOptions(["--direct"], "2026-08-21")).toThrow("--apply");
    expect(() => parseRecoveryOptions(["--apply", "--direct"], "2026-08-21")).toThrow(
      "--pool-only",
    );
    expect(() => parseRecoveryOptions(["--date=2026-8-1"], "2026-08-21")).toThrow("YYYY-MM-DD");
  });

  it("runs claimed jobs with cache bypass and treats missing final rows as failures", async () => {
    const processBatchItem = vi
      .fn()
      .mockResolvedValueOnce({ item: { errorMessage: null, status: "succeeded" } })
      .mockRejectedValueOnce(new Error("parse failed"));
    const loadFinalRows = vi.fn().mockResolvedValue([
      {
        candidateName: "候选人甲",
        id: "pool-1",
        parseError: null,
        parseStatus: "ready",
        parsedAt: new Date("2026-08-21T10:00:00.000Z"),
      },
    ]);

    const result = await runDirectRecoveryJobs(
      [
        { itemId: "item-1", target: { id: "pool-1", kind: "pool" } },
        { itemId: "item-2", target: { id: "pool-2", kind: "pool" } },
      ],
      { loadFinalRows, now: () => 100, processBatchItem },
    );

    expect(processBatchItem).toHaveBeenNthCalledWith(1, "item-1", { bypassCache: true });
    expect(processBatchItem).toHaveBeenNthCalledWith(2, "item-2", { bypassCache: true });
    expect(loadFinalRows).toHaveBeenCalledWith(["pool-1", "pool-2"]);
    expect(result.missingIds).toEqual(["pool-2"]);
    expect(result.results).toEqual([
      expect.objectContaining({ id: "pool-1", status: "succeeded" }),
      expect.objectContaining({ error: "parse failed", id: "pool-2", status: "failed" }),
    ]);
    expect(result.summary).toEqual({ failed: 1, succeeded: 1, total: 2 });
  });
});
