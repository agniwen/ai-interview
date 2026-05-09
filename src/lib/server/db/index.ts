import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "./relations";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(process.env.DATABASE_URL);

export const db = drizzle({ client, relations });
export type Database = typeof db;
