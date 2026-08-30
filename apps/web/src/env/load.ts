import { config as loadEnvFile } from "dotenv";
import { resolveWebEnvDir, webEnvFiles } from "./files";

interface LoadEnvFileChainOptions {
  replacePreloaded?: boolean;
  processEnv?: Record<string, string | undefined>;
}

export function loadEnvFileChain(
  envFiles: readonly string[],
  options: LoadEnvFileChainOptions = {},
): void {
  const processEnv = options.processEnv ?? process.env;
  if (!options.replacePreloaded) {
    for (const envFile of envFiles) {
      loadEnvFile({ path: envFile, processEnv, quiet: true });
    }
    return;
  }

  const knownFileValues = new Map<string, Set<string>>();
  const mergedFileValues: Record<string, string | undefined> = {};
  for (const envFile of envFiles) {
    const fileValues: Record<string, string | undefined> = {};
    loadEnvFile({
      path: envFile,
      processEnv: fileValues,
      quiet: true,
    });
    for (const [key, value] of Object.entries(fileValues)) {
      if (value === undefined) {
        continue;
      }
      const known = knownFileValues.get(key) ?? new Set<string>();
      known.add(value);
      knownFileValues.set(key, known);
      mergedFileValues[key] ??= value;
    }
  }

  for (const [key, value] of Object.entries(mergedFileValues)) {
    const existingValue = processEnv[key];
    if (existingValue === undefined || knownFileValues.get(key)?.has(existingValue)) {
      processEnv[key] = value;
    }
  }
}

export function loadWebProcessEnv(mode: string, options: LoadEnvFileChainOptions = {}): string {
  const envDir = resolveWebEnvDir(mode);
  loadEnvFileChain(webEnvFiles(mode, envDir), options);
  return envDir;
}
