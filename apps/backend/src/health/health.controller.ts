import {
  Controller,
  Get,
  Inject,
  Optional,
  SerializeOptions,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { RuntimeReadinessService } from "../runtime/runtime-readiness.service.js";
import { BACKGROUND_LIFECYCLE } from "../background/background.lifecycle.js";
import type { BackgroundLifecycle } from "../background/background.lifecycle.js";
import { BackendConfigService } from "../config/backend-config.service.js";
import { API_DATABASE_CONNECTION } from "../infrastructure/database/database.tokens.js";
import type { DatabaseConnection } from "../infrastructure/database/database-connection.js";

const healthResponseSchema = z.object({ ok: z.literal(true) });
@ApiTags("health")
@Controller()
export class HealthController {
  private readonly healthyResponse = { ok: true } as const;

  constructor(
    @Inject(BackendConfigService) private readonly config: BackendConfigService,
    @Inject(API_DATABASE_CONNECTION) private readonly database: DatabaseConnection,
    @Inject(RuntimeReadinessService) private readonly readiness: RuntimeReadinessService,
    @Optional() @Inject(BACKGROUND_LIFECYCLE) private readonly background?: BackgroundLifecycle,
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
    if (this.readiness.isDraining()) {
      throw new ServiceUnavailableException("Backend is draining", {
        errorCode: "BACKEND_DRAINING",
      });
    }
    await this.assertDatabaseReady();
    return { ok: true } as const;
  }

  @Get("readyz")
  @ApiOperation({ operationId: "getWorkerReadiness" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 503 })
  @SerializeOptions({ schema: healthResponseSchema })
  async getWorkerReadiness() {
    if (process.env.BACKGROUND_WORKERS_ENABLED === "false") {
      throw new ServiceUnavailableException("Background workers are disabled", {
        errorCode: "BACKGROUND_WORKERS_DISABLED",
      });
    }
    if (this.readiness.isDraining()) {
      throw new ServiceUnavailableException("Backend is draining", {
        errorCode: "BACKEND_DRAINING",
      });
    }
    await this.assertDatabaseReady();
    if (!this.background) {
      throw new ServiceUnavailableException("Background runtime is unavailable", {
        errorCode: "BACKGROUND_RUNTIME_UNAVAILABLE",
      });
    }
    const snapshot = this.background.getSnapshot();
    if (!snapshot.ready) {
      throw new ServiceUnavailableException("Background runtime is not ready", {
        errorCode: "BACKGROUND_RUNTIME_NOT_READY",
      });
    }
    return { ok: true } as const;
  }

  private async assertDatabaseReady(): Promise<void> {
    const explicit = process.env.READINESS_DATABASE_CHECK_ENABLED?.trim().toLowerCase();
    if (explicit === "false") {
      return;
    }
    if (explicit !== "true" && this.config.get("NODE_ENV") !== "production") {
      return;
    }
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException("Database is unavailable", {
        errorCode: "DATABASE_UNAVAILABLE",
      });
    }
  }
}
