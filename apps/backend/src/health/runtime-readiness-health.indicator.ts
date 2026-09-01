import { Inject, Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { HealthIndicatorResult } from "@nestjs/terminus";

import { RuntimeReadinessService } from "../runtime/runtime-readiness.service.js";

@Injectable()
export class RuntimeReadinessHealthIndicator {
  constructor(
    @Inject(HealthIndicatorService)
    private readonly indicator: HealthIndicatorService,
    @Inject(RuntimeReadinessService)
    private readonly readiness: RuntimeReadinessService,
  ) {}

  check(): HealthIndicatorResult<"runtime"> {
    const runtime = this.indicator.check("runtime");
    return this.readiness.isDraining() ? runtime.down("Backend is draining") : runtime.up();
  }
}
