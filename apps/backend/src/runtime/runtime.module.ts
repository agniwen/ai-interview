import { Global, Module } from "@nestjs/common";
import { DrainCoordinatorService } from "./drain-coordinator.service.js";
import { HttpDrainService } from "./http-drain.service.js";
import { RuntimeReadinessService } from "./runtime-readiness.service.js";

@Global()
@Module({
  exports: [DrainCoordinatorService, RuntimeReadinessService],
  providers: [DrainCoordinatorService, HttpDrainService, RuntimeReadinessService],
})
export class RuntimeModule {}
