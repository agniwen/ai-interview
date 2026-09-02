import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "@app/db-schema/relations";
import { getPostgresConnectionOptions } from "./connection-options";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

type PostgresClient = ReturnType<typeof postgres>;

// SAFETY: this module exclusively owns the optional __arcPostgresClient global cache slot,
// and only assigns clients returned by postgres().
const globalForDb = globalThis as typeof globalThis & {
  __arcPostgresClient?: PostgresClient;
};

const client =
  globalForDb.__arcPostgresClient ??
  postgres(process.env.DATABASE_URL, getPostgresConnectionOptions());

// Next dev/HMR can re-evaluate server modules; keep one pool alive locally.
if (process.env.NODE_ENV !== "production") {
  globalForDb.__arcPostgresClient = client;
}

export const db = drizzle({ client, relations });
export type Database = typeof db;

export async function pingDatabase(): Promise<void> {
  await client`select 1`;
}

export async function closeDatabase(): Promise<void> {
  await client.end();
  if (globalForDb.__arcPostgresClient === client) {
    delete globalForDb.__arcPostgresClient;
  }
}
