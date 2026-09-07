import { describe, expect, it, vi } from "vitest";
import type { InitialInterviewSnapshot } from "@app/shared/human-initial-interview";
import { InitialInterviewError } from "../errors";
import { importRecordedInitialInterview } from "./import-recorded-initial-interview";
import type { ImportRecordedInitialInterviewDependencies } from "./import-recorded-initial-interview";
import { processInitialInterview } from "./process-initial-interview";
import type {
  InitialInterviewJob,
  InitialInterviewProcessorDependencies,
} from "./process-initial-interview";

const snapshot: InitialInterviewSnapshot = {
  candidateName: "张三",
  durationMs: 2000,
  interviewQuestions: [],
  job: null,
  qualitativeResumeEvaluation: null,
  recordedAt: "2026-09-07T00:00:00Z",
  recording: {
    contentType: "audio/mp4",
    sizeBytes: 100,
    storageKey: "recruiting-initial-interviews/org/snapshot/recording",
  },
  resume: null,
  resumeEmploymentContext: "",
  resumeText: "原始简历",
  sourceMeetingId: "echo",
  sourceTranscriptRevisionId: "revision",
  title: "初面",
  turns: [
    {
      confidence: null,
      endMs: 1000,
      id: "1",
      sequence: 0,
      speakerKey: "local",
      startMs: 0,
      text: "什么时候到岗？",
      track: "local",
    },
    {
      confidence: null,
      endMs: 2000,
      id: "2",
      sequence: 1,
      speakerKey: "remote-0",
      startMs: 1000,
      text: "下周一",
      track: "remote",
    },
  ],
};
const input = {
  actorId: "hr",
  meetingId: "echo",
  memberRole: "admin",
  organizationId: "org",
  overwriteDocumentId: null,
  recruitingRecordId: "record",
  requestId: "version",
};
const evaluation = {
  availability: "下周一",
  careerProgression: null,
  compensationExpectations: null,
  jobMotivation: null,
  overseasTravel: null,
  projectHighlights: null,
  recentWork: null,
};
function importer() {
  const dependencies: ImportRecordedInitialInterviewDependencies = {
    capture: vi.fn(() => Promise.resolve(structuredClone(snapshot))),
    checkOverwrite: vi.fn(() => Promise.resolve()),
    cleanup: vi.fn(() => Promise.resolve()),
    enqueue: vi.fn(() => Promise.resolve()),
    findExisting: vi.fn(() => Promise.resolve(null)),
    persist: vi.fn(() => Promise.resolve()),
    withLock: (_scope, run) => run(),
  };
  return dependencies;
}
function processor(overrides: Partial<InitialInterviewJob> = {}) {
  const job: InitialInterviewJob = {
    ...input,
    documentId: null,
    evaluation: null,
    id: "version",
    initialInterviewId: "snapshot",
    roles: { local: "interviewer", "remote-0": "candidate" },
    snapshot: structuredClone(snapshot),
    status: "queued",
    turns: snapshot.turns,
    ...overrides,
  };
  const dependencies: InitialInterviewProcessorDependencies = {
    generate: vi.fn(() => Promise.resolve(evaluation)),
    identify: vi.fn(() => Promise.resolve(null)),
    load: vi.fn(() => Promise.resolve(structuredClone(job))),
    publish: vi.fn(() =>
      Promise.resolve({ documentId: "doc", documentUrl: "https://example.com/doc" }),
    ),
    update: vi.fn((_job, patch) => {
      Object.assign(job, patch);
      return Promise.resolve();
    }),
    withLock: (_scope, run) => run(),
  };
  return {
    dependencies,
    job,
    run: () =>
      processInitialInterview(
        { attempt: 1, maxAttempts: 2, organizationId: "org", versionId: "version" },
        dependencies,
      ),
  };
}
describe("independent recorded initial interview", () => {
  it("checks overwrite consent before copying or persisting anything", async () => {
    const dependencies = importer();
    vi.mocked(dependencies.checkOverwrite).mockRejectedValue(new InitialInterviewError("confirm"));
    await expect(importRecordedInitialInterview(input, dependencies)).rejects.toThrow("confirm");
    expect(dependencies.capture).not.toHaveBeenCalled();
    expect(dependencies.persist).not.toHaveBeenCalled();
  });
  it("returns the same request after source deletion without reading Echo again", async () => {
    const dependencies = importer();
    await importRecordedInitialInterview(input, dependencies);
    vi.mocked(dependencies.findExisting).mockResolvedValue({ recruitingRecordId: "record" });
    vi.mocked(dependencies.capture).mockRejectedValue(new Error("Echo deleted"));
    await expect(importRecordedInitialInterview(input, dependencies)).resolves.toEqual({
      id: "version",
    });
    expect(dependencies.capture).toHaveBeenCalledTimes(1);
    expect(dependencies.persist).toHaveBeenCalledWith(input, snapshot);
  });
  it("cleans copied objects if persistence fails and never dispatches the job", async () => {
    const dependencies = importer();
    vi.mocked(dependencies.persist).mockRejectedValue(new Error("database failure"));
    await expect(importRecordedInitialInterview(input, dependencies)).rejects.toThrow(
      "database failure",
    );
    expect(dependencies.cleanup).toHaveBeenCalledWith(snapshot);
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });
  it("generates using only the saved recruiting materials", async () => {
    const { job, dependencies, run } = processor();
    await run();
    expect(dependencies.generate).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot, turns: snapshot.turns }),
    );
    expect(job.status).toBe("ready");
    expect(job.documentId).toBe("doc");
  });
  it("waits for HR when automatic speaker identification is ambiguous", async () => {
    const { job, dependencies, run } = processor({ roles: {} });
    await run();
    expect(job.status).toBe("needs_speakers");
    expect(dependencies.generate).not.toHaveBeenCalled();
    expect(dependencies.publish).not.toHaveBeenCalled();
  });
  it("does not become ready after document failure and reuses the evaluation checkpoint on retry", async () => {
    const { job, dependencies, run } = processor();
    vi.mocked(dependencies.publish).mockRejectedValueOnce(new Error("provider timeout"));
    await expect(run()).rejects.toThrow("provider timeout");
    expect(job.status).toBe("queued");
    expect(job.evaluation).toEqual(evaluation);
    await run();
    expect(job.status).toBe("ready");
    expect(dependencies.generate).toHaveBeenCalledTimes(1);
    expect(dependencies.publish).toHaveBeenCalledTimes(2);
  });
  it("stops automatic retries for an explicit consent conflict", async () => {
    const { job, dependencies, run } = processor();
    vi.mocked(dependencies.publish).mockRejectedValue(
      new InitialInterviewError("document changed"),
    );
    await expect(run()).rejects.toThrow("document changed");
    expect(job.status).toBe("failed");
    await run();
    expect(dependencies.publish).toHaveBeenCalledTimes(1);
  });
});
