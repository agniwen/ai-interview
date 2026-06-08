import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "@arc/db-schema/relations";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

function getPoolMax(): number {
  const fallback = process.env.NODE_ENV === "production" ? 10 : 5;
  const raw = process.env.POSTGRES_POOL_MAX;
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type PostgresClient = ReturnType<typeof postgres>;

const globalForDb = globalThis as typeof globalThis & {
  __arcPostgresClient?: PostgresClient;
};

const client =
  globalForDb.__arcPostgresClient ??
  postgres(process.env.DATABASE_URL, {
    max: getPoolMax(),
  });

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
