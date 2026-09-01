/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { BackendConfigModule } from "./config/backend-config.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./infrastructure/database/database.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";
import { RuntimeModule } from "./runtime/runtime.module.js";
import { WorkspaceFeaturesModule } from "./features/workspace/workspace-features.module.js";
import { BackgroundModule } from "./background/background.module.js";
import { MIGRATED_BACKGROUND_WORKLOAD_ADAPTER } from "./background-workloads/index.js";
import { BackgroundInfrastructureModule } from "./background-infrastructure/index.js";
import type { BackgroundWorkloadAdapter } from "./background/background.types.js";
import { TopLevelFeaturesModule } from "./features/top-level/top-level-features.module.js";

@Module({
  imports: [
    BackendConfigModule,
    DatabaseModule,
    AuthModule,
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
    WorkspaceFeaturesModule,
    TopLevelFeaturesModule,
  ],
})
export class AppModule {}
