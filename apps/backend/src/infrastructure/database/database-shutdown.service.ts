import { Inject, Injectable } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import type { DatabaseConnection } from "./database-connection.js";
import { API_DATABASE_CONNECTION, BACKGROUND_DATABASE_CONNECTION } from "./database.tokens.js";

@Injectable()
export class DatabaseShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(API_DATABASE_CONNECTION)
    private readonly api: DatabaseConnection,
    @Inject(BACKGROUND_DATABASE_CONNECTION)
    private readonly background: DatabaseConnection,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.background.close(), this.api.close()]);
  }
}
