/* oxlint-disable anti-slop/no-unknown-parameters, max-classes-per-file, no-void, prefer-destructuring, promise/prefer-await-to-callbacks, promise/prefer-await-to-then, typescript/parameter-properties -- BullMQ discovers decorated processor classes and exposes event/promise APIs; its rejection boundary is unknown until normalized for logging, and keeping the queue family together makes lifecycle registration auditable. */
import { Inject, Injectable, Logger } from "@nestjs/common";
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
import {
  MAIL_INGEST_TRIGGER_QUEUE_NAME,
  mailIngestTriggerJobSchema,
} from "@arc/resume-parse-queue/mail-ingest-trigger";
import type { MailIngestTriggerJobData } from "@arc/resume-parse-queue/mail-ingest-trigger";
import {
  hasResumeParseAttemptsRemaining,
  RESUME_PARSE_QUEUE_NAME,
  resolveResumeParseWorkerConcurrency,
  resumeParseJobSchema,
} from "@arc/resume-parse-queue/resume-parse";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";
import {
  RESUME_REVIEW_GENERATION_QUEUE_NAME,
  resolveResumeReviewGenerationWorkerConcurrency,
  resumeReviewGenerationJobSchema,
} from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import {
  RESUME_SEMANTIC_INDEX_QUEUE_NAME,
  resolveResumeSemanticIndexWorkerConcurrency,
  resumeSemanticIndexJobSchema,
} from "@arc/resume-parse-queue/resume-semantic-index";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import type { Job } from "bullmq";
import { z } from "zod";
import { rawBackendEnvironment } from "../config/raw-backend-environment.js";
import { resolveMeetingAnswerConcurrency } from "./background.config.js";
import { MailIngestSchedulerService } from "./background.schedulers.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "./background.types.js";
import type { BackgroundAttemptContext, BackgroundWorkloadAdapter } from "./background.types.js";
import { runWithJobCorrelation } from "../observability/request-correlation.context.js";

function attemptContext(job: Job): BackgroundAttemptContext {
  const attempts = z.number().safeParse(job.opts.attempts);
  return {
    attempt: job.attemptsMade + 1,
    maxAttempts: attempts.success ? attempts.data : 1,
  };
}

@Processor(RESUME_PARSE_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveResumeParseWorkerConcurrency(rawBackendEnvironment),
})
export class ResumeParseProcessor extends WorkerHost {
  readonly queueName = RESUME_PARSE_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<ResumeParseJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      const data = resumeParseJobSchema.parse(job.data);
      await this.adapter.processResumeParse(data, {
        hasAttemptsRemaining: hasResumeParseAttemptsRemaining(job.attemptsMade, job.opts.attempts),
      });
    });
  }
}

@Processor(RESUME_SEMANTIC_INDEX_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveResumeSemanticIndexWorkerConcurrency(rawBackendEnvironment),
})
export class ResumeSemanticIndexProcessor extends WorkerHost {
  readonly queueName = RESUME_SEMANTIC_INDEX_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<ResumeSemanticIndexJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      await this.adapter.processResumeSemanticIndex(resumeSemanticIndexJobSchema.parse(job.data));
    });
  }
}

@Processor(RESUME_REVIEW_GENERATION_QUEUE_NAME, {
  autorun: false,
  concurrency: resolveResumeReviewGenerationWorkerConcurrency(rawBackendEnvironment),
})
export class ResumeReviewGenerationProcessor extends WorkerHost {
  readonly queueName = RESUME_REVIEW_GENERATION_QUEUE_NAME;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
  ) {
    super();
  }

  async process(job: Job<ResumeReviewGenerationJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      const data = resumeReviewGenerationJobSchema.parse(job.data);
      await this.adapter.processResumeReviewGeneration(data, {
        hasAttemptsRemaining: hasResumeParseAttemptsRemaining(job.attemptsMade, job.opts.attempts),
      });
    });
  }
}

@Processor(MAIL_INGEST_TRIGGER_QUEUE_NAME, { autorun: false, concurrency: 1 })
export class MailIngestTriggerProcessor extends WorkerHost {
  readonly queueName = MAIL_INGEST_TRIGGER_QUEUE_NAME;

  constructor(
    @Inject(MailIngestSchedulerService)
    private readonly scheduler: MailIngestSchedulerService,
  ) {
    super();
  }

  async process(job: Job<MailIngestTriggerJobData>): Promise<void> {
    await runWithJobCorrelation(job.opts, async () => {
      await this.scheduler.runNow(mailIngestTriggerJobSchema.parse(job.data));
    });
  }
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

export type ManagedBackgroundProcessor = WorkerHost & { queueName: string };

@Injectable()
export class BackgroundProcessorRegistry {
  private readonly logger = new Logger(BackgroundProcessorRegistry.name);
  private registered = false;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    private readonly resumeParse: ResumeParseProcessor,
    private readonly resumeSemanticIndex: ResumeSemanticIndexProcessor,
    private readonly resumeReviewGeneration: ResumeReviewGenerationProcessor,
    private readonly mailIngestTrigger: MailIngestTriggerProcessor,
    private readonly meetingAnswer: MeetingAnswerProcessor,
    private readonly meetingPlayback: MeetingPlaybackProcessor,
    private readonly meetingPurge: MeetingPurgeProcessor,
    private readonly meetingIntelligence: MeetingIntelligenceProcessor,
    private readonly meetingTranscription: MeetingTranscriptionProcessor,
  ) {}

  start(input: {
    mailIngest: boolean;
    resumeSemanticIndex: boolean;
    transcription: boolean;
  }): void {
    const processors = this.all().filter((processor) => {
      if (processor === this.resumeSemanticIndex) {
        return input.resumeSemanticIndex;
      }
      if (processor === this.mailIngestTrigger) {
        return input.mailIngest;
      }
      if (processor === this.meetingTranscription) {
        return input.transcription;
      }
      return true;
    });
    for (const processor of processors) {
      const worker = processor.worker;
      worker.on("failed", (job, error) => {
        this.logger.error("Background job failed", {
          attemptsMade: job?.attemptsMade,
          errorName: error.name,
          jobId: job?.id,
          queue: processor.queueName,
        });
        this.adapter.reportJobFailure?.({
          attemptsMade: job?.attemptsMade ?? 0,
          error,
          jobId: job?.id,
          queue: processor.queueName,
        });
      });
      worker.on("error", (error) => {
        this.logger.error("Background queue worker error", {
          errorName: error.name,
          queue: processor.queueName,
        });
      });
      void worker.run().catch((error: unknown) => {
        this.logger.error("Background queue worker stopped unexpectedly", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          queue: processor.queueName,
        });
      });
      this.logger.log("Background queue worker started", { queue: processor.queueName });
    }
    this.registered = true;
  }

  async close(): Promise<void> {
    if (!this.registered) {
      return;
    }
    await Promise.allSettled(this.all().map((processor) => processor.worker.close()));
    this.registered = false;
  }

  private all(): ManagedBackgroundProcessor[] {
    return [
      this.resumeParse,
      this.resumeSemanticIndex,
      this.resumeReviewGeneration,
      this.mailIngestTrigger,
      this.meetingAnswer,
      this.meetingPlayback,
      this.meetingPurge,
      this.meetingIntelligence,
      this.meetingTranscription,
    ];
  }
}
