import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";
import { createClientEnv } from "./client.schema";
import { resolveWebEnvDir } from "./files";
import { createServerEnv } from "./server";

type RuntimeEnv = Record<string, string | undefined>;

function toRuntimeEnv(value: RuntimeEnv) {
  return value;
}

export function validateEnv(runtimeEnv: RuntimeEnv) {
  createServerEnv(runtimeEnv);
  createClientEnv(runtimeEnv);
}

export function loadBuildEnv(mode = "production", envDir = resolveWebEnvDir(mode)) {
  return toRuntimeEnv({
    ...loadEnv(mode, envDir, ""),
    ...process.env,
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  validateEnv(loadBuildEnv(process.env.NODE_ENV ?? "production"));
  console.log("Environment variables are valid.");
}
