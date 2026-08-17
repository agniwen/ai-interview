export const BANNED_USER_MESSAGE = "你的账号已被封禁，请联系管理员。";
export const BANNED_USER_REDIRECT_MARKER = "banned";

interface AuthErrorLike {
  code?: string;
  message?: string | null;
}

export function getBannedAuthMessage(message: string | null | undefined): string {
  return message?.trim() && message.trim() !== BANNED_USER_REDIRECT_MARKER
    ? message.trim()
    : BANNED_USER_MESSAGE;
}

export function isBannedAuthError(error: AuthErrorLike): boolean {
  return (
    error.code === "BANNED_USER" ||
    error.message === BANNED_USER_MESSAGE ||
    error.message === BANNED_USER_REDIRECT_MARKER
  );
}
