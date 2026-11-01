import { AsyncLocalStorage } from "node:async_hooks";
import type { Database } from "./index";

/**
 * Ambient database for shared packages. Hosts own connection pools: each process registers
 * its pool with `setDefaultDatabase`, and a call path may override it with `withDatabase`.
 * Package modules import `db` from here instead of importing a host pool.
 */
const databaseStorage = new AsyncLocalStorage<Database>();
let defaultDatabase: Database | undefined;

export function setDefaultDatabase(database: Database | undefined): void {
  defaultDatabase = database;
}

export function withDatabase<Result>(database: Database, operation: () => Result): Result {
  return databaseStorage.run(database, operation);
}

export function bindDatabase<Arguments extends unknown[], Result>(
  database: Database,
  operation: (...args: Arguments) => Result,
): (...args: Arguments) => Result {
  return (...args) => withDatabase(database, () => operation(...args));
}

function requireDatabase(): Database {
  const database = databaseStorage.getStore() ?? defaultDatabase;
  if (!database) {
    throw new Error(
      "Database scope is unavailable. The host must call setDefaultDatabase() or withDatabase().",
    );
  }
  return database;
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

export type { Database };
