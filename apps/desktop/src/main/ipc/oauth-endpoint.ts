/** Both operations are initiated first-party in the shared-session OAuth window. */
export function desktopOAuthEndpoint(
  authBaseURL: string,
  mode: "sign-in" | "link" = "sign-in",
): string {
  const base = authBaseURL.replace(/\/+$/, "");
  const authBase = base.endsWith("/api/auth") ? base : `${base}/api/auth`;
  return `${authBase}/${mode === "link" ? "link-social" : "sign-in/social"}`;
}
