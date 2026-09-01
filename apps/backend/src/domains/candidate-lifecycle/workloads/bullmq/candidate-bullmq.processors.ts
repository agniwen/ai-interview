/* oxlint-disable anti-slop/no-unknown-parameters, max-classes-per-file, typescript/parameter-properties -- BullMQ discovers decorated owner-local processor classes. */
import { Inject } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
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
import { MailIngestSchedulerService } from "../schedulers/candidate.schedulers.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "../../../../background/background.types.js";
import type { BackgroundWorkloadAdapter } from "../../../../background/background.types.js";
import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { runWithJobCorrelation } from "../../../../observability/request-correlation.context.js";

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
