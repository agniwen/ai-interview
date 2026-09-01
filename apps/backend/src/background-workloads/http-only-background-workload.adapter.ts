/* oxlint-disable eslint/require-await, unicorn/no-useless-undefined -- Disabled-replica ports throw a named capability error and intentionally never await. */
import type { BackgroundWorkloadAdapter } from "../background/background.types.js";
import { createBackgroundWorkloadAdapter } from "./background-workload.adapter.js";

const ENABLED_INFRASTRUCTURE_REQUIREMENTS = [
  "resume parse/review/semantic database and AI services",
  "mail-ingest account/message/batch database and S3 services",
  "interview-notification database and channel adapters",
  "meeting recovery/operations database queries",
  "meeting answer/intelligence generators and repositories",
  "meeting playback/transcription storage and provider adapters",
  "meeting purge lifecycle repository and provider cleanup adapters",
  "background observability reporter",
] as const;

export class BackgroundWorkloadCapabilityUnavailableError extends Error {
  constructor(capability: string) {
    super(`Background workload capability is unavailable: ${capability}`);
    this.name = "BackgroundWorkloadCapabilityUnavailableError";
  }
}

function unavailable(capability: string): never {
  throw new BackgroundWorkloadCapabilityUnavailableError(capability);
}

/** Safe default for an HTTP-only replica; every workload call fails explicitly. */
export function createHttpOnlyBackgroundWorkloadAdapter(
  workersEnabled: boolean,
): BackgroundWorkloadAdapter {
  return createBackgroundWorkloadAdapter({
    configuration: {
      assertConfigured() {
        if (workersEnabled) {
          throw new Error(
            `Background workers are enabled without infrastructure: ${ENABLED_INFRASTRUCTURE_REQUIREMENTS.join("; ")}`,
          );
        }
      },
    },
    dependencies: { ping: async () => unavailable("database ping") },
    interviewNotifications: {
      processBatch: async () => unavailable("interview notifications"),
    },
    mailIngest: { run: async () => unavailable("mail ingest") },
    meetingAnswer: {
      listRecoverable: async () => unavailable("meeting answer recovery"),
      process: async () => unavailable("meeting answer processing"),
    },
    meetingIntelligence: {
      listRecoverable: async () => unavailable("meeting intelligence recovery"),
      process: async () => unavailable("meeting intelligence processing"),
      recoverMissing: async () => unavailable("missing meeting intelligence recovery"),
    },
    meetingOperations: {
      loadSnapshot: async () => unavailable("meeting operations snapshot"),
    },
    meetingPlayback: {
      listRecoverable: async () => unavailable("meeting playback recovery"),
      process: async () => unavailable("meeting playback processing"),
    },
    meetingPurge: {
      listRecoverable: async () => unavailable("meeting purge recovery"),
      process: async () => unavailable("meeting purge processing"),
    },
    meetingTranscription: {
      listRecoverable: async () => unavailable("meeting transcription recovery"),
      prepare: async () => unavailable("meeting transcription runtime"),
      process: async () => unavailable("meeting transcription processing"),
    },
    observability: {
      reportJobFailure: () => unavailable("background observability"),
    },
    resumeParse: {
      listRecoverable: async () => unavailable("resume parse recovery"),
      process: async () => unavailable("resume parse processing"),
    },
    resumeReviewGeneration: {
      process: async () => unavailable("resume review generation"),
    },
    resumeSemanticIndex: {
      listRecoverable: async () => unavailable("resume semantic recovery"),
      process: async () => unavailable("resume semantic processing"),
    },
  });
}
