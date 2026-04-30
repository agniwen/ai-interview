export interface ChatMeta {
  jobDescription: string;
  enableThinking: boolean;
}

const DEFAULT_META: ChatMeta = {
  enableThinking: false,
  jobDescription: "",
};

const metas = new Map<string, ChatMeta>();

export function getChatMeta(chatId: string): ChatMeta {
  return metas.get(chatId) ?? DEFAULT_META;
}

export function setChatMeta(chatId: string, meta: ChatMeta): void {
  metas.set(chatId, meta);
}

export function clearChatMeta(chatId: string): void {
  metas.delete(chatId);
}
