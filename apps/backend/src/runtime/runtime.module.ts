import { Global, Module } from "@nestjs/common";
import { DrainCoordinatorService } from "./drain-coordinator.service.js";
import { RuntimeReadinessService } from "./runtime-readiness.service.js";

@Global()
@Module({
  exports: [DrainCoordinatorService, RuntimeReadinessService],
  providers: [DrainCoordinatorService, RuntimeReadinessService],
})
export class RuntimeModule {}
