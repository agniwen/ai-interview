import { loadEnv } from "vite";
import { webAppRoot } from "./files";

export function loadWebProcessEnv(mode: string): string {
  Object.assign(process.env, loadEnv(mode, webAppRoot, ""));
  return webAppRoot;
}
