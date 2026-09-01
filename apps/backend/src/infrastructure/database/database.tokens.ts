import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import { relations } from "@arc/db-schema/relations";

export const API_DATABASE = Symbol("API_DATABASE");
export const API_DATABASE_CONNECTION = Symbol("API_DATABASE_CONNECTION");
export const BACKGROUND_DATABASE = Symbol("BACKGROUND_DATABASE");
export const BACKGROUND_DATABASE_CONNECTION = Symbol("BACKGROUND_DATABASE_CONNECTION");

export function createDatabase(client: ReturnType<typeof postgres>) {
  return drizzle({ client, relations });
}

export type Database = ReturnType<typeof createDatabase>;
