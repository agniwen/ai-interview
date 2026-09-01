import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
  MEETING_ANSWER_QUEUE_NAME,
  reconcileMeetingAnswerJob,
} from "@arc/meeting-processing-queue/meeting-answer";
import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import {
  MEETING_INTELLIGENCE_QUEUE_NAME,
  reconcileMeetingIntelligenceJob,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import { MEETING_PLAYBACK_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-playback";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import {
  MEETING_PURGE_QUEUE_NAME,
  reconcileMeetingPurgeJob,
} from "@arc/meeting-processing-queue/meeting-purge";
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";
import {
  MEETING_TRANSCRIPTION_QUEUE_NAME,
  reconcileMeetingTranscriptionJob,
} from "@arc/meeting-processing-queue/meeting-transcription";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import { MAIL_INGEST_TRIGGER_QUEUE_NAME } from "@arc/resume-parse-queue/mail-ingest-trigger";
import type { MailIngestTriggerJobData } from "@arc/resume-parse-queue/mail-ingest-trigger";
import { RESUME_PARSE_QUEUE_NAME } from "@arc/resume-parse-queue/resume-parse";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";
import { RESUME_REVIEW_GENERATION_QUEUE_NAME } from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import { RESUME_SEMANTIC_INDEX_QUEUE_NAME } from "@arc/resume-parse-queue/resume-semantic-index";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import type { JobsOptions, Queue } from "bullmq";
import type {
  RecoverableResumeParse,
  RecoverableResumeSemanticIndex,
} from "../domains/candidate-lifecycle/workloads/recovery/candidate-recovery.commands.js";
import type {
  RecoverableMeetingAnswer,
  RecoverableMeetingIntelligence,
  RecoverableMeetingPlayback,
  RecoverableMeetingPurge,
  RecoverableMeetingTranscription,
} from "../domains/meetings/workloads/recovery/meeting-recovery.commands.js";
import { rawBackendEnvironment } from "../config/raw-backend-environment.js";
import {
  getRequestCorrelationId,
  withCorrelationJobOptions,
} from "../observability/request-correlation.context.js";
import { getBackgroundRedisConnection } from "./background.config.js";
import {
  enqueueMailIngestTriggerWithQueue,
  enqueueMeetingPlaybackJobsWithQueue,
  enqueueResumeParseJobsWithQueue,
  enqueueResumeReviewGenerationJobsWithQueue,
  enqueueResumeSemanticIndexJobsWithQueue,
} from "./background-queue-producer.helpers.js";
import type {
  MailIngestTriggerProducerQueue,
  MeetingPlaybackProducerQueue,
  ResumeParseProducerQueue,
  ResumeReviewGenerationProducerQueue,
  ResumeSemanticIndexProducerQueue,
} from "./background-queue-producer.helpers.js";

interface CorrelatedQueuePort<T> {
  add(name: string, data: T, options: JobsOptions): ReturnType<Queue<T>["add"]>;
  getJob(jobId: string): ReturnType<Queue<T>["getJob"]>;
}

function correlatedReconcileQueue<T>(
  queue: CorrelatedQueuePort<T>,
  correlationId: string | undefined,
) {
  return {
    add: (name: string, data: T, options: JobsOptions) =>
      queue.add(name, data, withCorrelationJobOptions(options, correlationId)),
    getJob: (jobId: string) => queue.getJob(jobId),
  };
}

@Injectable()
export class BackgroundQueueProducerService {
  constructor(
    @InjectQueue(RESUME_PARSE_QUEUE_NAME)
    private readonly resumeParseQueue: ResumeParseProducerQueue,
    @InjectQueue(RESUME_SEMANTIC_INDEX_QUEUE_NAME)
    private readonly resumeSemanticIndexQueue: ResumeSemanticIndexProducerQueue,
    @InjectQueue(RESUME_REVIEW_GENERATION_QUEUE_NAME)
    private readonly resumeReviewGenerationQueue: ResumeReviewGenerationProducerQueue,
    @InjectQueue(MAIL_INGEST_TRIGGER_QUEUE_NAME)
    private readonly mailIngestTriggerQueue: MailIngestTriggerProducerQueue,
    @InjectQueue(MEETING_ANSWER_QUEUE_NAME)
    private readonly meetingAnswerQueue: Queue<MeetingAnswerJobData>,
    @InjectQueue(MEETING_PLAYBACK_QUEUE_NAME)
    private readonly meetingPlaybackQueue: MeetingPlaybackProducerQueue,
    @InjectQueue(MEETING_PURGE_QUEUE_NAME)
    private readonly meetingPurgeQueue: Queue<MeetingPurgeJobData>,
    @InjectQueue(MEETING_INTELLIGENCE_QUEUE_NAME)
    private readonly meetingIntelligenceQueue: Queue<MeetingIntelligenceJobData>,
    @InjectQueue(MEETING_TRANSCRIPTION_QUEUE_NAME)
    private readonly meetingTranscriptionQueue: Queue<MeetingTranscriptionJobData>,
  ) {}

  async enqueueResumeParseJobs(jobs: RecoverableResumeParse[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    const payloads: ResumeParseJobData[] = jobs.map((job) => ({ ...job }));
    await enqueueResumeParseJobsWithQueue(
      this.resumeParseQueue,
      payloads,
      getRequestCorrelationId(),
    );
  }

  async enqueueResumeSemanticIndexJobs(jobs: RecoverableResumeSemanticIndex[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    await enqueueResumeSemanticIndexJobsWithQueue(
      this.resumeSemanticIndexQueue,
      jobs.map((job): ResumeSemanticIndexJobData => ({ ...job })),
      getRequestCorrelationId(),
    );
  }

  async enqueueResumeReviewGenerationJobs(jobs: ResumeReviewGenerationJobData[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    await enqueueResumeReviewGenerationJobsWithQueue(
      this.resumeReviewGenerationQueue,
      jobs,
      getRequestCorrelationId(),
    );
  }

  async enqueueMailIngestTrigger(data: MailIngestTriggerJobData): Promise<void> {
    if (this.disabled()) {
      return;
    }
    await enqueueMailIngestTriggerWithQueue(
      this.mailIngestTriggerQueue,
      data,
      getRequestCorrelationId(),
    );
  }

  async enqueueMeetingAnswerJobs(jobs: RecoverableMeetingAnswer[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    const queue = correlatedReconcileQueue(this.meetingAnswerQueue, getRequestCorrelationId());
    await Promise.all(
      jobs.map((job) =>
        reconcileMeetingAnswerJob(queue, { ...job } satisfies MeetingAnswerJobData),
      ),
    );
  }

  async enqueueMeetingPlaybackJobs(jobs: RecoverableMeetingPlayback[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    await enqueueMeetingPlaybackJobsWithQueue(
      this.meetingPlaybackQueue,
      jobs.map((job): MeetingPlaybackJobData => ({ ...job })),
      getRequestCorrelationId(),
    );
  }

  async enqueueMeetingPurgeJobs(jobs: RecoverableMeetingPurge[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    const queue = correlatedReconcileQueue(this.meetingPurgeQueue, getRequestCorrelationId());
    await Promise.all(
      jobs.map((job) => reconcileMeetingPurgeJob(queue, { ...job } satisfies MeetingPurgeJobData)),
    );
  }

  async enqueueMeetingIntelligenceJobs(jobs: RecoverableMeetingIntelligence[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    const queue = correlatedReconcileQueue(
      this.meetingIntelligenceQueue,
      getRequestCorrelationId(),
    );
    await Promise.all(
      jobs.map((job) =>
        reconcileMeetingIntelligenceJob(queue, {
          ...job,
        } satisfies MeetingIntelligenceJobData),
      ),
    );
  }

  async enqueueMeetingTranscriptionJobs(jobs: RecoverableMeetingTranscription[]): Promise<void> {
    if (this.disabled()) {
      return;
    }
    const queue = correlatedReconcileQueue(
      this.meetingTranscriptionQueue,
      getRequestCorrelationId(),
    );
    await Promise.all(
      jobs.map((job) =>
        reconcileMeetingTranscriptionJob(queue, {
          ...job,
        } satisfies MeetingTranscriptionJobData),
      ),
    );
  }

  private disabled(): boolean {
    return getBackgroundRedisConnection(rawBackendEnvironment) === undefined;
  }
}
