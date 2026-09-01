import { Inject, Injectable } from "@nestjs/common";
import { DRAIN_ORDER, DrainCoordinatorService } from "../../runtime/drain-coordinator.service.js";
import type { DatabaseConnection } from "./database-connection.js";
import { API_DATABASE_CONNECTION, BACKGROUND_DATABASE_CONNECTION } from "./database.tokens.js";

@Injectable()
export class DatabaseShutdownService {
  constructor(
    @Inject(API_DATABASE_CONNECTION)
    private readonly api: DatabaseConnection,
    @Inject(BACKGROUND_DATABASE_CONNECTION)
    private readonly background: DatabaseConnection,
    @Inject(DrainCoordinatorService) drainCoordinator: DrainCoordinatorService,
  ) {
    drainCoordinator.register({
      drain: async () => {
        await Promise.all([this.background.close(), this.api.close()]);
      },
      name: "database-pools",
      order: DRAIN_ORDER.database,
    });
  }
}
