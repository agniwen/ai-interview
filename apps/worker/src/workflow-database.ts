import { createDatabase } from "@app/database";
import type { Database } from "@app/database";
import { getPostgresConnectionOptions } from "@app/database/connection-options";
import { setDefaultDatabase } from "@app/database/context";
import postgres from "postgres";

// Shared recruiting workflows (`@app/recruiting-workflows` and the packages it uses) read the
// ambient database from `@app/database/context`. They keep the lazily created pool and pool
// sizing they had while bundled from the Server package; Worker-owned processors use `./db`.
let workflowDatabase: Database | undefined;

function getWorkflowDatabase(): Database {
  if (!workflowDatabase) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set.");
    }
    workflowDatabase = createDatabase(postgres(databaseUrl, getPostgresConnectionOptions()));
  }
  return workflowDatabase;
}

// SAFETY: The empty target is never observed; every property access is forwarded to a real Drizzle Database instance.
const databaseProxyTarget = {} as Database;
const lazyWorkflowDatabase = new Proxy(databaseProxyTarget, {
  get(_target, property) {
    const database = getWorkflowDatabase();
    // oxlint-disable-next-line anti-slop/no-reflect-get -- The proxy must forward arbitrary Drizzle property keys to the lazily created database object.
    const value = Reflect.get(database, property, database);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Drizzle exposes callable methods and data properties on the same database object.
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export function registerWorkflowDatabase(): void {
  setDefaultDatabase(lazyWorkflowDatabase);
}
