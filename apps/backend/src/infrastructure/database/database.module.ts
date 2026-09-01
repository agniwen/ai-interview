import { Global, Module } from "@nestjs/common";
import postgres from "postgres";
import { BackendConfigService } from "../../config/backend-config.service.js";
import { DatabaseConnection } from "./database-connection.js";
import { DatabaseShutdownService } from "./database-shutdown.service.js";
import {
  API_DATABASE,
  API_DATABASE_CONNECTION,
  BACKGROUND_DATABASE,
  BACKGROUND_DATABASE_CONNECTION,
  createDatabase,
} from "./database.tokens.js";

function connectionOptions(config: BackendConfigService, max: number) {
  return {
    connect_timeout: config.get("POSTGRES_CONNECT_TIMEOUT_SECONDS"),
    idle_timeout: config.get("POSTGRES_IDLE_TIMEOUT_SECONDS"),
    max,
    max_lifetime: config.get("POSTGRES_MAX_LIFETIME_SECONDS"),
  };
}

@Global()
@Module({
  exports: [
    API_DATABASE,
    API_DATABASE_CONNECTION,
    BACKGROUND_DATABASE,
    BACKGROUND_DATABASE_CONNECTION,
  ],
  providers: [
    {
      inject: [BackendConfigService],
      provide: API_DATABASE_CONNECTION,
      useFactory(config: BackendConfigService) {
        const client = postgres(
          config.get("DATABASE_URL"),
          connectionOptions(config, config.get("POSTGRES_POOL_MAX") ?? 10),
        );
        return new DatabaseConnection(client);
      },
    },
    {
      inject: [API_DATABASE_CONNECTION],
      provide: API_DATABASE,
      useFactory(connection: DatabaseConnection) {
        return createDatabase(connection.client);
      },
    },
    {
      inject: [BackendConfigService],
      provide: BACKGROUND_DATABASE_CONNECTION,
      useFactory(config: BackendConfigService) {
        const client = postgres(
          config.get("DATABASE_URL"),
          connectionOptions(config, config.get("POSTGRES_BACKGROUND_POOL_MAX") ?? 5),
        );
        return new DatabaseConnection(client);
      },
    },
    {
      inject: [BACKGROUND_DATABASE_CONNECTION],
      provide: BACKGROUND_DATABASE,
      useFactory(connection: DatabaseConnection) {
        return createDatabase(connection.client);
      },
    },
    DatabaseShutdownService,
  ],
})
export class DatabaseModule {}
