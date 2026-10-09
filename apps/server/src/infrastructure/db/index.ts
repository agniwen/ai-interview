import { createDatabase } from "@app/database";
import type { Database } from "@app/database";
import postgres from "postgres";
import { getPostgresConnectionOptions } from "./connection-options";

type PostgresClient = ReturnType<typeof postgres>;

// SAFETY: this module exclusively owns the optional __arcPostgresClient global cache slot,
// and only assigns clients returned by postgres().
const globalForDb = globalThis as typeof globalThis & {
  __arcPostgresClient?: PostgresClient;
};

let localClient: PostgresClient | undefined;
let localDatabase: Database | undefined;

function getClient(): PostgresClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  localClient ??=
    globalForDb.__arcPostgresClient ?? postgres(databaseUrl, getPostgresConnectionOptions());

  // Web dev/HMR can re-evaluate Server modules; keep one pool alive locally.
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arcPostgresClient = localClient;
  }
  return localClient;
}

function getDatabase(): Database {
  localDatabase ??= createDatabase(getClient());
  return localDatabase;
}

// Keep importing pure Server/application modules side-effect free. The Web host owns
// environment loading, so the connection is constructed only when a DB operation runs.
// SAFETY: The empty target is never observed; every property access is forwarded to a real Drizzle Database instance.
const databaseProxyTarget = {} as Database;
export const db = new Proxy(databaseProxyTarget, {
  get(_target, property) {
    const database = getDatabase();
    // oxlint-disable-next-line anti-slop/no-reflect-get -- The proxy must forward arbitrary Drizzle property keys to the lazily created database object.
    const value = Reflect.get(database, property, database);
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Drizzle exposes callable methods and data properties on the same database object.
    return typeof value === "function" ? value.bind(database) : value;
  },
});
export type { Database };

export async function pingDatabase(): Promise<void> {
  await getClient()`select 1`;
}

export async function closeDatabase(): Promise<void> {
  if (!localClient) {
    return;
  }
  await localClient.end();
  if (globalForDb.__arcPostgresClient === localClient) {
    delete globalForDb.__arcPostgresClient;
  }
  localClient = undefined;
  localDatabase = undefined;
}
