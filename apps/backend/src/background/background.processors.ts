/* oxlint-disable prefer-destructuring, promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- The central registry composes owner-local BullMQ processors and controls their shared lifecycle. */
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { WorkerHost } from "@nestjs/bullmq";
import {
  MailIngestTriggerProcessor,
  ResumeParseProcessor,
  ResumeReviewGenerationProcessor,
  ResumeSemanticIndexProcessor,
} from "../domains/candidate-lifecycle/workloads/bullmq/candidate-bullmq.processors.js";
import {
  MeetingAnswerProcessor,
  MeetingIntelligenceProcessor,
  MeetingPlaybackProcessor,
  MeetingPurgeProcessor,
  MeetingTranscriptionProcessor,
} from "../domains/meetings/workloads/bullmq/meeting-bullmq.processors.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "./background.types.js";
import type { BackgroundWorkloadAdapter } from "./background.types.js";

export type ManagedBackgroundProcessor = WorkerHost & { queueName: string };

@Injectable()
export class BackgroundProcessorRegistry {
  private readonly logger = new Logger(BackgroundProcessorRegistry.name);
  private registered = false;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    @Inject(ResumeParseProcessor)
    private readonly resumeParse: ResumeParseProcessor,
    @Inject(ResumeSemanticIndexProcessor)
    private readonly resumeSemanticIndex: ResumeSemanticIndexProcessor,
    @Inject(ResumeReviewGenerationProcessor)
    private readonly resumeReviewGeneration: ResumeReviewGenerationProcessor,
    @Inject(MailIngestTriggerProcessor)
    private readonly mailIngestTrigger: MailIngestTriggerProcessor,
    @Inject(MeetingAnswerProcessor)
    private readonly meetingAnswer: MeetingAnswerProcessor,
    @Inject(MeetingPlaybackProcessor)
    private readonly meetingPlayback: MeetingPlaybackProcessor,
    @Inject(MeetingPurgeProcessor)
    private readonly meetingPurge: MeetingPurgeProcessor,
    @Inject(MeetingIntelligenceProcessor)
    private readonly meetingIntelligence: MeetingIntelligenceProcessor,
    @Inject(MeetingTranscriptionProcessor)
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
      worker.on("error", (error: Error) => {
        this.logger.error("Background queue worker error", {
          errorName: error.name,
          queue: processor.queueName,
        });
      });
      void worker.run().catch((error: Error) => {
        this.logger.error("Background queue worker stopped unexpectedly", {
          errorName: error.name,
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
