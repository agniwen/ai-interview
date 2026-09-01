import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable } from "@nestjs/common";
import { API_DATABASE } from "./database.tokens.js";
import type { Database } from "./database.tokens.js";

export type ApiDatabaseExecutor = Omit<Database, "$client">;

@Injectable()
export class ApiDatabaseUnitOfWork {
  private readonly context = new AsyncLocalStorage<ApiDatabaseExecutor>();

  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  current(): ApiDatabaseExecutor {
    return this.context.getStore() ?? this.database;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) {
      return work();
    }
    return this.database.transaction((transaction) => this.context.run(transaction, work));
  }
}
