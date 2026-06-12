import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";
import { createClientEnv } from "./client.schema";
import { createServerEnv } from "./server";

type RuntimeEnv = Record<string, string | undefined>;

const appRoot = path.resolve(import.meta.dirname, "../..");

export function validateEnv(runtimeEnv: RuntimeEnv) {
  createServerEnv(runtimeEnv);
  createClientEnv(runtimeEnv);
}

export function loadBuildEnv(mode = "production", envDir = appRoot): RuntimeEnv {
  return {
    ...loadEnv(mode, envDir, ""),
    ...process.env,
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  validateEnv(loadBuildEnv(process.env.NODE_ENV ?? "production"));
  console.log("Environment variables are valid.");
}
