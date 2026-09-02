import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "@app/db-schema/relations";

type PostgresClient = ReturnType<typeof postgres>;

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const client: PostgresClient = postgres(databaseUrl, {
  connect_timeout: readPositiveInteger("POSTGRES_CONNECT_TIMEOUT_SECONDS", 10),
  idle_timeout: readPositiveInteger("POSTGRES_IDLE_TIMEOUT_SECONDS", 60),
  max: readPositiveInteger("POSTGRES_POOL_MAX", 2),
  max_lifetime: readPositiveInteger("POSTGRES_MAX_LIFETIME_SECONDS", 60 * 20),
});

export const db = drizzle({ client, relations });
export type Database = typeof db;

export async function pingDatabase(): Promise<void> {
  await client`select 1`;
}

export async function closeDatabase(): Promise<void> {
  await client.end();
}
