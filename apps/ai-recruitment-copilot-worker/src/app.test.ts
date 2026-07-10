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
