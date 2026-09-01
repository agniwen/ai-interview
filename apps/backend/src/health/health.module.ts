import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { BackgroundReadinessHealthIndicator } from "./background-readiness-health.indicator.js";
import { DatabaseHealthIndicator } from "./database-health.indicator.js";
import { HealthController } from "./health.controller.js";
import { RuntimeReadinessHealthIndicator } from "./runtime-readiness-health.indicator.js";

@Module({
  controllers: [HealthController],
  imports: [TerminusModule],
  providers: [
    BackgroundReadinessHealthIndicator,
    DatabaseHealthIndicator,
    RuntimeReadinessHealthIndicator,
  ],
})
export class HealthModule {}
