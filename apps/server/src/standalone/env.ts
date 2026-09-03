import path from "node:path";
import { config as loadEnvFile } from "dotenv";

const DEFAULT_ENV_MODE = "development";
const serverAppRoot = path.resolve(import.meta.dirname, "../..");

export function envFileNames(mode = DEFAULT_ENV_MODE): string[] {
  return [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"];
}

export function resolveServerEnvDir(mode = process.env.NODE_ENV ?? DEFAULT_ENV_MODE): string {
  void mode;
  return serverAppRoot;
}

export function loadServerEnv(mode = process.env.NODE_ENV ?? DEFAULT_ENV_MODE): void {
  const envDir = resolveServerEnvDir(mode);
  for (const fileName of envFileNames(mode)) {
    loadEnvFile({ path: path.join(envDir, fileName), quiet: true });
  }
}

export function loadStandaloneEnv() {
  loadServerEnv();
}
