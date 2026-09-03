export const STUDIO_RESUME_CHAT_ID_PREFIX = "studio-resume:";

export function isStudioResumeChatId(id: string): boolean {
  return id.startsWith(STUDIO_RESUME_CHAT_ID_PREFIX);
}
