import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { DatabaseModule } from "../infrastructure/database/database.module.js";
import { RuntimeModule } from "../runtime/runtime.module.js";
import { BackgroundReadinessHealthIndicator } from "./background-readiness-health.indicator.js";
import { DatabaseHealthIndicator } from "./database-health.indicator.js";
import { HealthController } from "./health.controller.js";
import { RuntimeReadinessHealthIndicator } from "./runtime-readiness-health.indicator.js";

@Module({
  controllers: [HealthController],
  imports: [DatabaseModule, RuntimeModule, TerminusModule],
  providers: [
    BackgroundReadinessHealthIndicator,
    DatabaseHealthIndicator,
    RuntimeReadinessHealthIndicator,
  ],
})
export class HealthModule {}
