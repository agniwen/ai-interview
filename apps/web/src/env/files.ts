import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULT_ENV_MODE = "development";

export const webAppRoot = path.resolve(import.meta.dirname, "../..");
export const legacyWebAppRoot = path.resolve(webAppRoot, "../ai-recruitment-copilot");

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

export function resolveWebEnvDir(mode = DEFAULT_ENV_MODE): string {
  return resolveEnvDir(webAppRoot, legacyWebAppRoot, existsSync, mode);
}

export function webEnvFiles(mode = DEFAULT_ENV_MODE, envDir = resolveWebEnvDir(mode)): string[] {
  return envFileNames(mode).map((fileName) => path.join(envDir, fileName));
}
