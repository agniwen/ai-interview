import { env } from "@/env";

/** Auth / API origin (no trailing slash). */
export function apiBaseUrl(): string {
  return env.VITE_BETTER_AUTH_URL.replace(/\/+$/, "");
}

/**
 * Absolute API URL under the better-auth / Hono origin.
 * e.g. apiUrl("/api/w/foo/studio/resumes")
 */
export function apiUrl(path: string): string {
  const base = apiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
