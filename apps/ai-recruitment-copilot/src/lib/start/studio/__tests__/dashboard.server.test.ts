import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStudioDashboardMetricsCache, loadStudioDashboardMetrics } from "../dashboard.server";

const loadMetrics = vi.fn();

describe("loadStudioDashboardMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStudioDashboardMetricsCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces concurrent requests and reuses the short-lived workspace result", async () => {
    const metrics = { totalResumes: 12 };
    loadMetrics.mockResolvedValue(metrics);

    const first = loadStudioDashboardMetrics("org-1", loadMetrics);
    const second = loadStudioDashboardMetrics("org-1", loadMetrics);

    await expect(Promise.all([first, second])).resolves.toEqual([metrics, metrics]);
    await expect(loadStudioDashboardMetrics("org-1", loadMetrics)).resolves.toBe(metrics);
    expect(loadMetrics).toHaveBeenCalledOnce();
  });

  it("keeps workspace cache entries isolated", async () => {
    loadMetrics.mockImplementation((workspaceId: string) => Promise.resolve({ workspaceId }));

    await Promise.all([
      loadStudioDashboardMetrics("org-1", loadMetrics),
      loadStudioDashboardMetrics("org-2", loadMetrics),
    ]);

    expect(loadMetrics).toHaveBeenCalledTimes(2);
  });

  it("reloads metrics after the cache TTL expires", async () => {
    vi.useFakeTimers();
    loadMetrics.mockResolvedValue({ totalResumes: 12 });

    await loadStudioDashboardMetrics("org-1", loadMetrics);
    await vi.advanceTimersByTimeAsync(10_001);
    await loadStudioDashboardMetrics("org-1", loadMetrics);

    expect(loadMetrics).toHaveBeenCalledTimes(2);
  });

  it("keeps a slow in-flight request coalesced beyond the result TTL", async () => {
    vi.useFakeTimers();
    const deferred = Promise.withResolvers<{ totalResumes: number }>();
    loadMetrics.mockReturnValue(deferred.promise);

    const first = loadStudioDashboardMetrics("org-1", loadMetrics);
    await vi.advanceTimersByTimeAsync(10_001);
    const second = loadStudioDashboardMetrics("org-1", loadMetrics);

    expect(loadMetrics).toHaveBeenCalledOnce();
    deferred.resolve({ totalResumes: 12 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { totalResumes: 12 },
      { totalResumes: 12 },
    ]);
  });

  it("evicts a rejected load so the next request can retry", async () => {
    loadMetrics.mockRejectedValueOnce(new Error("database unavailable"));
    loadMetrics.mockResolvedValueOnce({ totalResumes: 12 });

    await expect(loadStudioDashboardMetrics("org-1", loadMetrics)).rejects.toThrow(
      "database unavailable",
    );
    await expect(loadStudioDashboardMetrics("org-1", loadMetrics)).resolves.toEqual({
      totalResumes: 12,
    });
    expect(loadMetrics).toHaveBeenCalledTimes(2);
  });
});
