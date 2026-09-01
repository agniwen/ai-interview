/* oxlint-disable max-classes-per-file -- BullMQ discovers decorated owner-local processor classes. */
import { Inject } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
  MEETING_ANSWER_QUEUE_NAME,
  meetingAnswerJobSchema,
} from "@arc/meeting-processing-queue/meeting-answer";
import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import {
  MEETING_INTELLIGENCE_QUEUE_NAME,
  meetingIntelligenceJobSchema,
  resolveMeetingIntelligenceWorkerConcurrency,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  MEETING_PLAYBACK_QUEUE_NAME,
  meetingPlaybackJobSchema,
  resolveMeetingPlaybackWorkerConcurrency,
} from "@arc/meeting-processing-queue/meeting-playback";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import {
  MEETING_PURGE_QUEUE_NAME,
  meetingPurgeJobSchema,
  resolveMeetingPurgeWorkerConcurrency,
} from "@arc/meeting-processing-queue/meeting-purge";
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";
import {
  MEETING_TRANSCRIPTION_QUEUE_NAME,
  meetingTranscriptionJobSchema,
  resolveMeetingTranscriptionWorkerConcurrency,
} from "@arc/meeting-processing-queue/meeting-transcription";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import type { Job } from "bullmq";
import { z } from "zod";
import { resolveMeetingAnswerConcurrency } from "../../../../background/background.config.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "../../../../background/background.types.js";
import type {
  BackgroundAttemptContext,
  BackgroundWorkloadAdapter,
} from "../../../../background/background.types.js";
import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { runWithJobCorrelation } from "../../../../observability/request-correlation.context.js";

function attemptContext(job: Job): BackgroundAttemptContext {
  const attempts = z.number().safeParse(job.opts.attempts);
  return {
    attempt: job.attemptsMade + 1,
    maxAttempts: attempts.success ? attempts.data : 1,
  };
}

@Processor(MEETING_ANSWER_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveMeetingAnswerConcurrency(rawBackendEnvironment),
})
export class MeetingAnswerProcessor extends WorkerHost {
  readonly queueName = MEETING_ANSWER_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<MeetingAnswerJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      await this.adapter.processMeetingAnswer(
        meetingAnswerJobSchema.parse(job.data),
        attemptContext(job),
      );
    });
  }
}

@Processor(MEETING_PLAYBACK_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveMeetingPlaybackWorkerConcurrency(rawBackendEnvironment),
})
export class MeetingPlaybackProcessor extends WorkerHost {
  readonly queueName = MEETING_PLAYBACK_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<MeetingPlaybackJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      await this.adapter.processMeetingPlayback(meetingPlaybackJobSchema.parse(job.data));
    });
  }
}

@Processor(MEETING_PURGE_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveMeetingPurgeWorkerConcurrency(rawBackendEnvironment),
})
export class MeetingPurgeProcessor extends WorkerHost {
  readonly queueName = MEETING_PURGE_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<MeetingPurgeJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      await this.adapter.processMeetingPurge(meetingPurgeJobSchema.parse(job.data));
    });
  }
}

@Processor(MEETING_INTELLIGENCE_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveMeetingIntelligenceWorkerConcurrency(rawBackendEnvironment),
})
export class MeetingIntelligenceProcessor extends WorkerHost {
  readonly queueName = MEETING_INTELLIGENCE_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<MeetingIntelligenceJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      await this.adapter.processMeetingIntelligence(
        meetingIntelligenceJobSchema.parse(job.data),
        attemptContext(job),
      );
    });
  }
}

@Processor(MEETING_TRANSCRIPTION_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveMeetingTranscriptionWorkerConcurrency(rawBackendEnvironment),
})
export class MeetingTranscriptionProcessor extends WorkerHost {
  readonly queueName = MEETING_TRANSCRIPTION_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<MeetingTranscriptionJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      await this.adapter.processMeetingTranscription(
        meetingTranscriptionJobSchema.parse(job.data),
        attemptContext(job),
      );
    });
  }
}
