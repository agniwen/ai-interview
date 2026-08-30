import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadEnvFile } from "dotenv";

const DEFAULT_ENV_MODE = "development";
const serverAppRoot = path.resolve(import.meta.dirname, "../..");
const appsRoot = path.dirname(serverAppRoot);
type FileExists = (filePath: string) => boolean;

export function envFileNames(mode = DEFAULT_ENV_MODE): string[] {
  return [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"];
}

function hasEnvFile(directory: string, mode: string, fileExists: FileExists): boolean {
  return envFileNames(mode).some((fileName) => fileExists(path.join(directory, fileName)));
}

export function resolveEnvDir(
  currentRoot: string,
  legacyRoot: string,
  fileExists: FileExists = existsSync,
  mode = DEFAULT_ENV_MODE,
): string {
  if (hasEnvFile(currentRoot, mode, fileExists) || !hasEnvFile(legacyRoot, mode, fileExists)) {
    return currentRoot;
  }
  return legacyRoot;
}

function resolveAppEnvDir(currentName: string, legacyName: string, mode: string): string {
  const currentRoot = path.join(appsRoot, currentName);
  const legacyRoot = path.join(appsRoot, legacyName);
  return resolveEnvDir(currentRoot, legacyRoot, existsSync, mode);
}

export function resolveServerEnvDir(mode = process.env.NODE_ENV ?? DEFAULT_ENV_MODE): string {
  return resolveAppEnvDir("server", "ai-recruitment-copilot-backend", mode);
}

function loadAppEnv(currentName: string, legacyName: string, mode: string): void {
  const envDir = resolveAppEnvDir(currentName, legacyName, mode);
  for (const fileName of envFileNames(mode)) {
    loadEnvFile({ path: path.join(envDir, fileName), quiet: true });
  }
}

export function loadServerEnv(mode = process.env.NODE_ENV ?? DEFAULT_ENV_MODE): void {
  const envDir = resolveServerEnvDir(mode);
  for (const fileName of envFileNames(mode)) {
    loadEnvFile({ path: path.join(envDir, fileName), quiet: true });
  }
}

export function loadWebEnv(mode = process.env.NODE_ENV ?? DEFAULT_ENV_MODE): void {
  loadAppEnv("web", "ai-recruitment-copilot", mode);
}

export function loadStandaloneEnv() {
  loadServerEnv();
}
