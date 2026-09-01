import {
  Controller,
  Get,
  Inject,
  SerializeOptions,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HealthCheckService } from "@nestjs/terminus";
import type { HealthIndicatorFunction } from "@nestjs/terminus";
import { z } from "zod";
import { BackendConfigService } from "../config/backend-config.service.js";
import { BackgroundReadinessHealthIndicator } from "./background-readiness-health.indicator.js";
import { DatabaseHealthIndicator } from "./database-health.indicator.js";
import { RuntimeReadinessHealthIndicator } from "./runtime-readiness-health.indicator.js";

const healthResponseSchema = z.object({ ok: z.literal(true) });
@ApiTags("health")
@Controller()
export class HealthController {
  private readonly healthyResponse = { ok: true } as const;

  constructor(
    @Inject(BackendConfigService) private readonly config: BackendConfigService,
    @Inject(HealthCheckService) private readonly healthChecks: HealthCheckService,
    @Inject(DatabaseHealthIndicator)
    private readonly databaseHealth: DatabaseHealthIndicator,
    @Inject(RuntimeReadinessHealthIndicator)
    private readonly runtimeHealth: RuntimeReadinessHealthIndicator,
    @Inject(BackgroundReadinessHealthIndicator)
    private readonly backgroundHealth: BackgroundReadinessHealthIndicator,
  ) {}

  @Get("api/health")
  @ApiOperation({ operationId: "getApiHealth" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: healthResponseSchema })
  getApiHealth() {
    return this.healthyResponse;
  }

  @Get("healthz")
  @ApiOperation({ operationId: "getWorkerHealth" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: healthResponseSchema })
  getWorkerHealth() {
    return this.healthyResponse;
  }

  @Get("api/ready")
  @ApiOperation({ operationId: "getApiReadiness" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 503 })
  @SerializeOptions({ schema: healthResponseSchema })
  async getApiReadiness() {
    await this.assertHealthy(
      () => this.runtimeHealth.check(),
      () =>
        new ServiceUnavailableException("Backend is draining", {
          errorCode: "BACKEND_DRAINING",
        }),
    );
    await this.assertHealthy(
      () => this.databaseHealth.check(),
      () =>
        new ServiceUnavailableException("Database is unavailable", {
          errorCode: "DATABASE_UNAVAILABLE",
        }),
    );
    return { ok: true } as const;
  }

  @Get("readyz")
  @ApiOperation({ operationId: "getWorkerReadiness" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 503 })
  @SerializeOptions({ schema: healthResponseSchema })
  async getWorkerReadiness() {
    if (!this.config.get("BACKGROUND_WORKERS_ENABLED")) {
      throw new ServiceUnavailableException("Background workers are disabled", {
        errorCode: "BACKGROUND_WORKERS_DISABLED",
      });
    }
    await this.assertHealthy(
      () => this.runtimeHealth.check(),
      () =>
        new ServiceUnavailableException("Backend is draining", {
          errorCode: "BACKEND_DRAINING",
        }),
    );
    await this.assertHealthy(
      () => this.databaseHealth.check(),
      () =>
        new ServiceUnavailableException("Database is unavailable", {
          errorCode: "DATABASE_UNAVAILABLE",
        }),
    );
    const background = await this.backgroundHealth.check();
    await this.assertHealthy(
      () => background,
      () => {
        const details = background.background;
        if ("reason" in details && details.reason === "unavailable") {
          return new ServiceUnavailableException("Background runtime is unavailable", {
            errorCode: "BACKGROUND_RUNTIME_UNAVAILABLE",
          });
        }
        return new ServiceUnavailableException(
          "message" in details ? details.message : "Background workers are not ready",
          { errorCode: "BACKGROUND_RUNTIME_NOT_READY" },
        );
      },
    );
    return { ok: true } as const;
  }

  private async assertHealthy(
    check: HealthIndicatorFunction,
    failure: () => ServiceUnavailableException,
  ): Promise<void> {
    try {
      await this.healthChecks.check([check]);
    } catch {
      throw failure();
    }
  }
}
