import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { relations } from './relations';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle({ client, schema, relations });
export type Database = typeof db;
