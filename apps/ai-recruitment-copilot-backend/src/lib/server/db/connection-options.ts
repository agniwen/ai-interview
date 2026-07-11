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
  // Vitest runs multiple fork workers against one Postgres. Keep each worker's
  // pool small so total connections stay roughly maxWorkers * poolMax.
  const isVitest = env.VITEST === "true";
  let defaultMax = 5;
  if (isVitest) {
    defaultMax = 2;
  } else if (isProduction) {
    defaultMax = 10;
  }

  return {
    connect_timeout: readPositiveInteger(env, "POSTGRES_CONNECT_TIMEOUT_SECONDS", 10),
    idle_timeout: readPositiveInteger(env, "POSTGRES_IDLE_TIMEOUT_SECONDS", 60),
    max: readPositiveInteger(env, "POSTGRES_POOL_MAX", defaultMax),
    max_lifetime: readPositiveInteger(env, "POSTGRES_MAX_LIFETIME_SECONDS", 60 * 20),
  };
}
