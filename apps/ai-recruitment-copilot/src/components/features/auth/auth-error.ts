export const BANNED_USER_MESSAGE = "你的账号已被封禁，请联系管理员。";
export const BANNED_USER_REDIRECT_MARKER = "banned";

export function getBannedAuthMessage(message: string | null | undefined): string {
  return message?.trim() && message.trim() !== BANNED_USER_REDIRECT_MARKER
    ? message.trim()
    : BANNED_USER_MESSAGE;
}

export function isBannedAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown };
  return (
    maybeError.code === "BANNED_USER" ||
    maybeError.message === BANNED_USER_MESSAGE ||
    maybeError.message === BANNED_USER_REDIRECT_MARKER
  );
}
