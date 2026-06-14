import { fileURLToPath } from "node:url";
import { config as loadEnvFile } from "dotenv";

const WEB_ENV_FILES = [
  "../../ai-recruitment-copilot/.env.local",
  "../../ai-recruitment-copilot/.env",
] as const;

const WORKER_ENV_FILES = ["../.env.local", "../.env"] as const;

function envPath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export function loadWorkerEnv(): void {
  for (const relativePath of [...WEB_ENV_FILES, ...WORKER_ENV_FILES]) {
    loadEnvFile({ path: envPath(relativePath), quiet: true });
  }
}

function summarizeUrl(raw: string | undefined): Record<string, string | boolean> | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return {
      host: url.host,
      pathname: url.pathname || "/",
      protocol: url.protocol,
      usesPassword: Boolean(url.password),
      usesUsername: Boolean(url.username),
    };
  } catch {
    return { invalid: true };
  }
}

export function getWorkerConnectionSummary(
  env: Record<string, string | undefined> = process.env,
): Record<string, Record<string, string | boolean> | null> {
  return {
    databaseUrl: summarizeUrl(env.DATABASE_URL),
    redisUrl: summarizeUrl(env.REDIS_URL),
  };
}
