export const STUDIO_RESUME_CHAT_ID_PREFIX = "studio-resume:";
export const STUDIO_RESUME_CHAT_EVENT = "studio-resume-chat:open";

export interface StudioResumeChatLaunchDetail {
  recordId: string;
  candidateName: string | null;
}

export function buildStudioResumeChatId({
  recordId,
  userId,
}: {
  recordId: string;
  userId: string;
}): string {
  return `${STUDIO_RESUME_CHAT_ID_PREFIX}${recordId}:user:${userId}`;
}

export function isStudioResumeChatId(id: string): boolean {
  return id.startsWith(STUDIO_RESUME_CHAT_ID_PREFIX);
}

export function openStudioResumeChat(detail: StudioResumeChatLaunchDetail): void {
  window.dispatchEvent(
    new CustomEvent<StudioResumeChatLaunchDetail>(STUDIO_RESUME_CHAT_EVENT, {
      detail,
    }),
  );
}
