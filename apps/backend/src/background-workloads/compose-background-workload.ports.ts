import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import type {
  BackgroundWorkloadAdapter,
  InterviewNotificationBatchInput,
  MailIngestConfig,
  MailIngestRunResult,
  MailIngestRunScope,
} from "../background/background.types.js";
import type { BackgroundWorkloadPorts } from "./background-workload.ports.js";
import { createBackgroundWorkloadAdapter } from "./background-workload.adapter.js";
import { processInterviewNotificationBatchWorkload } from "./processors/interview-notification.processor.js";
import type { InterviewNotificationProcessorPorts } from "./processors/interview-notification.processor.js";
import { processMailIngestWorkload } from "./processors/mail-ingest.processor.js";
import type { MailIngestProcessorPorts } from "./processors/mail-ingest.processor.js";
import { processMeetingAnswerWorkload } from "./processors/meeting-answer.processor.js";
import type { MeetingAnswerProcessorPorts } from "./processors/meeting-answer.processor.js";
import { processMeetingIntelligenceWorkload } from "./processors/meeting-intelligence.processor.js";
import type { MeetingIntelligenceProcessorPorts } from "./processors/meeting-intelligence.processor.js";
import { processMeetingPlaybackWorkload } from "./processors/meeting-playback.processor.js";
import type { MeetingPlaybackProcessorPorts } from "./processors/meeting-playback.processor.js";
import { processMeetingPurgeWorkload } from "./processors/meeting-purge.processor.js";
import type { MeetingPurgeProcessorPorts } from "./processors/meeting-purge.processor.js";
import {
  prepareMeetingTranscriptionWorkload,
  processMeetingTranscriptionWorkload,
} from "./processors/meeting-transcription.processor.js";
import type { MeetingTranscriptionProcessorPorts } from "./processors/meeting-transcription.processor.js";
import {
  processResumeParseWorkload,
  processResumeSemanticIndexWorkload,
} from "./processors/resume.processor.js";
import type {
  ResumeParseProcessorPorts,
  ResumeSemanticIndexProcessorPorts,
} from "./processors/resume.processor.js";

/**
 * Infrastructure-only inputs. Unlike BackgroundWorkloadPorts, process methods
 * are not supplied by callers: this module always binds the copied business
 * state machines, preventing application wiring from replacing them with a
 * success stub.
 */
export interface BackgroundWorkloadInfrastructurePorts {
  base: Pick<
    BackgroundWorkloadPorts,
    | "configuration"
    | "dependencies"
    | "meetingOperations"
    | "observability"
    | "resumeReviewGeneration"
  >;
  interviewNotifications: InterviewNotificationProcessorPorts;
  mailIngest: MailIngestProcessorPorts;
  meetingAnswer: {
    listRecoverable(): Promise<MeetingAnswerJobData[]>;
    processor: MeetingAnswerProcessorPorts;
  };
  meetingIntelligence: {
    listRecoverable(): Promise<MeetingIntelligenceJobData[]>;
    processor: MeetingIntelligenceProcessorPorts;
    recoverMissing(): Promise<void>;
  };
  meetingPlayback: {
    listRecoverable(): Promise<MeetingPlaybackJobData[]>;
    processor: MeetingPlaybackProcessorPorts;
  };
  meetingPurge: {
    listRecoverable(): Promise<MeetingPurgeJobData[]>;
    processor: MeetingPurgeProcessorPorts;
  };
  meetingTranscription: {
    listRecoverable(): Promise<MeetingTranscriptionJobData[]>;
    processor: MeetingTranscriptionProcessorPorts;
  };
  resumeParse: {
    listRecoverable(): Promise<ResumeParseJobData[]>;
    processor: ResumeParseProcessorPorts;
  };
  resumeSemanticIndex: {
    listRecoverable(): Promise<ResumeSemanticIndexJobData[]>;
    processor: ResumeSemanticIndexProcessorPorts;
  };
}

export function composeBackgroundWorkloadPorts(
  infrastructure: BackgroundWorkloadInfrastructurePorts,
): BackgroundWorkloadPorts {
  return {
    ...infrastructure.base,
    interviewNotifications: {
      processBatch: (input: InterviewNotificationBatchInput) =>
        processInterviewNotificationBatchWorkload(input, infrastructure.interviewNotifications),
    },
    mailIngest: {
      run: (config: MailIngestConfig, scope?: MailIngestRunScope): Promise<MailIngestRunResult> =>
        processMailIngestWorkload(config, infrastructure.mailIngest, scope),
    },
    meetingAnswer: {
      listRecoverable: infrastructure.meetingAnswer.listRecoverable,
      process: (data, context) =>
        processMeetingAnswerWorkload(data, context, infrastructure.meetingAnswer.processor),
    },
    meetingIntelligence: {
      listRecoverable: infrastructure.meetingIntelligence.listRecoverable,
      process: (data, context) =>
        processMeetingIntelligenceWorkload(
          data,
          context,
          infrastructure.meetingIntelligence.processor,
        ),
      recoverMissing: infrastructure.meetingIntelligence.recoverMissing,
    },
    meetingPlayback: {
      listRecoverable: infrastructure.meetingPlayback.listRecoverable,
      process: (data) =>
        processMeetingPlaybackWorkload(data, infrastructure.meetingPlayback.processor),
    },
    meetingPurge: {
      listRecoverable: infrastructure.meetingPurge.listRecoverable,
      process: (data) => processMeetingPurgeWorkload(data, infrastructure.meetingPurge.processor),
    },
    meetingTranscription: {
      listRecoverable: infrastructure.meetingTranscription.listRecoverable,
      prepare: prepareMeetingTranscriptionWorkload,
      process: (data, context) =>
        processMeetingTranscriptionWorkload(
          data,
          context,
          infrastructure.meetingTranscription.processor,
        ),
    },
    resumeParse: {
      listRecoverable: infrastructure.resumeParse.listRecoverable,
      process: (data, context) =>
        processResumeParseWorkload(data, context, infrastructure.resumeParse.processor),
    },
    resumeSemanticIndex: {
      listRecoverable: infrastructure.resumeSemanticIndex.listRecoverable,
      process: (data) =>
        processResumeSemanticIndexWorkload(data, infrastructure.resumeSemanticIndex.processor),
    },
  };
}

/** Single public construction seam used by Nest provider factories. */
export function createMigratedBackgroundWorkloadAdapter(
  infrastructure: BackgroundWorkloadInfrastructurePorts,
): BackgroundWorkloadAdapter {
  return createBackgroundWorkloadAdapter(composeBackgroundWorkloadPorts(infrastructure));
}
