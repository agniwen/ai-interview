interface SessionAuthContext {
  params?: Record<string, string | undefined>;
  path?: string;
}

export function resolveSessionAuthProviderId(
  context: SessionAuthContext | null | undefined,
): string | null {
  const path = context?.path;
  if (!path) {
    return null;
  }
  if (path.startsWith("/callback/") || path.startsWith("/oauth2/callback/")) {
    const providerId = context.params?.id ?? context.params?.providerId ?? path.split("/").at(-1);
    return providerId?.startsWith(":") ? null : (providerId ?? null);
  }
  if (path === "/sign-in/email") {
    return "credential";
  }
  return null;
}
