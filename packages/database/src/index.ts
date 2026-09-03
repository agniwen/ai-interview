import { relations } from "@app/db-schema/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

export type PostgresClient = ReturnType<typeof postgres>;

export function createDatabase(client: PostgresClient) {
  return drizzle({ client, relations });
}

export type Database = ReturnType<typeof createDatabase>;
