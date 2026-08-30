import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadEnvFile } from "dotenv";

const DEFAULT_ENV_MODE = "development";
type EnvironmentValues = Record<string, string | undefined>;

interface EnvFileReadResult {
  knownValues: Map<string, Set<string>>;
  values: EnvironmentValues;
}

export function envFiles(directory: string, mode: string): string[] {
  return [
    `${directory}/.env.${mode}.local`,
    `${directory}/.env.${mode}`,
    `${directory}/.env.local`,
    `${directory}/.env`,
  ];
}

function envPath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

function readEnvFiles(relativePaths: readonly string[]): EnvFileReadResult {
  const knownValues = new Map<string, Set<string>>();
  const values: Record<string, string | undefined> = {};
  for (const relativePath of relativePaths) {
    const fileValues: Record<string, string | undefined> = {};
    loadEnvFile({ path: envPath(relativePath), processEnv: fileValues, quiet: true });
    for (const [key, value] of Object.entries(fileValues)) {
      if (value === undefined) {
        continue;
      }
      const known = knownValues.get(key) ?? new Set<string>();
      known.add(value);
      knownValues.set(key, known);
      values[key] ??= value;
    }
  }
  return { knownValues, values };
}

export function mergeWorkerEnvValues(
  initialEnv: Readonly<EnvironmentValues>,
  webValues: Readonly<EnvironmentValues>,
  workerValues: Readonly<EnvironmentValues>,
  knownFileValues: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const merged = { ...initialEnv };
  for (const [key, value] of Object.entries({ ...webValues, ...workerValues })) {
    const initialValue = initialEnv[key];
    if (initialValue === undefined || knownFileValues.get(key)?.has(initialValue)) {
      merged[key] = value;
    }
  }
  return merged;
}

export function selectEnvFiles(
  currentFiles: readonly string[],
  legacyFiles: readonly string[],
  fileExists: (filePath: string) => boolean = existsSync,
): readonly string[] {
  return currentFiles.some((relativePath) => fileExists(envPath(relativePath)))
    ? currentFiles
    : legacyFiles;
}

export function loadWorkerEnv(mode = process.env.NODE_ENV ?? DEFAULT_ENV_MODE): void {
  const webEnvFiles = selectEnvFiles(
    envFiles("../../web", mode),
    envFiles("../../ai-recruitment-copilot", mode),
  );
  const workerEnvFiles = selectEnvFiles(
    envFiles("..", mode),
    envFiles("../../ai-recruitment-copilot-worker", mode),
  );

  const initialEnv = { ...process.env };
  const web = readEnvFiles(webEnvFiles);
  const worker = readEnvFiles(workerEnvFiles);
  const knownFileValues = new Map(web.knownValues);
  for (const [key, values] of worker.knownValues) {
    const known = knownFileValues.get(key) ?? new Set<string>();
    for (const value of values) {
      known.add(value);
    }
    knownFileValues.set(key, known);
  }
  const merged = mergeWorkerEnvValues(initialEnv, web.values, worker.values, knownFileValues);
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
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

export interface WorkerConnectionSummary {
  databaseUrl: Record<string, string | boolean> | null;
  redisUrl: Record<string, string | boolean> | null;
}

export function getWorkerConnectionSummary(
  env: Record<string, string | undefined> = process.env,
): WorkerConnectionSummary {
  return {
    databaseUrl: summarizeUrl(env.DATABASE_URL),
    redisUrl: summarizeUrl(env.REDIS_URL),
  };
}
