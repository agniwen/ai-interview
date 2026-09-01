/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes discovered through decorator metadata. */
import { Global, Module } from "@nestjs/common";
import type { DynamicModule, ModuleMetadata, Provider } from "@nestjs/common";
import {
  BackgroundDiagnosticsController,
  WorkerDiagnosticsGuard,
} from "./background.controller.js";
import { BackgroundDiagnosticsService } from "./background.diagnostics.js";
import { BACKGROUND_LIFECYCLE, BackgroundLifecycleService } from "./background.lifecycle.js";
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
import { BackgroundProcessorRegistry } from "./background.processors.js";
import { BackgroundRecoveryService } from "./background.recovery.js";
import { BackgroundQueueModule } from "./background-queue.module.js";
import {
  InterviewNotificationSchedulerService,
  MailIngestSchedulerService,
} from "../domains/candidate-lifecycle/workloads/schedulers/candidate.schedulers.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "./background.types.js";
import type { BackgroundModuleAsyncOptions, BackgroundModuleOptions } from "./background.types.js";

const BACKGROUND_PROVIDERS: Provider[] = [
  ResumeParseProcessor,
  ResumeSemanticIndexProcessor,
  ResumeReviewGenerationProcessor,
  MailIngestTriggerProcessor,
  MeetingAnswerProcessor,
  MeetingPlaybackProcessor,
  MeetingPurgeProcessor,
  MeetingIntelligenceProcessor,
  MeetingTranscriptionProcessor,
  BackgroundProcessorRegistry,
  BackgroundRecoveryService,
  MailIngestSchedulerService,
  InterviewNotificationSchedulerService,
  BackgroundDiagnosticsService,
  WorkerDiagnosticsGuard,
  BackgroundLifecycleService,
  { provide: BACKGROUND_LIFECYCLE, useExisting: BackgroundLifecycleService },
];

@Global()
@Module({})
export class BackgroundModule {
  static register(options: BackgroundModuleOptions): DynamicModule {
    return this.build({ provide: BACKGROUND_WORKLOAD_ADAPTER, useValue: options.adapter });
  }

  static registerAsync(options: BackgroundModuleAsyncOptions): DynamicModule {
    return this.build(
      {
        inject: options.inject ?? [],
        provide: BACKGROUND_WORKLOAD_ADAPTER,
        useFactory: options.useFactory,
      },
      options.imports ?? [],
    );
  }

  private static build(
    adapterProvider: Provider,
    adapterImports: NonNullable<ModuleMetadata["imports"]> = [],
  ): DynamicModule {
    return {
      controllers: [BackgroundDiagnosticsController],
      exports: [
        BACKGROUND_LIFECYCLE,
        BackgroundDiagnosticsService,
        BackgroundQueueModule,
        MailIngestSchedulerService,
      ],
      imports: [...adapterImports, BackgroundQueueModule],
      module: BackgroundModule,
      providers: [adapterProvider, ...BACKGROUND_PROVIDERS],
    };
  }
}
