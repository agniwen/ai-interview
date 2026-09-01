import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { BackendConfigModule } from "./config/backend-config.module.js";
import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./infrastructure/database/database.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";
import { RuntimeModule } from "./runtime/runtime.module.js";
import { BackgroundModule } from "./background/background.module.js";
import { MIGRATED_BACKGROUND_WORKLOAD_ADAPTER } from "./background-workloads/index.js";
import { BackgroundInfrastructureModule } from "./background-infrastructure/index.js";
import type { BackgroundWorkloadAdapter } from "./background/background.types.js";
import { CandidateLifecycleModule } from "./domains/candidate-lifecycle/candidate-lifecycle.module.js";
import { IdentityAccessModule } from "./domains/identity-access/identity-access.module.js";
import { JobsModule } from "./domains/jobs/jobs.module.js";
import { MeetingsDomainModule } from "./domains/meetings/meetings-domain.module.js";
import { PlatformOperationsModule } from "./domains/platform-operations/platform-operations.module.js";
import { RecruitingCopilotDomainModule } from "./domains/recruiting-copilot/recruiting-copilot-domain.module.js";
import { RecruitingSetupModule } from "./domains/recruiting-setup/recruiting-setup.module.js";

@Module({
  imports: [
    BackendConfigModule,
    DatabaseModule,
    ObservabilityModule,
    ScheduleModule.forRoot(),
    BackgroundModule.registerAsync({
      imports: [BackgroundInfrastructureModule],
      inject: [MIGRATED_BACKGROUND_WORKLOAD_ADAPTER],
      useFactory(adapter: BackgroundWorkloadAdapter) {
        return adapter;
      },
    }),
    RuntimeModule,
    HealthModule,
    IdentityAccessModule,
    RecruitingSetupModule,
    JobsModule,
    CandidateLifecycleModule,
    MeetingsDomainModule,
    RecruitingCopilotDomainModule,
    PlatformOperationsModule,
  ],
})
export class AppModule {}
