import type { Database } from "@app/database";

let configuredDatabase: Database | undefined;

export function configureResumeProcessingDatabase(database: Database): void {
  if (configuredDatabase && configuredDatabase !== database) {
    throw new Error("Resume processing database is already configured.");
  }
  configuredDatabase = database;
}

function requireDatabase(): Database {
  if (!configuredDatabase) {
    throw new Error("Resume processing database has not been configured.");
  }
  return configuredDatabase;
}

// SAFETY: The proxy target is never read. Every property access is forwarded to the
// configured Database instance before it can be observed by a caller.
const databaseProxyTarget = {} as Database;

export const db = new Proxy(databaseProxyTarget, {
  get(_target, property) {
    const database = requireDatabase();
    // oxlint-disable-next-line anti-slop/no-reflect-get -- A Proxy trap receives a PropertyKey; forwarding that key is the typed database-injection boundary.
    const value = Reflect.get(database, property, database);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Drizzle exposes both callable methods and data properties through the injected database object.
    return typeof value === "function" ? value.bind(database) : value;
  },
});
