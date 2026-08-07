import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "@/env";

/**
 * Better Auth browser client for the desktop app (client-only).
 *
 * - baseURL points at the web/backend auth origin (not Electron itself).
 * - Default redirect plugin is disabled so OAuth can open in a controlled
 *   BrowserWindow (shared session cookies) instead of navigating the app shell.
 */
export const authClient = createAuthClient({
  baseURL: env.VITE_BETTER_AUTH_URL,
  disableDefaultFetchPlugins: true,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [genericOAuthClient()],
});

/** Absolute URL for better-auth callbackURL / errorCallbackURL fields. */
export function toAbsoluteAppUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base = env.VITE_BASE_URL.replace(/\/+$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

/**
 * Hash-router friendly success landing used after Feishu OAuth.
 * Auth BrowserWindow closes when it navigates here; main shell stays put.
 */
export function desktopAuthSuccessUrl(): string {
  // electron-vite dev: http://localhost:5173/#/auth/callback
  // Keep hash so createHashHistory can parse it if the shell ever loads it.
  return `${env.VITE_BASE_URL.replace(/\/+$/, "")}/#/auth/callback`;
}

export function desktopAuthErrorUrl(providerId: string): string {
  return toAbsoluteAppUrl(`/#/login?error=${encodeURIComponent(providerId)}`);
}
