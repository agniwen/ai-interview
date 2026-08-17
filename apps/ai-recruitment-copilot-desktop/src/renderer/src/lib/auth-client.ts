import { genericOAuthClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "@/env";

/**
 * Better Auth browser client for the desktop app (client-only).
 *
 * - baseURL points at the web/backend auth origin (not Electron itself).
 * - Default redirect plugin is disabled so OAuth can open in a controlled
 *   BrowserWindow (shared session cookies) instead of navigating the app shell.
 * - organizationClient is used to resolve the active workspace slug for studio APIs.
 */
export const authClient = createAuthClient({
  baseURL: env.VITE_BETTER_AUTH_URL,
  disableDefaultFetchPlugins: true,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [genericOAuthClient(), organizationClient()],
});

/** Prefer live renderer origin so OAuth callback matches the real Electron port. */
export function desktopAppOrigin(): string {
  const browserWindow = globalThis.window;
  if (browserWindow?.location.origin) {
    return browserWindow.location.origin;
  }
  return env.VITE_BASE_URL.replace(/\/+$/, "");
}

export function authApiOrigin(): string {
  return new URL(env.VITE_BETTER_AUTH_URL).origin;
}

/**
 * Hash-router success landing after Feishu OAuth.
 * Auth BrowserWindow closes when it navigates here.
 */
export function desktopAuthSuccessUrl(): string {
  return `${desktopAppOrigin()}/#/auth/callback`;
}

export function desktopAuthErrorUrl(providerId: string): string {
  return `${desktopAppOrigin()}/#/login?error=${encodeURIComponent(providerId)}`;
}
