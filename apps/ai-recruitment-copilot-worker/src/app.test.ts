import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerApp } from "./app";

const mocks = vi.hoisted(() => ({
  getResumeParseQueueStats: vi.fn(() => Promise.resolve({ waiting: 0 })),
  getResumeParseReadinessIssue: vi.fn(() => null),
  isResumeParseQueueConfigured: vi.fn(() => true),
  pingDatabase: vi.fn(() => Promise.resolve()),
}));

vi.mock("@arc/resume-parse-queue/resume-parse", () => ({
  getResumeParseQueueStats: mocks.getResumeParseQueueStats,
  isResumeParseQueueConfigured: mocks.isResumeParseQueueConfigured,
}));

vi.mock("./parse-config", () => ({
  getResumeParseReadinessIssue: mocks.getResumeParseReadinessIssue,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  pingDatabase: mocks.pingDatabase,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("worker readiness", () => {
  it("does not expose dependency errors in the response", async () => {
    const dependencyError = new Error("postgres://user:secret@private-host/database");
    mocks.pingDatabase.mockRejectedValueOnce(dependencyError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await createWorkerApp().request("/readyz");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "Dependency check failed",
    });
    expect(consoleError).toHaveBeenCalledWith("[worker] readiness check failed", dependencyError);
  });
});

describe("worker diagnostics", () => {
  it("rejects queue statistics requests without a bearer token", async () => {
    vi.stubEnv("WORKER_DIAGNOSTICS_SECRET", "diagnostics-secret");

    const response = await createWorkerApp().request("/queues/resume-parse/stats");

    expect(response.status).toBe(401);
    expect(mocks.getResumeParseQueueStats).not.toHaveBeenCalled();
  });

  it("returns queue statistics to an authorized operator", async () => {
    vi.stubEnv("WORKER_DIAGNOSTICS_SECRET", "diagnostics-secret");

    const response = await createWorkerApp().request("/queues/resume-parse/stats", {
      headers: { Authorization: "Bearer diagnostics-secret" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ waiting: 0 });
  });

  it("fails closed when the diagnostics secret is not configured", async () => {
    vi.stubEnv("WORKER_DIAGNOSTICS_SECRET", "");

    const response = await createWorkerApp().request("/queues/resume-review-generation/stats", {
      headers: { Authorization: "Bearer any-token" },
    });

    expect(response.status).toBe(401);
  });

  it("keeps process health public", async () => {
    vi.stubEnv("WORKER_DIAGNOSTICS_SECRET", "diagnostics-secret");

    const response = await createWorkerApp().request("/healthz");

    expect(response.status).toBe(200);
  });
});
