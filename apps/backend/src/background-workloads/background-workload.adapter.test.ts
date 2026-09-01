/* oxlint-disable eslint/require-await, unicorn/no-useless-undefined -- Async fakes intentionally implement promise-returning workload ports without introducing artificial awaits. */
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import { describe, expect, it, vi } from "vitest";
import { createBackgroundWorkloadAdapter } from "./background-workload.adapter.js";
import {
  BackgroundWorkloadCapabilityUnavailableError,
  createHttpOnlyBackgroundWorkloadAdapter,
} from "./http-only-background-workload.adapter.js";
import {
  BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST,
  BACKGROUND_WORKLOAD_REQUIRED_PORTS,
  COPIED_BACKGROUND_WORKLOAD_METHODS,
  PORT_BACKED_BACKGROUND_WORKLOAD_METHODS,
} from "./background-workload.manifest.js";
import type { BackgroundWorkloadPorts } from "./background-workload.ports.js";

function configuredPorts(input?: {
  processMeetingPlayback?: (data: MeetingPlaybackJobData) => Promise<void>;
}): BackgroundWorkloadPorts {
  return {
    configuration: { assertConfigured: vi.fn() },
    dependencies: { ping: vi.fn(async () => undefined) },
    interviewNotifications: { processBatch: vi.fn(async () => 0) },
    mailIngest: {
      run: vi.fn(async () => ({
        accounts: 0,
        messagesFailed: 0,
        messagesQueued: 0,
        messagesSkipped: 0,
      })),
    },
    meetingAnswer: {
      listRecoverable: vi.fn(async () => []),
      process: vi.fn(async () => undefined),
    },
    meetingIntelligence: {
      listRecoverable: vi.fn(async () => []),
      process: vi.fn(async () => undefined),
      recoverMissing: vi.fn(async () => undefined),
    },
    meetingOperations: {
      loadSnapshot: vi.fn(async () => ({
        alerts: [],
        capacity: {},
        generatedAt: "2026-09-01T00:00:00.000Z",
        latency: {},
        providerFailures: [],
        purgeOutcomes: [],
        queueRetries: [],
      })),
    },
    meetingPlayback: {
      listRecoverable: vi.fn(async () => []),
      process: input?.processMeetingPlayback ?? vi.fn(async () => undefined),
    },
    meetingPurge: {
      listRecoverable: vi.fn(async () => []),
      process: vi.fn(async () => undefined),
    },
    meetingTranscription: {
      listRecoverable: vi.fn(async () => []),
      prepare: vi.fn(async () => true),
      process: vi.fn(async () => undefined),
    },
    observability: { reportJobFailure: vi.fn() },
    resumeParse: {
      listRecoverable: vi.fn(async () => []),
      process: vi.fn(async () => undefined),
    },
    resumeReviewGeneration: { process: vi.fn(async () => undefined) },
    resumeSemanticIndex: {
      listRecoverable: vi.fn(async () => []),
      process: vi.fn(async () => undefined),
    },
  };
}

describe("createBackgroundWorkloadAdapter", () => {
  it("exposes a public processor seam and forwards the unchanged queue payload", async () => {
    const processMeetingPlayback = vi.fn(async (_data: MeetingPlaybackJobData) => undefined);
    const adapter = createBackgroundWorkloadAdapter(configuredPorts({ processMeetingPlayback }));
    const data = { meetingId: "meeting-1", organizationId: "organization-1" };

    await adapter.processMeetingPlayback(data);

    expect(processMeetingPlayback).toHaveBeenCalledOnce();
    expect(processMeetingPlayback).toHaveBeenCalledWith(data);
  });

  it("fails fast with the exact missing workload port instead of starting a no-op worker", () => {
    const ports = configuredPorts();
    Object.defineProperty(ports.meetingTranscription, "process", { value: undefined });
    const adapter = createBackgroundWorkloadAdapter(ports);

    expect(() => adapter.assertConfigured()).toThrowError(
      "Background workloads are not wired: meetingTranscription.process",
    );
  });

  it("keeps the executable manifest free of duplicate port mappings", () => {
    expect(new Set(BACKGROUND_WORKLOAD_REQUIRED_PORTS).size).toBe(
      BACKGROUND_WORKLOAD_REQUIRED_PORTS.length,
    );
  });

  it("classifies every manifest entry as copied business logic or a required infrastructure port", () => {
    const covered = new Set([
      ...COPIED_BACKGROUND_WORKLOAD_METHODS,
      ...PORT_BACKED_BACKGROUND_WORKLOAD_METHODS,
    ]);
    expect(covered.size).toBe(BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST.length);
    expect(
      BACKGROUND_WORKLOAD_IMPLEMENTATION_MANIFEST.every((entry) => covered.has(entry.adapter)),
    ).toBe(true);
  });

  it("allows HTTP-only startup but rejects every accidental workload invocation", async () => {
    const adapter = createHttpOnlyBackgroundWorkloadAdapter(false);

    expect(() => adapter.assertConfigured()).not.toThrow();
    await expect(adapter.pingDependencies()).rejects.toBeInstanceOf(
      BackgroundWorkloadCapabilityUnavailableError,
    );
  });

  it("fails startup validation when background workers are enabled without infrastructure", () => {
    const adapter = createHttpOnlyBackgroundWorkloadAdapter(true);

    expect(() => adapter.assertConfigured()).toThrow(
      "Background workers are enabled without infrastructure",
    );
  });
});
