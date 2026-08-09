import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerApp } from "./app";

const mocks = vi.hoisted(() => ({
  getMeetingIntelligenceQueueStats: vi.fn(() =>
    Promise.resolve({ active: 0, concurrency: 4, delayed: 0, failed: 0, waiting: 3 }),
  ),
  getMeetingOperationsSnapshot: vi.fn(() =>
    Promise.resolve({
      alerts: [{ ageMs: 3_600_000, kind: "stuck-upload", meetingId: "meeting-85" }],
      capacity: {
        directUpload: { active: 12, limit: 100 },
        liveDraft: { active: 8, limit: 100 },
      },
      generatedAt: "2026-08-09T09:00:00.000Z",
      latency: {
        saveToUpload: { averageMs: 1000, count: 1, maxMs: 1000 },
        uploadToTranscript: { averageMs: 2000, count: 1, maxMs: 2000 },
      },
      providerFailures: [
        { count: 2, errorCode: "provider-quota", provider: "openai", stage: "final-transcription" },
      ],
      purgeOutcomes: [{ action: "meeting.purged", count: 1 }],
      queueRetries: [{ maxAttempt: 2, retries: 1, stage: "final-transcription" }],
    }),
  ),
  getMeetingPlaybackQueueStats: vi.fn(() =>
    Promise.resolve({ active: 0, concurrency: 2, delayed: 0, failed: 0, waiting: 1 }),
  ),
  getMeetingTranscriptionQueueStats: vi.fn(() =>
    Promise.resolve({ active: 2, concurrency: 20, delayed: 0, failed: 1, waiting: 5 }),
  ),
  getResumeParseQueueStats: vi.fn(() => Promise.resolve({ waiting: 0 })),
  getResumeParseReadinessIssue: vi.fn(() => null),
  isResumeParseQueueConfigured: vi.fn(() => true),
  pingDatabase: vi.fn(() => Promise.resolve()),
}));

vi.mock("@arc/resume-parse-queue/resume-parse", () => ({
  getResumeParseQueueStats: mocks.getResumeParseQueueStats,
  isResumeParseQueueConfigured: mocks.isResumeParseQueueConfigured,
}));
vi.mock("@arc/meeting-processing-queue/meeting-playback", () => ({
  getMeetingPlaybackQueueStats: mocks.getMeetingPlaybackQueueStats,
}));
vi.mock("@arc/meeting-processing-queue/meeting-transcription", () => ({
  getMeetingTranscriptionQueueStats: mocks.getMeetingTranscriptionQueueStats,
}));
vi.mock("@arc/meeting-processing-queue/meeting-intelligence", () => ({
  getMeetingIntelligenceQueueStats: mocks.getMeetingIntelligenceQueueStats,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/meetings/operations-dao", () => ({
  loadMeetingOperationsSnapshot: mocks.getMeetingOperationsSnapshot,
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
    expect(consoleError).toHaveBeenCalledWith("[worker] readiness check failed", {
      errorName: "Error",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private-host");
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

  it("separates Meeting pipeline queues and returns only bounded operational evidence", async () => {
    vi.stubEnv("WORKER_DIAGNOSTICS_SECRET", "diagnostics-secret");

    const response = await createWorkerApp().request("/operations/meetings", {
      headers: { Authorization: "Bearer diagnostics-secret" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      capacity: {
        directUpload: { active: 12, limit: 100 },
        liveDraft: { active: 8, limit: 100 },
      },
      queues: {
        finalTranscription: { concurrency: 20, waiting: 5 },
        intelligence: { concurrency: 4, waiting: 3 },
        mediaFinalization: { concurrency: 2, waiting: 1 },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|signed|transcript text|candidate/i);
  });
});
