export interface PostgresConnectionOptions {
  connect_timeout: number;
  idle_timeout: number;
  max: number;
  max_lifetime: number;
}

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPostgresConnectionOptions(
  env: NodeJS.ProcessEnv = process.env,
): PostgresConnectionOptions {
  const isProduction = env.NODE_ENV === "production";

  return {
    connect_timeout: readPositiveInteger(env, "POSTGRES_CONNECT_TIMEOUT_SECONDS", 10),
    idle_timeout: readPositiveInteger(env, "POSTGRES_IDLE_TIMEOUT_SECONDS", 60),
    max: readPositiveInteger(env, "POSTGRES_POOL_MAX", isProduction ? 10 : 5),
    max_lifetime: readPositiveInteger(env, "POSTGRES_MAX_LIFETIME_SECONDS", 60 * 20),
  };
}
