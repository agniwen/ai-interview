import { describe, expect, it, vi } from "vitest";
import { BackgroundDiagnosticsService } from "./background.diagnostics.js";

function createDiagnostics() {
  const adapter = {
    assertConfigured: vi.fn(),
    pingDependencies: vi.fn(async () => {}),
  };
  const queues = Array.from({ length: 9 }, () => ({
    getJobCounts: vi.fn(async () => ({ waiting: 0 })),
    waitUntilReady: vi.fn(async () => {}),
  }));
  // SAFETY: the focused queue and collaborator fakes implement every method
  // exercised by getReadinessIssue; unrelated diagnostic methods are not called.
  const diagnostics = new BackgroundDiagnosticsService(
    adapter as never,
    { getSnapshot: vi.fn() } as never,
    { getSnapshot: vi.fn() } as never,
    queues[0] as never,
    queues[1] as never,
    queues[2] as never,
    queues[3] as never,
    queues[4] as never,
    queues[5] as never,
    queues[6] as never,
    queues[7] as never,
    queues[8] as never,
  );
  diagnostics.bindLifecycle({
    getSnapshot: () => ({
      draining: false,
      enabled: true,
      lastStartupError: null,
      ready: true,
      registered: true,
      startedAt: new Date().toISOString(),
      transcriptionEnabled: true,
    }),
  });
  return { adapter, diagnostics, queues };
}

describe("BackgroundDiagnosticsService readiness", () => {
  it("checks feature configuration, the background database, Redis, and every queue", async () => {
    const subject = createDiagnostics();

    await expect(subject.diagnostics.getReadinessIssue()).resolves.toBeNull();

    expect(subject.adapter.assertConfigured).toHaveBeenCalledOnce();
    expect(subject.adapter.pingDependencies).toHaveBeenCalledOnce();
    expect(subject.queues[0]?.getJobCounts).toHaveBeenCalledWith("waiting");
    for (const queue of subject.queues) {
      expect(queue.waitUntilReady).toHaveBeenCalledOnce();
    }
  });

  it("reports incomplete enabled-feature configuration before dependency probes", async () => {
    const subject = createDiagnostics();
    subject.adapter.assertConfigured.mockImplementation(() => {
      throw new Error("missing configuration");
    });

    await expect(subject.diagnostics.getReadinessIssue()).resolves.toBe(
      "Feature configuration is incomplete",
    );
    expect(subject.adapter.pingDependencies).not.toHaveBeenCalled();
    expect(subject.queues[0]?.getJobCounts).not.toHaveBeenCalled();
  });
});
