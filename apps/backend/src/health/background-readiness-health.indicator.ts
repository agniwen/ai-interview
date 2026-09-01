import { Inject, Injectable, Optional } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { HealthIndicatorResult } from "@nestjs/terminus";

import { BackgroundDiagnosticsService } from "../background/background.diagnostics.js";

type BackgroundFailureReason = "not-ready" | "unavailable";

export type BackgroundReadinessIndicatorResult =
  | HealthIndicatorResult<"background", "up">
  | HealthIndicatorResult<
      "background",
      "down",
      { message: string; reason: BackgroundFailureReason }
    >;

@Injectable()
export class BackgroundReadinessHealthIndicator {
  constructor(
    @Inject(HealthIndicatorService)
    private readonly indicator: HealthIndicatorService,
    @Optional()
    @Inject(BackgroundDiagnosticsService)
    private readonly diagnostics?: BackgroundDiagnosticsService,
  ) {}

  async check(): Promise<BackgroundReadinessIndicatorResult> {
    const background = this.indicator.check("background");
    if (!this.diagnostics) {
      return background.down({
        message: "Background runtime is unavailable",
        reason: "unavailable" as const,
      });
    }
    const issue = await this.diagnostics.getReadinessIssue();
    return issue
      ? background.down({ message: issue, reason: "not-ready" as const })
      : background.up();
  }
}
