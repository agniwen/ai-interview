import { PostgresStore } from "@mastra/pg";

const MASTRA_STORAGE_ID = "arc-mastra-storage";
const DEFAULT_MASTRA_POSTGRES_SCHEMA = "mastra";

type EnvLike = Record<string, string | undefined>;

export interface CreateMastraStorageOptions {
  env?: EnvLike;
  connectionString?: string;
  schemaName?: string;
  disableInit?: boolean;
}

// SAFETY: this module exclusively owns the optional __arcMastraStorage global cache slot,
// and only assigns PostgresStore instances created by createMastraStorage.
const globalForMastraStorage = globalThis as typeof globalThis & {
  __arcMastraStorage?: PostgresStore;
};

function readEnv(env: EnvLike, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function getMastraSchemaName(env: EnvLike, explicitSchemaName?: string): string {
  return (
    explicitSchemaName?.trim() ||
    readEnv(env, "MASTRA_POSTGRES_SCHEMA") ||
    DEFAULT_MASTRA_POSTGRES_SCHEMA
  );
}

function getMastraConnectionString(env: EnvLike, explicitConnectionString?: string): string {
  const connectionString = explicitConnectionString?.trim() || readEnv(env, "DATABASE_URL");

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured for Mastra storage.");
  }

  return connectionString;
}

export function createMastraStorage({
  env = process.env,
  connectionString,
  schemaName,
  disableInit,
}: CreateMastraStorageOptions = {}): PostgresStore {
  return new PostgresStore({
    connectionString: getMastraConnectionString(env, connectionString),
    disableInit,
    id: MASTRA_STORAGE_ID,
    schemaName: getMastraSchemaName(env, schemaName),
  });
}

export function getMastraStorage(): PostgresStore {
  if (!globalForMastraStorage.__arcMastraStorage) {
    globalForMastraStorage.__arcMastraStorage = createMastraStorage();
  }

  return globalForMastraStorage.__arcMastraStorage;
}

export const storage = getMastraStorage();
