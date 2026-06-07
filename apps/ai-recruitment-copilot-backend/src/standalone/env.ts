import path from "node:path";
import { config as loadEnvFile } from "dotenv";

const appRoot = path.resolve(import.meta.dirname, "../..");

export function loadStandaloneEnv() {
  for (const envPath of [path.join(appRoot, ".env.local"), path.join(appRoot, ".env")]) {
    loadEnvFile({ path: envPath, quiet: true });
  }
}
