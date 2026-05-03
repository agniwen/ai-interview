import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "./relations";

type DrizzleDb = ReturnType<typeof createDb>;

function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const client = postgres(process.env.DATABASE_URL);
  return drizzle({ client, relations });
}

let _db: DrizzleDb | undefined;

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    _db ??= createDb();
    return Reflect.get(_db, prop, _db);
  },
}) as DrizzleDb;

export type Database = DrizzleDb;
