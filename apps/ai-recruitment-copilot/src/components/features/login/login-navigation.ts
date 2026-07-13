export type LoginGotoTarget = "agent" | "studio";

interface LoginDestinationInput {
  callbackURL?: string;
  goto?: LoginGotoTarget;
  returnTo?: string;
}

export function readLoginGoto(value: unknown): LoginGotoTarget | undefined {
  return value === "agent" || value === "studio" ? value : undefined;
}

function sanitizeCallbackURL(raw: string | undefined): string {
  if (!raw?.startsWith("/")) {
    return "/";
  }
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}

export function resolveLoginCallbackURL({
  callbackURL,
  goto,
  returnTo,
}: LoginDestinationInput): string {
  if (goto) {
    return `/?goto=${goto}`;
  }
  return sanitizeCallbackURL(callbackURL ?? returnTo);
}
