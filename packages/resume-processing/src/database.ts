import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "@app/database";

const databaseStorage = new AsyncLocalStorage<Database>();

export function withResumeProcessingDatabase<Result>(
  database: Database,
  operation: () => Result,
): Result {
  return databaseStorage.run(database, operation);
}

function requireDatabase(): Database {
  const database = databaseStorage.getStore();
  if (!database) {
    throw new Error("Resume processing database scope is unavailable.");
  }
  return database;
}

export function bindResumeProcessingDatabase<Arguments extends unknown[], Result>(
  database: Database,
  operation: (...args: Arguments) => Result,
): (...args: Arguments) => Result {
  return (...args) => withResumeProcessingDatabase(database, () => operation(...args));
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
