import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStudioDashboardMetricsCache, loadStudioDashboardMetrics } from "../dashboard.server";

const mocks = vi.hoisted(() => ({
  loadMetrics: vi.fn(),
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics",
  () => ({ loadRecruitingDashboardMetrics: mocks.loadMetrics }),
);

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
    mocks.loadMetrics.mockResolvedValue(metrics);

    const first = loadStudioDashboardMetrics("org-1");
    const second = loadStudioDashboardMetrics("org-1");

    await expect(Promise.all([first, second])).resolves.toEqual([metrics, metrics]);
    await expect(loadStudioDashboardMetrics("org-1")).resolves.toBe(metrics);
    expect(mocks.loadMetrics).toHaveBeenCalledOnce();
  });

  it("keeps workspace cache entries isolated", async () => {
    mocks.loadMetrics.mockImplementation((workspaceId: string) => Promise.resolve({ workspaceId }));

    await Promise.all([loadStudioDashboardMetrics("org-1"), loadStudioDashboardMetrics("org-2")]);

    expect(mocks.loadMetrics).toHaveBeenCalledTimes(2);
  });

  it("reloads metrics after the cache TTL expires", async () => {
    vi.useFakeTimers();
    mocks.loadMetrics.mockResolvedValue({ totalResumes: 12 });

    await loadStudioDashboardMetrics("org-1");
    await vi.advanceTimersByTimeAsync(10_001);
    await loadStudioDashboardMetrics("org-1");

    expect(mocks.loadMetrics).toHaveBeenCalledTimes(2);
  });

  it("keeps a slow in-flight request coalesced beyond the result TTL", async () => {
    vi.useFakeTimers();
    const deferred = Promise.withResolvers<{ totalResumes: number }>();
    mocks.loadMetrics.mockReturnValue(deferred.promise);

    const first = loadStudioDashboardMetrics("org-1");
    await vi.advanceTimersByTimeAsync(10_001);
    const second = loadStudioDashboardMetrics("org-1");

    expect(mocks.loadMetrics).toHaveBeenCalledOnce();
    deferred.resolve({ totalResumes: 12 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { totalResumes: 12 },
      { totalResumes: 12 },
    ]);
  });

  it("evicts a rejected load so the next request can retry", async () => {
    mocks.loadMetrics.mockRejectedValueOnce(new Error("database unavailable"));
    mocks.loadMetrics.mockResolvedValueOnce({ totalResumes: 12 });

    await expect(loadStudioDashboardMetrics("org-1")).rejects.toThrow("database unavailable");
    await expect(loadStudioDashboardMetrics("org-1")).resolves.toEqual({ totalResumes: 12 });
    expect(mocks.loadMetrics).toHaveBeenCalledTimes(2);
  });
});
