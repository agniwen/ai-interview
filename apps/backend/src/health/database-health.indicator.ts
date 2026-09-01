import { Inject, Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { HealthIndicatorResult } from "@nestjs/terminus";

import { BackendConfigService } from "../config/backend-config.service.js";
import type { DatabaseConnection } from "../infrastructure/database/database-connection.js";
import { API_DATABASE_CONNECTION } from "../infrastructure/database/database.tokens.js";

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject(HealthIndicatorService)
    private readonly indicator: HealthIndicatorService,
    @Inject(BackendConfigService) private readonly config: BackendConfigService,
    @Inject(API_DATABASE_CONNECTION) private readonly database: DatabaseConnection,
  ) {}

  async check(): Promise<HealthIndicatorResult<"database">> {
    const database = this.indicator.check("database");
    if (!this.config.get("READINESS_DATABASE_CHECK_ENABLED")) {
      return database.up({ enabled: false });
    }
    return await database.attempt(async () => {
      await this.database.ping();
    });
  }
}
